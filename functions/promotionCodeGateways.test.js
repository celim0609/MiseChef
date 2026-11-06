import test from "node:test";
import assert from "node:assert/strict";
import { createStripeSingleMerchantAdapter } from "./paymentProviders/stripeSingleMerchant.js";
import { createCurlecPaymentLinkAdapter } from "./paymentProviders/curlecPaymentLink.js";
const expiry = "2026-10-22T10:00:00.000Z";
const order = {
  id: "code-order",
  orderNumber: "MC-CODE",
  workspaceId: "store",
  storeName: "Kitchen",
  currency: "MYR",
  customerName: "Member",
  customerEmail: "member@example.test",
  phone: "+60123456789",
  payment: { providerPaymentId: "cs_code", amountMinor: 1032 },
  promotionCodeSnapshot: { reservationExpiresAt: expiry },
};
const returnUrl = "https://misechef-beta-fa4bf.web.app/store/fixture";
const stripeMock = ({
  status = "open",
  paymentStatus = "unpaid",
  intent = null,
  expireThrows = false,
} = {}) => {
  const calls = { create: [], expire: [] };
  const session = () => ({
    id: "cs_code",
    status,
    payment_status: paymentStatus,
    metadata: { misechefOrderId: order.id },
    amount_total: 1032,
    currency: "myr",
    payment_intent: intent,
  });
  return {
    calls,
    client: {
      checkout: {
        sessions: {
          async create(params, options) {
            calls.create.push({ params, options });
            return { id: "cs_code", url: "https://example.test/stripe" };
          },
          async retrieve() {
            return session();
          },
          async expire(id) {
            calls.expire.push(id);
            if (expireThrows)
              throw new Error("Cannot expire processing session");
            status = "expired";
            return session();
          },
        },
      },
    },
  };
};
test("code Stripe sessions expire, preserve order idempotency and use synchronous card checkout; ordinary sessions keep existing methods", async () => {
  const mock = stripeMock();
  const adapter = createStripeSingleMerchantAdapter("", {
    stripeClient: mock.client,
  });
  await adapter.createPayment({
    order,
    returnUrl,
    checkoutAccessToken: "token",
  });
  assert.equal(
    mock.calls.create[0].params.expires_at,
    Date.parse(expiry) / 1000,
  );
  assert.deepEqual(mock.calls.create[0].params.payment_method_types, ["card"]);
  assert.equal(
    mock.calls.create[0].options.idempotencyKey,
    "misechef-order-code-order",
  );
  await adapter.createPayment({
    order: { ...order, promotionCodeSnapshot: undefined },
    returnUrl,
    checkoutAccessToken: "token",
  });
  assert.equal(mock.calls.create[1].params.payment_method_types, undefined);
  assert.equal(mock.calls.create[1].params.expires_at, undefined);
  const expired = await adapter.expirePromotionPayment({ order });
  assert.equal(expired.status, "cancelled");
  assert.equal(expired.promotionTerminal, true);
  assert.equal(
    (await adapter.expirePromotionPayment({ order })).status,
    "cancelled",
  );
  assert.equal(mock.calls.expire.length, 1);
});
test("Stripe paid state preserves verified charge time; processing and unknown states never release usage", async () => {
  const paid = stripeMock({
    status: "complete",
    paymentStatus: "paid",
    intent: {
      id: "pi_code",
      status: "succeeded",
      latest_charge: { created: 1792666800 },
    },
  });
  const result = await createStripeSingleMerchantAdapter("", {
    stripeClient: paid.client,
  }).expirePromotionPayment({ order });
  assert.equal(result.status, "paid");
  assert.equal(result.paidAt, new Date(1792666800000).toISOString());
  assert.equal(paid.calls.expire.length, 0);
  const pending = stripeMock({
    status: "complete",
    paymentStatus: "unpaid",
    intent: { status: "processing" },
    expireThrows: true,
  });
  await assert.rejects(
    createStripeSingleMerchantAdapter("", {
      stripeClient: pending.client,
    }).expirePromotionPayment({ order }),
    /processing/,
  );
});
const linkOrder = {
  ...order,
  payment: { ...order.payment, providerPaymentId: "plink_code" },
};
const link = {
  id: "plink_code",
  reference_id: "mc_code-order",
  notes: { misechefOrderId: "code-order" },
  amount: 1032,
  amount_paid: 0,
  currency: "MYR",
  status: "created",
  short_url: "https://example.test/link",
};
test("Curlec code Link sets expiry and cancellation is verified by a fresh API read; repeated cancellation is idempotent", async () => {
  const calls = [];
  let current = { ...link };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === "POST" && url.endsWith("/cancel"))
      current = { ...current, status: "cancelled" };
    if (options.method === "POST" && !url.endsWith("/cancel")) {
      const body = JSON.parse(options.body);
      assert.equal(body.expire_by, Date.parse(expiry) / 1000);
      assert.equal(body.accept_partial, false);
    }
    return { ok: true, json: async () => ({ ...current }) };
  };
  const adapter = createCurlecPaymentLinkAdapter("test", "secret", {
    fetchImpl,
  });
  await adapter.createPayment({
    order: linkOrder,
    returnUrl,
    checkoutAccessToken: "token",
  });
  const result = await adapter.expirePromotionPayment({ order: linkOrder });
  assert.equal(result.promotionTerminal, true);
  assert.equal(result.status, "cancelled");
  await adapter.expirePromotionPayment({ order: linkOrder });
  assert.equal(calls.filter((row) => row.url.endsWith("/cancel")).length, 1);
});
test("Curlec unknown creation is recovered by exact unique reference and never blindly releases an absent session", async () => {
  let queried = false;
  const adapter = createCurlecPaymentLinkAdapter("test", "secret", {
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => {
        if (url.includes("reference_id=")) {
          queried = true;
          return { payment_links: [{ ...link, status: "expired" }] };
        }
        return { ...link, status: "expired" };
      },
    }),
  });
  assert.equal(
    (
      await adapter.expirePromotionPayment({
        order: { ...linkOrder, payment: { amountMinor: 1032 } },
      })
    ).status,
    "cancelled",
  );
  assert.equal(queried, true);
  const absent = createCurlecPaymentLinkAdapter("test", "secret", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ payment_links: [] }),
    }),
  });
  await assert.rejects(
    absent.expirePromotionPayment({
      order: { ...linkOrder, payment: { amountMinor: 1032 } },
    }),
    /requires reconciliation/,
  );
  const bad = createCurlecPaymentLinkAdapter("test", "secret", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ...link, status: "expired", amount: 999 }),
    }),
  });
  await assert.rejects(bad.expirePromotionPayment({ order: linkOrder }));
});
test("Curlec signed-event normalization retains actual payment time instead of root event creation time for MYT successful-redemption accounting", () => {
  const adapter = createCurlecPaymentLinkAdapter("test", "secret");
  const result = adapter.readWebhookUpdate({
    event: "payment_link.paid",
    created_at: 1792666800,
    payload: {
      payment_link: { entity: { ...link, updated_at: 1792670400 } },
      payment: {
        entity: {
          id: "pay_code",
          status: "captured",
          captured: true,
          amount: 1032,
          currency: "MYR",
        },
      },
    },
  });
  assert.equal(result.payment.paidAt, new Date(1792670400000).toISOString());
  assert.equal(result.payment.orderId, "code-order");
});
