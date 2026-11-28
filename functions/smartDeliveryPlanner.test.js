import test from "node:test";
import assert from "node:assert/strict";
import {
  SMART_DEFAULTS,
  plannerLimits,
  validatePlannerDraft,
  planSequence,
  allocatePlannerFees,
  plannerOrderDestination,
  compareSmartDelivery,
} from "./smartDeliveryPlanner.js";
const now = new Date("2026-11-28T00:00:00Z");
const a = {
  id: "a",
  label: "A",
  placeId: "place-a",
  address: "A",
  latitude: 4.64,
  longitude: 101.14,
  windowStart: "11:00",
  windowEnd: "11:30",
};
const b = {
  ...a,
  id: "b",
  label: "B",
  placeId: "place-b",
  address: "B",
  latitude: 4.645,
};
const input = {
  date: "2026-11-30",
  pickupTime: "11:00",
  limits: SMART_DEFAULTS,
  destinations: [a, b],
};
test("defaults are configurable and pairwise eligibility rejects distant chains, bad dates and limits", () => {
  assert.equal(plannerLimits().maxDestinations, 5);
  assert.equal(plannerLimits({ distanceKm: 3 }).distanceKm, 3);
  assert.equal(validatePlannerDraft(input, now).destinations.length, 2);
  const chain = [
    a,
    { ...b, latitude: 4.655 },
    { ...b, id: "c", latitude: 4.67 },
  ];
  assert.throws(
    () => validatePlannerDraft({ ...input, destinations: chain }, now),
    /pairwise/,
  );
  for (const changes of [
    { date: "2026-02-30" },
    { pickupTime: "25:00" },
    { destinations: [] },
    { limits: { maxDestinations: 16 } },
    { limits: { distanceKm: 0 } },
    { destinations: [a, a] },
  ])
    assert.throws(() => validatePlannerDraft({ ...input, ...changes }, now));
});
test("multiple destinations share a slot; waiting, duration and customer exact times constrain routes", () => {
  assert.equal(planSequence([a, b], "11:00", SMART_DEFAULTS).feasible, true);
  assert.equal(
    planSequence([a, b, { ...b, id: "c" }], "11:00", SMART_DEFAULTS).feasible,
    false,
  );
  const late = { ...b, windowStart: "12:00", windowEnd: "12:30" };
  assert.equal(
    planSequence([late, a], "11:00", SMART_DEFAULTS).feasible,
    false,
  );
  assert.equal(
    planSequence(
      [{ ...a, windowStart: "11:10", windowEnd: "11:10" }],
      "11:00",
      SMART_DEFAULTS,
    ).feasible,
    true,
  );
  assert.equal(
    planSequence(
      [{ ...a, windowStart: "11:09", windowEnd: "11:09" }],
      "11:00",
      SMART_DEFAULTS,
    ).feasible,
    false,
  );
});
test("proportional sen allocation conserves totals, applies one buffer and rejects uneconomical groups", () => {
  const r = allocatePlannerFees([1000, 1000, 1000], 1000, 100);
  assert.deepEqual(r.allocations, [367, 367, 366]);
  assert.equal(r.savingsMinor, 1900);
  assert.equal(r.merchantExposureMinor, 0);
  assert.equal(allocatePlannerFees([500, 500], 1000, 200).economical, false);
  assert.equal(allocatePlannerFees([500], 500, 0).economical, false);
});
test("saved delivery projection preserves exact time and excludes completed or booked deliveries", () => {
  const day = {
    id: "day",
    method: "delivery",
    date: input.date,
    time: "11:20",
  };
  const order = {
    id: "order",
    workspaceId: "workspace",
    delivery: {
      recipient: { address: "A", latitude: 4.64, longitude: 101.14 },
    },
    fulfilments: [day],
  };
  const d = plannerOrderDestination(order, day, input.date, 30);
  assert.equal(d.windowStart, "11:20");
  assert.equal(d.windowEnd, "11:20");
  for (const changes of [
    { groupDelivery: {} },
    { fulfilmentStatus: "Cancelled" },
    { fulfilmentCompletion: { day: true } },
    { delivery: { ...order.delivery, providerOrder: { orderId: "booked" } } },
  ])
    assert.throws(() =>
      plannerOrderDestination({ ...order, ...changes }, day, input.date, 30),
    );
});
const harness = () => {
  const data = new Map([
    [
      "stores/store",
      {
        country: "MY",
        workspaceId: "workspace",
        delivery: {
          provider: "lalamove",
          market: "MY",
          environment: "sandbox",
          serviceType: "MOTORCYCLE",
          pickup: { address: "Kitchen", latitude: 4.63, longitude: 101.14 },
          fixedDeliveryBuffer: {
            enabled: true,
            amountMinor: 200,
            maximumExtraCostMinor: 500,
          },
        },
      },
    ],
    [
      "workspaces/workspace",
      {
        ownerId: "owner",
        subscriptionPlan: "business",
        subscriptionStatus: "active",
      },
    ],
  ]);
  const ref = (path) => ({
    id: path.split("/").at(-1),
    path,
    async get() {
      return {
        id: this.id,
        ref: this,
        exists: data.has(path),
        data: () => data.get(path),
      };
    },
  });
  const db = {
    collection: (path) => ({ doc: (key) => ref(`${path}/${key}`) }),
    runTransaction: (fn) =>
      fn({ get: (r) => r.get(), set: (r, v) => data.set(r.path, v) }),
  };
  const requests = [];
  const provider = {
    environment: "sandbox",
    async createQuote(request) {
      requests.push(request);
      const stops = request.data.isRouteOptimized
        ? [request.data.stops[0], ...request.data.stops.slice(1).reverse()]
        : request.data.stops;
      return {
        quotationId: `q-${requests.length}`,
        scheduleAt: request.data.scheduleAt,
        serviceType: "MOTORCYCLE",
        priceBreakdown: {
          total: stops.length === 2 ? "10.00" : "12.00",
          currency: "MYR",
        },
        stops,
        expiresAt: "2026-11-28T00:05:00Z",
        isRouteOptimized: request.data.isRouteOptimized,
      };
    },
  };
  return {
    data,
    requests,
    args: {
      db,
      uid: "owner",
      storeId: "store",
      workspaceId: "workspace",
      projectId: "misechef-beta-fa4bf",
      input,
      provider,
      clock: () => now,
      resolvePlace: async (id) => (id === "place-a" ? a : b),
    },
  };
};
test("comparison obtains individual and incremental manual/optimized quotes, no order or payment writes", async () => {
  const h = harness(),
    r = await compareSmartDelivery(h.args);
  assert.equal(h.requests.length, 4);
  assert.equal(r.routes.length, 2);
  assert.equal(r.routes[1].manual.bufferMinor, 200);
  assert.deepEqual(r.routes[1].optimized.sequence, ["b", "a"]);
  assert.equal(r.routes[1].manual.recommended, true);
  assert.equal(
    r.routes[1].manual.allocations.reduce((a, b) => a + b, 0),
    1400,
  );
  assert.deepEqual(
    [...h.data.keys()].filter((k) => !k.startsWith("groupDeliveryRateLimits")),
    ["stores/store", "workspaces/workspace"],
  );
});
test("policy explanation distinguishes missing, disabled, vehicle-specific and configured values without changing fees", async () => {
  for (const [status, policy, vehicle] of [
    ["missing", undefined, "MOTORCYCLE"],
    [
      "disabled",
      { enabled: false, amountMinor: 321, maximumExtraCostMinor: 987 },
      "MOTORCYCLE",
    ],
    [
      "vehicle_not_applicable",
      { enabled: true, amountMinor: 321, maximumExtraCostMinor: 987 },
      "CAR",
    ],
    [
      "invalid",
      { enabled: true, amountMinor: -1, maximumExtraCostMinor: 987 },
      "MOTORCYCLE",
    ],
    [
      "applied",
      { enabled: true, amountMinor: 321, maximumExtraCostMinor: 987 },
      "MOTORCYCLE",
    ],
  ]) {
    const h = harness(),
      delivery = h.data.get("stores/store").delivery;
    delivery.fixedDeliveryBuffer = policy;
    delivery.serviceType = vehicle;
    const original = h.args.provider.createQuote;
    h.args.provider.createQuote = async (request) => ({
      ...(await original(request)),
      serviceType: request.data.serviceType,
    });
    const r = await compareSmartDelivery(h.args);
    assert.equal(r.pricingPolicy.status, status);
    assert.equal(
      r.routes[1].manual.bufferMinor,
      status === "applied" ? 321 : 0,
    );
    assert.equal(
      r.routes[1].manual.maximumExtraCostMinor,
      status === "applied" ? 987 : 0,
    );
    assert.equal(r.routes[1].manual.feeMinor, 1200);
    assert.equal(
      r.routes[1].manual.totalMinor,
      status === "applied" ? 1521 : 1200,
    );
  }
});
test("authorization, Production, provider errors and rate budget fail closed before recommendations", async () => {
  for (const change of [
    { uid: "other" },
    { projectId: "misechef-fa4bf" },
    { provider: { environment: "production" } },
  ]) {
    const h = harness();
    await assert.rejects(compareSmartDelivery({ ...h.args, ...change }));
    assert.equal(h.requests.length, 0);
  }
  const h = harness();
  h.data.set("groupDeliveryRateLimits/smart-delivery-provider", {
    windowStart: now.getTime(),
    count: 28,
  });
  await assert.rejects(compareSmartDelivery(h.args), /budget/);
  assert.equal(h.requests.length, 0);
  const failed = harness();
  failed.args.provider.createQuote = async () => {
    throw new Error("Provider unavailable");
  };
  await assert.rejects(
    compareSmartDelivery(failed.args),
    /Provider unavailable/,
  );
});
test("provider expiry, pickup substitution and changed route destinations are rejected", async () => {
  for (const patch of [
    { scheduleAt: "2026-11-30T04:00:00Z" },
    { expiresAt: now.toISOString() },
    { stops: [] },
    { serviceType: "CAR" },
    { priceBreakdown: { currency: "USD", total: "10" } },
  ]) {
    const h = harness(),
      original = h.args.provider.createQuote;
    h.args.provider.createQuote = async (r) => ({
      ...(await original(r)),
      ...patch,
    });
    await assert.rejects(compareSmartDelivery(h.args));
  }
});
