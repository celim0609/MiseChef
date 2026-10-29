import { HttpsError } from "firebase-functions/v2/https";
import {
  loadStoreCheckoutData,
  reconcileStorePayment,
} from "./storePayments.js";
import { buildOrderItems } from "./storePaymentsCore.js";
import { calculatePromotionPricing } from "./storePromotionPricing.js";
import { pricePromotionCode } from "./promotionCodePricing.js";
import {
  readCheckoutCode,
  prepareCodeTransition,
} from "./storePromotionCodes.js";
export const previewStorePromotionCode = async ({
  db,
  slug,
  draft,
  memberUid,
  now = new Date(),
}) => {
  const checkout = await loadStoreCheckoutData(db, slug);
  if (
    !Array.isArray(draft?.selections) ||
    !draft.selections.length ||
    draft.selections.length > 100 ||
    draft.selections.some(
      (line) =>
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 20,
    )
  )
    throw new HttpsError("failed-precondition", "Review your cart quantities.");
  const items = buildOrderItems(
    draft.selections,
    checkout.products,
    checkout.optionGroups,
    checkout.sets,
    draft.serviceDate,
  );
  return db.runTransaction(async (transaction) => {
    const reservation = await readCheckoutCode({
      db,
      transaction,
      storeId: checkout.store.id,
      code: draft.promotionCode,
      memberUid,
      now,
      currency: checkout.store.currency,
    });
    if (!reservation)
      throw new HttpsError(
        "failed-precondition",
        "Promotion code: Enter a code.",
      );
    const pricing = pricePromotionCode({
      items,
      pricing: calculatePromotionPricing({
        items,
        promotions: checkout.promotions,
        now,
      }),
      config: reservation.config,
      memberUid,
      now,
      currency: checkout.store.currency,
      groupOrder: Boolean(draft.groupShareCode),
    });
    return { snapshot: pricing.promotionCodeSnapshot };
  });
};
// Run only against newly created code reservations. Never infer gateway expiry
// from a wall clock alone, and never mutate any historical paid order.
export const expirePromotionCodeReservations = async ({
  db,
  resolveAdapter,
  now = new Date(),
  limit = 30,
}) => {
  const snapshot = await db
    .collection("storePromotionCodeReservations")
    .where("state", "==", "reserved")
    .where("nextCheckAt", "<=", now.toISOString())
    .orderBy("nextCheckAt")
    .limit(limit)
    .get();
  const results = [];
  for (const document of snapshot.docs) {
    const reservation = document.data();
    try {
      const orderSnapshot = await db
        .collection("storeOrders")
        .doc(reservation.orderId)
        .get();
      if (!orderSnapshot.exists)
        throw new Error("Reservation order is missing.");
      const order = { id: orderSnapshot.id, ...orderSnapshot.data() };
      if (!order.promotionCodeSnapshot)
        throw new Error("Missing code snapshot.");
      const adapter = resolveAdapter(order);
      const payment = await adapter.expirePromotionPayment({
        order,
        recovery: reservation.recovery,
      });
      if (
        !payment ||
        !["paid", "cancelled"].includes(payment.status) ||
        (payment.status === "cancelled" && !payment.promotionTerminal)
      )
        throw new Error(
          "Gateway payment is still pending or cannot be safely cancelled.",
        );
      if (payment.promotionDefinitelyNotCreated) {
        await db.runTransaction(async (transaction) => {
          const reference = db.collection("storeOrders").doc(order.id);
          const fresh = await transaction.get(reference);
          if (
            fresh.data()?.payment?.status === "paid" ||
            fresh.data()?.payment?.providerPaymentId
          )
            throw new Error("Checkout changed during expiry.");
          const write = await prepareCodeTransition({
            db,
            transaction,
            order: { id: order.id, ...fresh.data() },
            nextState: "released",
            reason: "confirmed_no_provider_session",
            now,
          });
          write();
          transaction.update(reference, {
            status: "Payment Cancelled",
            "payment.status": "cancelled",
            "payment.updatedAt": now.toISOString(),
            updatedAt: now.toISOString(),
          });
        });
      } else {
        if (!order.payment.providerPaymentId && payment.providerPaymentId)
          await db.runTransaction(async (transaction) => {
            const ref = db.collection("storeOrders").doc(order.id);
            const fresh = await transaction.get(ref);
            if (
              fresh.data()?.payment?.providerPaymentId &&
              fresh.data().payment.providerPaymentId !==
                payment.providerPaymentId
            )
              throw new Error("Provider binding changed.");
            transaction.update(ref, {
              "payment.providerPaymentId": payment.providerPaymentId,
            });
          });
        await reconcileStorePayment({ db, payment });
      }
      results.push({ orderId: order.id, status: payment.status });
    } catch (error) {
      await document.ref.update({
        nextCheckAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        requiresReview: true,
        lastError:
          "Gateway reconciliation pending; no redemption was released.",
        lastCheckedAt: now.toISOString(),
      });
      results.push({ orderId: reservation.orderId, status: "requires_review" });
    }
  }
  return results;
};
