// Imported by the mandatory Store order-history emulator suite so protected CI
// always runs real Firestore contention and payment-lifecycle coverage.
import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeApp,
  deleteApp,
} from "../functions/node_modules/firebase-admin/lib/esm/app/index.js";
import { getFirestore } from "../functions/node_modules/firebase-admin/lib/esm/firestore/index.js";
import {
  managePromotionCodes,
  codeDayId,
} from "../functions/storePromotionCodes.js";
import {
  createStorePayment,
  reconcileStorePayment,
} from "../functions/storePayments.js";
import {
  previewStorePromotionCode,
  expirePromotionCodeReservations,
} from "../functions/storePromotionCodeCheckout.js";
let sequence = 0;
const NOW = new Date("2026-07-26T15:59:00Z");
const fixture = async () => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "Firestore emulator is required.",
  );
  const id = `member-codes-${process.pid}-${++sequence}`;
  const app = initializeApp(
    { projectId: "demo-misechef-store-payment-rules" },
    id,
  );
  const db = getFirestore(app);
  const owner = `${id}-owner`;
  const member = `${id}-member`;
  const productId = `${id}-lunch`;
  await db.collection("workspaces").doc(id).set({
    ownerId: owner,
    subscriptionPlan: "professional",
    subscriptionStatus: "active",
  });
  await db
    .collection("stores")
    .doc(id)
    .set({
      workspaceId: id,
      slug: id,
      name: "Disposable Code Test Store",
      country: "MY",
      currency: "MYR",
      pickupEnabled: true,
      pickupOperatingHours: { start: "09:00", end: "18:00" },
      pickupLocations: [{ id: "counter", name: "Counter" }],
      orderDays: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      earliestPickupDays: 0,
      maximumAdvanceDays: 14,
      unavailableDates: [],
      paymentMethods: [{ id: "stripe", enabled: true }],
    });
  await db.collection("storeProducts").doc(productId).set({
    storeId: id,
    workspaceId: id,
    name: "Lunch",
    price: 12.9,
    available: true,
    optionGroupIds: [],
  });
  const config = {
    code: "WELCOME20",
    active: true,
    membersOnly: true,
    percentageBps: 2000,
    capMinor: 500,
    dailyLimit: 1,
    totalLimit: null,
    startsAt: "2026-01-01T00:00:00Z",
    endsAt: null,
  };
  let code = (
    await managePromotionCodes({
      db,
      uid: owner,
      input: { workspaceId: id, action: "save", config },
      now: NOW,
    })
  ).code;
  let calls = 0;
  let failCreation = false;
  const adapter = {
    provider: "stripe",
    mode: "single_merchant",
    requiresSellingWorkspace: false,
    promotionCodeLifecycle: true,
    async createPayment({ order }) {
      calls++;
      if (failCreation) {
        const error = new Error("Mock provider rejection");
        error.promotionDefinitelyNotCreated = true;
        throw error;
      }
      return {
        providerPaymentId: `cs_${order.id}`,
        checkout: {
          type: "provider_redirect",
          redirectUrl: "https://example.test/checkout",
        },
      };
    },
    async expirePromotionPayment({ order }) {
      return {
        providerPaymentId: order.payment.providerPaymentId || `cs_${order.id}`,
        orderId: order.id,
        amountMinor: order.payment.amountMinor,
        currency: "MYR",
        status: "cancelled",
        promotionTerminal: true,
      };
    },
  };
  const draft = {
    customerName: "Registered member",
    phone: "+60123456789",
    pickupDate: "2026-07-27",
    pickupTime: "10:00",
    pickupLocationId: "counter",
    promotionCode: "WELCOME20",
    selections: [{ productId, quantity: 1 }],
  };
  const create = (overrides = {}) =>
    createStorePayment({
      db,
      adapter,
      slug: id,
      customerUid: member,
      draft: { ...draft, checkoutAttemptId: crypto.randomUUID() },
      returnUrl: `https://misechef-beta-fa4bf.web.app/store/${id}`,
      now: NOW,
      ...overrides,
    });
  const stored = async (session) => {
    const snapshot = await db
      .collection("storeOrders")
      .where("payment.providerPaymentId", "==", session.paymentSessionId)
      .get();
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  };
  const pay = async (session, status = "paid") => {
    const order = await stored(session);
    return reconcileStorePayment({
      db,
      payment: {
        orderId: order.id,
        providerPaymentId: session.paymentSessionId,
        amountMinor: order.payment.amountMinor,
        currency: "MYR",
        status,
        ...(status === "paid"
          ? {
              providerTransactionId: `pay_${order.id}`,
              paidAt:
                order.promotionCodeSnapshot.businessDate === "2026-07-27"
                  ? "2026-07-26T16:02:00Z"
                  : NOW.toISOString(),
            }
          : {}),
      },
    });
  };
  const update = async (changes) => {
    code = (
      await managePromotionCodes({
        db,
        uid: owner,
        input: {
          workspaceId: id,
          action: "save",
          id: code.id,
          config: { ...code, ...changes },
        },
        now: NOW,
      })
    ).code;
  };
  return {
    db,
    app,
    id,
    owner,
    member,
    productId,
    adapter,
    draft,
    create,
    stored,
    pay,
    update,
    get code() {
      return code;
    },
    get calls() {
      return calls;
    },
    fail: () => {
      failCreation = true;
    },
    succeed: () => {
      failCreation = false;
    },
  };
};
test("member codes: atomically commit one success per MYT day, idempotent checkout/webhook retries and immutable orders", async () => {
  const f = await fixture();
  try {
    const attempt = crypto.randomUUID();
    const session = await f.create({
      draft: { ...f.draft, checkoutAttemptId: attempt },
    });
    assert.equal(session.orderSummary.totals.grandTotal, 10.32);
    assert.equal(session.orderSummary.promotionCodeSnapshot.discountMinor, 258);
    const replay = await f.create({
      draft: { ...f.draft, checkoutAttemptId: attempt },
    });
    assert.equal(replay.paymentSessionId, session.paymentSessionId);
    assert.equal(f.calls, 1);
    await f.pay(session);
    await f.pay(session);
    const paid = await f.stored(session);
    const original = JSON.stringify(paid);
    const day = (
      await f.db
        .collection("storePromotionCodeDays")
        .doc(codeDayId(f.code.id, f.member, "2026-07-26"))
        .get()
    ).data();
    assert.equal(day.committed, 1);
    assert.equal(day.reserved, 0);
    await assert.rejects(f.create(), /daily limit|already reserved/);
    await f.update({ percentageBps: 5000, capMinor: 1000 });
    assert.equal(JSON.stringify(await f.stored(session)), original);
    const next = await f.create({ now: new Date("2026-07-26T16:01:00Z") });
    await f.pay(next);
    assert.equal(
      (await f.stored(next)).promotionCodeSnapshot.businessDate,
      "2026-07-27",
    );
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .redeemedCount,
      2,
    );
    const events = await f.db
      .collection("storePromotionCodes")
      .doc(f.code.id)
      .collection("redemptionEvents")
      .get();
    assert.equal(events.size, 2);
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: guests, anonymous members, forged identity and another member replay are rejected", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.create({
        customerUid: "",
        draft: {
          ...f.draft,
          email: "member@example.test",
          customerUid: f.member,
        },
      }),
      /registered member/,
    );
    await assert.rejects(
      f.create({ customerUid: "anonymous-uid", promotionMemberUid: "" }),
      /registered member/,
    );
    const attempt = crypto.randomUUID();
    await f.create({ draft: { ...f.draft, checkoutAttemptId: attempt } });
    await assert.rejects(
      f.create({
        customerUid: "other-member",
        draft: { ...f.draft, checkoutAttemptId: attempt },
      }),
      /another account/,
    );
    assert.equal(f.calls, 1);
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: concurrent attempts cannot bypass daily or global limits", async () => {
  const f = await fixture();
  try {
    const daily = await Promise.allSettled([f.create(), f.create()]);
    assert.equal(daily.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .reservedCount,
      1,
    );
    await f.update({ totalLimit: 1 });
    const global = await Promise.allSettled([
      f.create({ customerUid: "member-two" }),
      f.create({ customerUid: "member-three" }),
    ]);
    assert.ok(global.every((row) => row.status === "rejected"));
    await assert.rejects(f.update({ totalLimit: 0 }), /positive total/);
  } finally {
    await deleteApp(f.app);
  }
  const g = await fixture();
  try {
    await g.update({ totalLimit: 1 });
    const global = await Promise.allSettled([
      g.create({ customerUid: "first" }),
      g.create({ customerUid: "second" }),
    ]);
    assert.equal(global.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal(g.calls, 1);
  } finally {
    await deleteApp(g.app);
  }
});
test("member codes: definitive creation failure releases usage; terminal expiry releases exactly once; failed webhooks alone do not release a chargeable session", async () => {
  const f = await fixture();
  try {
    f.fail();
    await assert.rejects(f.create(), /reservation was released/);
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .reservedCount,
      0,
    );
    f.succeed();
    const session = await f.create();
    await f.pay(session, "failed");
    await assert.rejects(f.create(), /daily limit|already reserved/);
    const order = await f.stored(session);
    const cancelled = await f.adapter.expirePromotionPayment({ order });
    await reconcileStorePayment({ db: f.db, payment: cancelled });
    await reconcileStorePayment({ db: f.db, payment: cancelled });
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .reservedCount,
      0,
    );
    const retry = await f.create();
    await f.pay(retry);
    await f.pay(retry, "failed");
    assert.equal((await f.stored(retry)).payment.status, "paid");
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: expiry worker never releases a pending/unknown gateway state and later recovers safely", async () => {
  const f = await fixture();
  try {
    const session = await f.create();
    const order = await f.stored(session);
    await expirePromotionCodeReservations({
      db: f.db,
      now: new Date(NOW.getTime() + 61 * 60000),
      resolveAdapter: () => ({
        expirePromotionPayment: async () => ({ status: "pending" }),
      }),
    });
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .reservedCount,
      1,
    );
    await expirePromotionCodeReservations({
      db: f.db,
      now: new Date(NOW.getTime() + 80 * 60000),
      resolveAdapter: () => f.adapter,
    });
    const redemption = (
      await f.db
        .collection("storePromotionCodes")
        .doc(f.code.id)
        .collection("redemptions")
        .doc(order.id)
        .get()
    ).data();
    assert.equal(redemption.state, "released");
    const audit = await managePromotionCodes({
      db: f.db,
      uid: f.owner,
      input: { action: "history", workspaceId: f.id, id: f.code.id },
    });
    assert.equal(audit.redemptions.length, 1);
    assert.equal(audit.redemptions[0].state, "released");
    await assert.rejects(
      managePromotionCodes({
        db: f.db,
        uid: f.member,
        input: { action: "history", workspaceId: f.id, id: f.code.id },
      }),
      /management access/,
    );
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: Option A rejects a discounted Weekly Full Set instead of choosing the better code", async () => {
  const f = await fixture();
  try {
    const planId = `${f.id}-weekly`;
    const meals = Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri"].map((day) => [
        day,
        { name: day, photoUrl: "meal.jpg", price: 12 },
      ]),
    );
    await f.db
      .collection("storeProducts")
      .doc(planId)
      .set({
        storeId: f.id,
        workspaceId: f.id,
        name: "Week",
        productType: "weekly_meal_plan",
        weeklyMenuVersion: 3,
        price: 60,
        available: true,
        optionGroupIds: [],
        rotationStartMonday: "2026-07-27",
        rotationWeeks: {
          week1: { meals, discount: { type: "fixed_amount", value: 1 } },
        },
        healthyLunchBlockedDates: [],
      });
    await assert.rejects(
      previewStorePromotionCode({
        db: f.db,
        slug: f.id,
        memberUid: f.member,
        now: NOW,
        draft: {
          promotionCode: "WELCOME20",
          serviceDate: "2026-07-27",
          selections: [{ productId: planId, quantity: 1 }],
        },
      }),
      /Option A/,
    );
    const draft = {
      ...f.draft,
      selections: [{ productId: planId, quantity: 1 }],
      fulfilments: [27, 28, 29, 30, 31].map((day) => ({
        date: `2026-07-${day}`,
        time: "10:00",
        itemIndexes: [0],
      })),
    };
    await assert.rejects(f.create({ draft }), /Weekly Discount/);
    assert.equal(f.calls, 0);
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: disable/edit and code uniqueness are server-authorized and never reset audit counters", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      managePromotionCodes({
        db: f.db,
        uid: f.member,
        input: {
          action: "save",
          workspaceId: f.id,
          id: f.code.id,
          config: f.code,
        },
      }),
      /management access/,
    );
    await assert.rejects(
      managePromotionCodes({
        db: f.db,
        uid: f.owner,
        input: { action: "save", workspaceId: f.id, config: f.code },
        now: NOW,
      }),
      /already has that code/,
    );
    await f.update({ code: "RENAMED20" });
    await assert.rejects(f.create(), /invalid or unavailable/);
    const session = await f.create({
      draft: { ...f.draft, promotionCode: "RENAMED20" },
    });
    await f.pay(session);
    await managePromotionCodes({
      db: f.db,
      uid: f.owner,
      input: { action: "disable", workspaceId: f.id, id: f.code.id },
      now: NOW,
    });
    await assert.rejects(
      f.create({
        customerUid: "other",
        draft: { ...f.draft, promotionCode: "RENAMED20" },
      }),
      /disabled/,
    );
    const listed = await managePromotionCodes({
      db: f.db,
      uid: f.owner,
      input: { action: "list", workspaceId: f.id },
    });
    assert.equal(listed.codes[0].redeemedCount, 1);
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: a capture crossing MYT midnight consumes the successful payment day, and delayed webhook retries keep that day", async () => {
  const f = await fixture();
  try {
    const session = await f.create();
    const order = await f.stored(session);
    await assert.rejects(
      f.create({ now: new Date("2026-07-26T16:01:00Z") }),
      /already reserved/,
    );
    const payment = {
      orderId: order.id,
      providerPaymentId: session.paymentSessionId,
      providerTransactionId: `pay_${order.id}`,
      amountMinor: order.payment.amountMinor,
      currency: "MYR",
      status: "paid",
      paidAt: "2026-07-26T16:01:00Z",
    };
    await reconcileStorePayment({ db: f.db, payment });
    await reconcileStorePayment({ db: f.db, payment });
    const yesterday = (
      await f.db
        .collection("storePromotionCodeDays")
        .doc(codeDayId(f.code.id, f.member, "2026-07-26"))
        .get()
    ).data();
    const today = (
      await f.db
        .collection("storePromotionCodeDays")
        .doc(codeDayId(f.code.id, f.member, "2026-07-27"))
        .get()
    ).data();
    assert.equal(yesterday.committed, 0);
    assert.equal(yesterday.reserved, 0);
    assert.equal(today.committed, 1);
    await assert.rejects(
      f.create({ now: new Date("2026-07-26T16:02:00Z") }),
      /daily limit/,
    );
    const audit = await managePromotionCodes({
      db: f.db,
      uid: f.owner,
      input: { action: "history", workspaceId: f.id, id: f.code.id },
    });
    assert.equal(audit.redemptions[0].businessDate, "2026-07-27");
    assert.equal(audit.redemptions[0].reservationBusinessDate, "2026-07-26");
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: real server delivery quote and checkout agree on capped product discount while the delivery fee is unchanged", async () => {
  const { createStoreDeliveryQuote } = await import(
    "../functions/storeDelivery.js"
  );
  const f = await fixture();
  try {
    const clock = new Date();
    const date = new Date(clock.getTime() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    await f.db
      .collection("storeProducts")
      .doc(f.productId)
      .update({ price: 30 });
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    await f.db
      .collection("stores")
      .doc(f.id)
      .update({
        delivery: {
          enabled: true,
          provider: "lalamove",
          environment: "sandbox",
          market: "MY",
          serviceType: "MOTORCYCLE",
          pickup: {
            address: "QA pickup",
            latitude: "3",
            longitude: "101",
            contactName: "QA kitchen",
            contactPhoneE164: "+60123456789",
          },
          fulfilment: {
            preOrder: {
              enabled: true,
              orderDays: days,
              earliestDays: 1,
              maximumAdvanceDays: 14,
              unavailableDates: [],
              deliveryHours: { from: "09:00", to: "18:00" },
            },
          },
        },
      });
    const quote = {
      quotationId: "quote-member-code",
      expiresAt: new Date(clock.getTime() + 10 * 60000).toISOString(),
      serviceType: "MOTORCYCLE",
      priceBreakdown: { total: 7, currency: "MYR" },
      stops: [
        { stopId: "pickup", coordinates: { lat: "3", lng: "101" } },
        { stopId: "dropoff", coordinates: { lat: "3.01", lng: "101.01" } },
      ],
    };
    const provider = {
      environment: "sandbox",
      async createQuote() {
        return quote;
      },
      async retrieveQuote() {
        return quote;
      },
    };
    const destination = {
      formattedAddress: "QA destination",
      latitude: "3.01",
      longitude: "101.01",
    };
    const delivery = {
      ...f.draft,
      pickupDate: date,
      deliveryDate: date,
      deliveryTime: "10:00",
      fulfilmentMode: "preorder",
      destination,
    };
    const result = await createStoreDeliveryQuote({
      db: f.db,
      provider,
      slug: f.id,
      draft: delivery,
      customerUid: f.member,
    });
    assert.equal(result.merchandiseSubtotal, 25);
    assert.equal(result.quote.customerDeliveryFee, 7);
    const session = await f.create({
      now: clock,
      deliveryProvider: provider,
      draft: {
        ...delivery,
        fulfilmentMethod: "delivery",
        deliveryQuoteId: result.quote.quotationId,
        deliveryPricingSnapshotId: result.pricingSnapshotId,
      },
    });
    assert.equal(session.orderSummary.totals.discountTotal, 5);
    assert.equal(session.orderSummary.totals.deliveryFee, 7);
    assert.equal(session.orderSummary.totals.grandTotal, 32);
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: client pricing claims cannot override the server, and changed preview terms require re-application", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.create({
        draft: {
          ...f.draft,
          promotionCodeExpected: {
            configRevision: 999,
            eligibleSubtotalMinor: 1,
            discountMinor: 1,
          },
        },
      }),
      /terms changed/,
    );
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .reservedCount,
      0,
    );
    const session = await f.create({
      draft: {
        ...f.draft,
        customerUid: "attacker",
        promotionCodeConfig: { percentageBps: 10000, capMinor: 99999 },
        promotionCodeSnapshot: { discountMinor: 99999 },
      },
    });
    assert.equal(session.orderSummary.promotionCodeSnapshot.discountMinor, 258);
    assert.equal((await f.stored(session)).customerUid, f.member);
  } finally {
    await deleteApp(f.app);
  }
});
test("member codes: configurable daily limits allow successive successes and unsupported payment methods reserve nothing", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.create({ adapter: { ...f.adapter, promotionCodeLifecycle: false } }),
      /cannot safely release/,
    );
    assert.equal(f.calls, 0);
    await f.update({ dailyLimit: 2 });
    const first = await f.create();
    await f.pay(first);
    const second = await f.create();
    await f.pay(second);
    await assert.rejects(f.create(), /daily limit/);
    assert.equal(
      (await f.db.collection("storePromotionCodes").doc(f.code.id).get()).data()
        .redeemedCount,
      2,
    );
  } finally {
    await deleteApp(f.app);
  }
});
