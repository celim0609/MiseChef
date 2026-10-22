import test from "node:test";
import assert from "node:assert/strict";
import {
  pricePromotionCode,
  malaysiaPromotionDay,
  validatePromotionCodeConfig,
} from "./promotionCodePricing.js";
import { calculatePromotionPricing } from "./storePromotionPricing.js";
import { verifiedPromotionMember } from "./storePromotionCodes.js";
import { buildPendingOrder } from "./storePaymentsCore.js";
const config = {
  id: "code",
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
const now = new Date("2026-07-26T04:00:00Z");
const item = (amount) => ({
  itemType: "product",
  productId: "lunch",
  productName: "Lunch",
  quantity: 1,
  basePrice: amount,
  lineTotal: amount,
});
const price = (items, changes = {}) =>
  pricePromotionCode({
    items,
    pricing: calculatePromotionPricing({ items }),
    config,
    memberUid: "firebase-member",
    now,
    currency: "MYR",
    ...changes,
  });
test("20% of RM12.90 is exactly RM2.58; RM30 caps at RM5", () => {
  const small = price([item(12.9)]);
  assert.equal(small.discountTotal, 2.58);
  assert.equal(small.discountedMerchandiseTotal, 10.32);
  assert.equal(small.promotionCodeSnapshot.capApplied, false);
  const capped = price([item(30)]);
  assert.equal(capped.discountTotal, 5);
  assert.equal(capped.discountedMerchandiseTotal, 25);
  assert.equal(capped.promotionCodeSnapshot.capApplied, true);
});
test("the cap applies once per order; exact-cent allocations never go negative", () => {
  const result = price([item(12.9), item(30)]);
  assert.equal(result.discountTotal, 5);
  assert.equal(
    Math.round(
      result.promotionSnapshot.lineAdjustments.reduce(
        (sum, row) => sum + row.discountAmount,
        0,
      ) * 100,
    ),
    500,
  );
  for (const row of result.promotionSnapshot.lineAdjustments)
    assert.ok(row.finalLineTotal >= 0);
  const full = price([item(0.01)], {
    config: { ...config, percentageBps: 10000 },
  });
  assert.equal(full.discountedMerchandiseTotal, 0);
});
test("membership is verified Firebase identity; email, phone and anonymous identities cannot substitute", () => {
  assert.equal(verifiedPromotionMember(null), "");
  assert.equal(
    verifiedPromotionMember({
      uid: "anonymous",
      token: { firebase: { sign_in_provider: "anonymous" } },
    }),
    "",
  );
  assert.equal(
    verifiedPromotionMember({
      uid: "member",
      token: { firebase: { sign_in_provider: "password" } },
    }),
    "member",
  );
  assert.throws(
    () =>
      price([item(12.9)], {
        memberUid: "",
        email: "member@test.test",
        phone: "+60123456789",
      }),
    /registered member/,
  );
  assert.equal(
    price([item(12.9)], {
      memberUid: "",
      config: { ...config, membersOnly: false },
    }).discountTotal,
    2.58,
  );
});
test("Option A always keeps the Weekly Discount, even when the code would be larger", () => {
  for (const weeklySaving of [1, 10])
    assert.throws(
      () =>
        price([
          {
            ...item(60 - weeklySaving),
            weeklyPriceSnapshot: { discountAmount: weeklySaving },
          },
        ]),
      /cannot replace or stack.*Option A/,
    );
  assert.throws(
    () =>
      price([
        { ...item(54), weeklyPriceSnapshot: { discountAmount: 6 } },
        item(12.9),
      ]),
    /Weekly Discount/,
  );
  assert.equal(
    price([{ ...item(60), weeklyPriceSnapshot: { discountAmount: 0 } }])
      .discountTotal,
    5,
  );
  assert.throws(
    () => price([item(30)], { pricing: { discountTotal: 1 } }),
    /already contains a discounted/,
  );
  assert.throws(() => price([{ ...item(30), itemType: "set" }]), /Set/);
  assert.throws(() => price([item(30)], { groupOrder: true }), /Group Orders/);
});
test("daily clock uses Kuala Lumpur midnight, independent of UTC and browser time", () => {
  assert.equal(
    malaysiaPromotionDay(new Date("2026-10-22T15:59:59.999Z")),
    "2026-10-22",
  );
  assert.equal(
    malaysiaPromotionDay(new Date("2026-10-22T16:00:00Z")),
    "2026-10-23",
  );
});
test("config bounds and exact start/expiry boundaries are enforced server-side", () => {
  for (const changes of [
    { percentageBps: 10001 },
    { percentageBps: 0 },
    { capMinor: -1 },
    { capMinor: 0.5 },
    { dailyLimit: 0 },
    { totalLimit: 0 },
    { endsAt: config.startsAt },
    { code: "!bad" },
  ])
    assert.ok(validatePromotionCodeConfig({ ...config, ...changes }));
  assert.throws(
    () => price([item(30)], { config: { ...config, active: false } }),
    /invalid, disabled/,
  );
  assert.throws(
    () =>
      price([item(30)], { config: { ...config, endsAt: now.toISOString() } }),
    /validity dates/,
  );
  assert.equal(
    price([item(30)], { config: { ...config, startsAt: now.toISOString() } })
      .discountTotal,
    5,
  );
});
test("checkout excludes delivery fees and freezes code and pricing snapshots", () => {
  const store = {
    id: "s",
    workspaceId: "s",
    name: "Kitchen",
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
    maximumAdvanceDays: 14,
    earliestPickupDays: 0,
    unavailableDates: [],
  };
  const product = {
    id: "lunch",
    storeId: "s",
    workspaceId: "s",
    name: "Lunch",
    available: true,
    price: 30,
    optionGroupIds: [],
  };
  const draft = {
    customerName: "Member",
    phone: "+60123456789",
    pickupDate: "2026-07-27",
    pickupTime: "10:00",
    pickupLocationId: "counter",
    promotionCode: "WELCOME20",
    selections: [{ productId: "lunch", quantity: 1 }],
    fulfilmentMethod: "delivery",
    deliverySnapshot: {
      quote: { fee: 7 },
      schedule: { date: "2026-07-27", time: "10:00" },
      fulfilmentMode: "preorder",
    },
  };
  const args = {
    id: "o",
    orderNumber: "MC-TEST",
    store,
    products: [product],
    optionGroups: [],
    paymentProvider: "stripe",
    paymentProviderMode: "single_merchant",
    customerUid: "member",
    draft,
    now,
    promotionCodeConfig: config,
  };
  const order = buildPendingOrder(args);
  assert.equal(order.total, 32);
  assert.equal(order.totals.deliveryFee, 7);
  assert.equal(order.totals.discountTotal, 5);
  assert.equal(order.payment.amountMinor, 3200);
  const saved = JSON.stringify(order.promotionCodeSnapshot);
  const original = config.percentageBps;
  config.percentageBps = 100;
  product.price = 999;
  assert.equal(JSON.stringify(order.promotionCodeSnapshot), saved);
  config.percentageBps = original;
  assert.throws(
    () => buildPendingOrder({ ...args, promotionCodeConfig: null }),
    /validated by the server/,
  );
  const legacy = buildPendingOrder({
    ...args,
    draft: { ...draft, promotionCode: undefined },
    promotionCodeConfig: null,
  });
  assert.equal(legacy.promotionCodeSnapshot, undefined);
});
