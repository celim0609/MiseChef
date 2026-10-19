import { HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import {
  buildOrderItems,
  createAvailableOrderReference,
  readString,
  getValidPickupDates,
  getPickupTimeSlots,
} from "./storePaymentsCore.js";
import { loadStoreCheckoutData } from "./storePayments.js";
import { assertOperator } from "./externalPosOrders.js";
import { productAllowsFulfilmentDate } from "./storeProductAvailability.js";
import {
  validCalendarDate,
  isFullWeekSelection,
  getWeeklyDates,
  WEEKLY_DAYS,
  resolvePlanMeal,
  weeklyMealSnapshot,
  hasEmbeddedMenu,
  validateWeeklyMealPlan,
  validateHealthyLunchDay,
  hasDatedMenu,
  isDatedWeekOpen,
  isHealthyLunchWeekBlocked,
} from "./storeWeeklyMealPlan.js";
import {
  mergeMealOptionSnapshots,
  resolveSelectionMealOptions,
} from "./healthyLunchOptions.js";
const fail = (message) => {
  throw new HttpsError("failed-precondition", message);
};
const text = (value, max, required = false) => {
  const result = readString(value);
  if ((required && !result) || result.length > max)
    fail("Enter valid customer and item details.");
  return result;
};
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const malaysiaDate = (now = new Date()) =>
  new Date(now.getTime() + 28800000).toISOString().slice(0, 10);
export function buildManualOrder(input, checkout, now = new Date()) {
  if (!["whatsapp", "phone", "walk_in", "other"].includes(input.source))
    fail("Choose a manual order source.");
  if (
    !Array.isArray(input.lines) ||
    !input.lines.length ||
    input.lines.length > 50
  )
    fail("Choose 1–50 items.");
  const items = [];
  const days = new Map();
  const privateItems = [];
  const add = (line, date, allocation) => {
    if (!validCalendarDate(date) || date <= malaysiaDate(now))
      fail("Preorders require at least one Malaysia calendar day in advance.");
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(line.time) ||
      !["pickup", "delivery"].includes(line.method)
    )
      fail("Choose a valid fulfilment time and method.");
    // Manual delivery is customer-arranged. Never book or quote Lalamove here.
    if (
      line.method === "pickup" &&
      !getPickupTimeSlots(checkout.store, date, now).includes(line.time)
    )
      fail("Choose an available pickup time.");
    if (!getValidPickupDates(checkout.store, now).includes(date))
      fail("Choose an available Store date.");
    const key = `${date}_${line.time.replace(":", "")}_${line.method}`;
    const entry = days.get(key) || {
      id: `manual_${key}`,
      date,
      time: line.time,
      method: line.method,
      pickupLocationId:
        line.method === "pickup"
          ? checkout.store.pickupLocations?.[0]?.id || ""
          : "",
      pickupLocationName:
        line.method === "delivery"
          ? "Customer-arranged delivery"
          : checkout.store.pickupLocations?.[0]?.name || "",
      pickupLocationAddress:
        line.method === "pickup"
          ? checkout.store.pickupLocations?.[0]?.address || ""
          : "",
      notes: text(line.deliveryAddress, 500),
      allocations: [],
    };
    if (entry.notes !== text(line.deliveryAddress, 500))
      fail("Use one delivery address per schedule.");
    if (line.method === "delivery" && !entry.notes)
      fail("Enter the delivery address.");
    entry.allocations.push(allocation);
    days.set(key, entry);
  };
  for (const line of input.lines) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20
    )
      fail("Quantity must be 1–20.");
    const index = items.length;
    let item;
    if (line.custom) {
      const name = text(line.custom.name, 120, true);
      const price = line.custom.unitPrice;
      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 100000 ||
        money(price) !== price
      )
        fail("Enter a valid custom unit price with at most two decimals.");
      item = {
        itemType: "custom",
        productId: "",
        productName: name,
        photoUrl: "",
        quantity: line.quantity,
        basePrice: price,
        unitPrice: price,
        lineTotal: money(price * line.quantity),
        selectedOptions: [],
      };
      if (line.custom.savePrivate === true)
        privateItems.push({
          name,
          unitPrice: price,
          notes: text(line.notes, 500),
        });
    } else {
      const selection = { ...line.selection, quantity: line.quantity };
      // Prices and item snapshots come exclusively from the current server catalog.
      validateHealthyLunchDay(
        selection,
        checkout.products,
        line.date,
        checkout.store.workspaceId || checkout.store.id,
      );
      [item] = buildOrderItems(
        [selection],
        checkout.products,
        checkout.optionGroups,
        checkout.sets,
        line.date,
      );
      if (isFullWeekSelection(selection, checkout.products)) {
        const plan = checkout.products.find(
          (p) => p.id === selection.productId,
        );
        if (
          hasDatedMenu(plan) &&
          (!isDatedWeekOpen(checkout.store, line.date, now) ||
            isHealthyLunchWeekBlocked(plan, line.date))
        )
          fail("This weekly plan is closed or unavailable.");
        const invalid = validateWeeklyMealPlan(
          plan,
          checkout.products,
          checkout.store.workspaceId || checkout.store.id,
          line.date,
        );
        if (invalid) fail(invalid);
        if (getWeeklyDates(line.date).length !== 5)
          fail("Weekly plans must start on a valid Monday.");
        const meals = WEEKLY_DAYS.map((day) =>
          weeklyMealSnapshot(
            resolvePlanMeal(plan, checkout.products, line.date, day),
            day,
            hasEmbeddedMenu(plan),
          ),
        );
        item.weeklyPlanSnapshot = mergeMealOptionSnapshots(
          { meals, startMonday: line.date },
          resolveSelectionMealOptions(selection, checkout.products, line.date),
        );
        getWeeklyDates(line.date).forEach((date, i) =>
          add(line, date, {
            itemIndex: index,
            quantity: line.quantity,
            componentDay: WEEKLY_DAYS[i],
          }),
        );
      } else {
        const productIds = item.setSnapshot
          ? item.setSnapshot.selectedGroups.map((g) => g.productId)
          : [item.productId];
        if (
          !selection.healthyLunchDate &&
          productIds.some(
            (id) =>
              !productAllowsFulfilmentDate(
                checkout.products.find((p) => p.id === id) || {},
                line.date,
              ),
          )
        )
          fail("This item is unavailable on that day.");
        add(line, line.date, { itemIndex: index, quantity: line.quantity });
      }
    }
    if (line.custom)
      add(line, line.date, { itemIndex: index, quantity: line.quantity });
    item.notes = text(line.notes, 500);
    items.push(item);
  }
  const total = money(items.reduce((n, item) => n + item.lineTotal, 0));
  if (total <= 0 || total > 1000000)
    fail("Enter a valid positive order total.");
  return {
    items,
    fulfilments: [...days.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    ),
    total,
    customerName: text(input.customerName, 120, true),
    phone: text(input.phone, 40),
    notes: text(input.notes, 500),
    privateItems,
  };
}

export async function saveManualPosOrder({
  db,
  uid,
  input,
  now = new Date(),
  loadCheckout = loadStoreCheckoutData,
}) {
  if (!uid)
    throw new HttpsError(
      "unauthenticated",
      "Sign in to create a manual order.",
    );
  const checkout = await loadCheckout(db, input?.slug);
  const workspaceId = readString(checkout.store.workspaceId);
  const storeId = readString(checkout.store.id) || workspaceId;
  if (input.workspaceId !== workspaceId || input.storeId !== storeId)
    throw new HttpsError("permission-denied", "Store ownership mismatch.");
  await assertOperator({ db, uid, workspaceId });
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId || ""))
    fail("A stable request ID is required.");
  const built = buildManualOrder(input, checkout, now);
  const referenceId = createHash("sha256")
    .update(`${workspaceId}:${uid}:${input.requestId}`)
    .digest("hex");
  const requestRef = db.collection("storeManualOrderRequests").doc(referenceId);
  const orderRef = input.orderId
    ? db.collection("storeOrders").doc(text(input.orderId, 150, true))
    : db.collection("storeOrders").doc();
  return db.runTransaction(async (tx) => {
    await assertOperator({ db, uid, workspaceId, transaction: tx });
    const request = await tx.get(requestRef);
    if (request.exists)
      return { orderId: request.data().orderId, duplicate: true };
    const existing = input.orderId ? await tx.get(orderRef) : null;
    const previous = existing?.data();
    if (
      input.orderId &&
      (!previous ||
        previous.workspaceId !== workspaceId ||
        !previous.manualOrder ||
        previous.payment.status !== "pending" ||
        previous.fulfilmentStatus !== "New")
    )
      fail("Only pending manual orders can be edited.");
    if (previous && input.expectedRevision !== previous.manualOrder.revision)
      fail("This order changed. Reload before editing.");
    const reference =
      previous ||
      (await createAvailableOrderReference({
        date: now,
        exists: async ({ orderNumber, pickupCode, businessDateKey }) => {
          const [reserved, matches] = await Promise.all([
            tx.get(
              db
                .collection("stores")
                .doc(storeId)
                .collection("orderNumberReservations")
                .doc(`${businessDateKey}_${pickupCode}`),
            ),
            tx.get(
              db
                .collection("storeOrders")
                .where("storeId", "==", storeId)
                .where("orderNumber", "==", orderNumber)
                .limit(1),
            ),
          ]);
          return reserved.exists || !matches.empty;
        },
      }));
    const { privateItems, ...snapshot } = built;
    const at = now.toISOString();
    const currency = checkout.store.currency || "MYR";
    const order = {
      ...snapshot,
      id: orderRef.id,
      storeId,
      workspaceId,
      storeName: checkout.store.name,
      currency,
      orderNumber: reference.orderNumber,
      pickupCode: reference.pickupCode,
      orderSource: "pos",
      externalOrder: { source: input.source },
      manualOrder: {
        revision: (previous?.manualOrder.revision || 0) + 1,
        draft: {
          source: input.source,
          customerName: built.customerName,
          phone: built.phone,
          notes: built.notes,
          lines: input.lines,
        },
        createdBy: previous?.manualOrder.createdBy || uid,
      },
      fulfilmentMethod: built.fulfilments.every(
        (day) => day.method === "delivery",
      )
        ? "delivery"
        : "pickup",
      fulfilmentStatus: "New",
      fulfilmentCompletion: {},
      fulfilmentOperations: {},
      itemCount: built.items.reduce((n, item) => n + item.quantity, 0),
      totals: {
        merchandiseSubtotal: built.total,
        discountTotal: 0,
        discountedMerchandiseTotal: built.total,
        deliveryFee: 0,
        grandTotal: built.total,
        currency,
      },
      paymentMethodId: "manual_pos",
      paymentMethodName: "Manual payment",
      status: "Pending payment",
      payment: {
        provider: "manual_pos",
        providerMode: "manual",
        status: "pending",
        amountMinor: Math.round(built.total * 100),
        currency,
        refundStatus: "none",
        refundedAmountMinor: 0,
        createdAt: previous?.payment.createdAt || at,
        updatedAt: at,
      },
      createdAt: previous?.createdAt || at,
      updatedAt: at,
    };
    if (previous) tx.update(orderRef, order);
    else {
      tx.create(orderRef, order);
      tx.create(
        db
          .collection("stores")
          .doc(storeId)
          .collection("orderNumberReservations")
          .doc(`${reference.businessDateKey}_${reference.pickupCode}`),
        {
          orderId: orderRef.id,
          orderNumber: reference.orderNumber,
          pickupCode: reference.pickupCode,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    }
    tx.create(requestRef, { orderId: orderRef.id, workspaceId, createdAt: at });
    tx.create(db.collection("storeOrderTimeline").doc(), {
      orderId: orderRef.id,
      workspaceId,
      storeId,
      type: "fulfilment_status",
      label: previous
        ? "Manual order edited before payment"
        : "Manual order pending payment",
      actingUserId: uid,
      revision: order.manualOrder.revision,
      total: built.total,
      ...(previous ? { previousRevision: previous.manualOrder.revision, previousTotal: previous.total, previousItems: previous.items, previousFulfilments: previous.fulfilments } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    privateItems.forEach((item) =>
      tx.set(
        db
          .collection("storePrivatePosItems")
          .doc(
            createHash("sha256")
              .update(`${workspaceId}:${item.name}`)
              .digest("hex"),
          ),
        { ...item, workspaceId, storeId, updatedBy: uid, updatedAt: at },
      ),
    );
    return {
      orderId: orderRef.id,
      orderNumber: reference.orderNumber,
      duplicate: false,
    };
  });
}

export async function confirmManualPosPayment({
  db,
  uid,
  input,
  now = new Date(),
}) {
  if (!uid)
    throw new HttpsError("unauthenticated", "Sign in to confirm payment.");
  const ref = db.collection("storeOrders").doc(text(input?.orderId, 150, true));
  const initial = await ref.get();
  if (!initial.exists) throw new HttpsError("not-found", "Order not found.");
  const workspaceId = initial.data().workspaceId;
  await assertOperator({ db, uid, workspaceId, financial: true });
  return db.runTransaction(async (tx) => {
    await assertOperator({ db, uid, workspaceId, financial: true, transaction: tx });
    const snap = await tx.get(ref);
    const order = snap.data();
    if (
      order.workspaceId !== workspaceId ||
      !order.manualOrder ||
      order.fulfilmentStatus === "Cancelled"
    )
      fail("Choose an active manual preorder.");
    if (order.payment.status === "paid")
      return { orderId: ref.id, duplicate: true };
    if (
      order.payment.status !== "pending" ||
      input.amountMinor !== order.payment.amountMinor ||
      input.expectedRevision !== order.manualOrder.revision ||
      input.received !== true ||
      !["cash", "bank_transfer", "tng", "other"].includes(input.method)
    )
      fail("Verify the received payment, exact amount and current revision.");
    const reference = text(input.reference, 120, true);
    tx.update(ref, {
      "payment.status": "paid",
      "payment.updatedAt": now.toISOString(),
      "payment.confirmedBy": uid,
      "payment.providerPaymentMethod": input.method,
      "payment.providerTransactionId": reference,
      status: "Confirmed",
      updatedAt: now.toISOString(),
    });
    tx.create(
      db
        .collection("storeOrderTimeline")
        .doc(`${ref.id}_manual_payment_confirmed`),
      {
        orderId: ref.id,
        workspaceId,
        storeId: order.storeId,
        type: "payment_received",
        label: "Manual payment received and confirmed",
        amountMinor: order.payment.amountMinor,
        method: input.method,
        reference,
        actingUserId: uid,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    return { orderId: ref.id, duplicate: false };
  });
}
