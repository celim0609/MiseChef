import { HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { loadReviewStore } from "./groupDeliveryReview.js";
import { requireGroupDeliveryBeta } from "./groupDelivery.js";
import {
  deliveryDistanceKm,
  fixedDeliveryBuffer,
} from "./storeDeliveryPricing.js";
import {
  canonicalFulfilmentView,
  resolveDeliveryDispatchData,
} from "./storeFulfilmentCanonical.js";
import { validCalendarDate } from "./storeWeeklyMealPlan.js";

export const SMART_DEFAULTS = Object.freeze({
  distanceKm: 2,
  slotMinutes: 30,
  maxDestinations: 5,
  maxDurationMinutes: 60,
  legMinutes: 10,
  serviceMinutes: 2,
});
const fail = (message, code = "failed-precondition") => {
  throw new HttpsError(code, message);
};
const text = (v) => (typeof v === "string" ? v.trim() : "");
const id = (v) => typeof v === "string" && /^[\w-]{1,160}$/.test(v);
const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const minute = (t) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(t || "")
    ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
    : NaN;
const time = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const point = (p) => {
  if (
    !p ||
    !text(p.address || p.formattedAddress) ||
    text(p.address || p.formattedAddress).length > 500
  )
    fail("A mapped address is required.", "invalid-argument");
  try {
    deliveryDistanceKm(p, p);
  } catch {
    fail("Address coordinates are invalid.", "invalid-argument");
  }
  return {
    address: text(p.address || p.formattedAddress),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
  };
};
export const plannerLimits = (input) => {
  const value = { ...SMART_DEFAULTS, ...input };
  const bounds = {
    distanceKm: [0.1, 20],
    slotMinutes: [5, 180],
    maxDestinations: [1, 10],
    maxDurationMinutes: [5, 240],
    legMinutes: [1, 60],
    serviceMinutes: [0, 30],
  };
  if (Object.keys(value).some((key) => !bounds[key]))
    fail("Unknown planning limit.", "invalid-argument");
  for (const [key, [min, max]] of Object.entries(bounds))
    if (
      !Number.isFinite(value[key]) ||
      value[key] < min ||
      value[key] > max ||
      (key !== "distanceKm" && !Number.isInteger(value[key]))
    )
      fail(`Invalid ${key}.`, "invalid-argument");
  return value;
};
export const validatePlannerDraft = (input, now = new Date()) => {
  const limits = plannerLimits(input.limits);
  if (
    !validCalendarDate(input.date) ||
    !Number.isFinite(minute(input.pickupTime)) ||
    Date.parse(`${input.date}T${input.pickupTime}:00+08:00`) <= now.getTime()
  )
    fail("Choose a future pickup date and time.", "invalid-argument");
  if (
    !Array.isArray(input.destinations) ||
    !input.destinations.length ||
    input.destinations.length > limits.maxDestinations
  )
    fail(
      `Choose 1–${limits.maxDestinations} destinations.`,
      "invalid-argument",
    );
  const destinations = input.destinations.map((d) => {
    if (
      !id(d.id) ||
      !text(d.label) ||
      text(d.label).length > 120 ||
      !Number.isFinite(minute(d.windowStart)) ||
      !Number.isFinite(minute(d.windowEnd)) ||
      minute(d.windowEnd) < minute(d.windowStart) ||
      (minute(d.windowEnd) === minute(d.windowStart) && !d.confirmedTime)
    )
      fail(
        "Each destination needs a label and a same-day delivery window.",
        "invalid-argument",
      );
    return { ...d, ...point(d) };
  });
  if (new Set(destinations.map((d) => d.id)).size !== destinations.length)
    fail("Duplicate destinations.", "invalid-argument");
  for (let i = 0; i < destinations.length; i++)
    for (let j = i + 1; j < destinations.length; j++)
      if (
        deliveryDistanceKm(destinations[i], destinations[j]) >
        limits.distanceKm + 1e-9
      )
        fail(
          `Destinations exceed the ${limits.distanceKm}km maximum pairwise distance.`,
        );
  return {
    date: input.date,
    pickupTime: input.pickupTime,
    limits,
    destinations,
  };
};
export const planSequence = (destinations, pickupTime, limits) => {
  let clock = minute(pickupTime);
  const start = clock;
  const arrivals = destinations.map((d) => {
    clock = Math.max(clock + limits.legMinutes, minute(d.windowStart));
    const arrival = time(clock),
      withinWindow = clock <= minute(d.windowEnd);
    clock += limits.serviceMinutes;
    return {
      id: d.id,
      label: d.label,
      arrival,
      windowStart: d.windowStart,
      windowEnd: d.windowEnd,
      withinWindow,
    };
  });
  const durationMinutes = clock - start;
  return {
    arrivals,
    durationMinutes,
    feasible:
      arrivals.every((a) => a.withinWindow) &&
      durationMinutes <= limits.maxDurationMinutes &&
      clock < 1440,
  };
};
export const allocatePlannerFees = (
  individualMinor,
  routeMinor,
  bufferMinor = 0,
) => {
  const baseline = individualMinor.reduce((n, v) => n + v, 0),
    total = routeMinor + bufferMinor;
  if (
    ![...individualMinor, routeMinor, bufferMinor].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    ) ||
    baseline <= 0
  )
    fail("Quotation amounts are invalid.");
  const allocations = individualMinor.map((v) =>
    Math.floor((total * v) / baseline),
  );
  const remainders = individualMinor
    .map((v, i) => ({ i, r: (total * v) % baseline }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  const remaining = total - allocations.reduce((a, b) => a + b, 0);
  for (let n = 0; n < remaining; n++) allocations[remainders[n].i]++;
  return {
    allocations,
    totalMinor: total,
    savingsMinor: baseline - total,
    providerSavingsMinor: baseline - routeMinor,
    merchantExposureMinor: Math.max(0, routeMinor - total),
    economical:
      total < baseline && allocations.every((v, i) => v <= individualMinor[i]),
  };
};

export const plannerOrderDestination = (
  order,
  fulfilment,
  date,
  slotMinutes,
) => {
  const view = canonicalFulfilmentView(order, fulfilment);
  if (
    order.deletedAt ||
    order.groupDelivery ||
    ["Cancelled", "Completed"].includes(order.fulfilmentStatus) ||
    order.status === "Cancelled" ||
    order.fulfilmentCompletion?.[fulfilment.id] ||
    view.method !== "delivery" ||
    view.date !== date ||
    !Number.isFinite(minute(view.time))
  )
    fail("Choose an active delivery fulfilment on this date.");
  const operation = order.fulfilmentOperations?.[fulfilment.id];
  if (
    operation?.providerOrder?.orderId ||
    order.delivery?.providerOrder?.orderId ||
    ["submitting", "submitted", "unknown"].includes(operation?.dispatch?.status)
  )
    fail("Already booked or unresolved deliveries cannot be planned again.");
  const resolved = resolveDeliveryDispatchData(order, fulfilment);
  const p = point(resolved.recipient);
  // Saved exact times are zero-width constraints; no silent slot extension.
  return {
    id: `${order.id}_${fulfilment.id}`,
    orderId: order.id,
    fulfilmentId: fulfilment.id,
    label: order.orderNumber || order.id,
    ...p,
    confirmedTime: view.time,
    windowStart: view.time,
    windowEnd: view.time,
    source: "order",
  };
};
export const loadPlannerOrders = async (args) => {
  const store = await loadReviewStore(args);
  if (!validCalendarDate(args.date))
    fail("Choose a delivery date.", "invalid-argument");
  const limits = plannerLimits(args.limits);
  const result = await args.db
    .collection("storeOrders")
    .where("storeId", "==", store.id)
    .limit(101)
    .get();
  const destinations = [];
  for (const doc of result.docs.slice(0, 100)) {
    const order = { ...doc.data(), id: doc.id };
    if (order.workspaceId !== (store.workspaceId || store.id)) continue;
    for (const day of order.fulfilments || []) {
      try {
        destinations.push(
          plannerOrderDestination(order, day, args.date, limits.slotMinutes),
        );
      } catch {
        /* Ineligible saved fulfilments are not selectable. */
      }
    }
  }
  return { destinations, truncated: result.size > 100 };
};
const authorize = (args) => {
  requireGroupDeliveryBeta(args.projectId);
  return loadReviewStore(args);
};
const reserveBudget = async (db, count, now) =>
  db.runTransaction(async (tx) => {
    const ref = db
      .collection("groupDeliveryRateLimits")
      .doc("smart-delivery-provider");
    const prior = (await tx.get(ref)).data();
    const same = prior && now.getTime() - prior.windowStart < 60000;
    if ((same ? prior.count : 0) + count > 28)
      fail(
        "Sandbox quotation budget reached. Wait one minute before retrying.",
        "resource-exhausted",
      );
    tx.set(ref, {
      windowStart: same ? prior.windowStart : now.getTime(),
      count: (same ? prior.count : 0) + count,
    });
  });
export const compareSmartDelivery = async (args) => {
  const { db, input, provider, clock = () => new Date() } = args;
  const store = await authorize(args);
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Provide a delivery plan.", "invalid-argument");
  if (
    provider.environment !== "sandbox" ||
    store.delivery?.environment !== "sandbox" ||
    store.delivery?.provider !== "lalamove" ||
    store.delivery?.market !== "MY"
  )
    fail("Configure Sandbox Lalamove for this Store.");
  const pickup = point(store.delivery.pickup),
    serviceType = store.delivery.serviceType;
  const limits = plannerLimits(input.limits);
  const sources = [];
  if (
    !Array.isArray(input.destinations) ||
    input.destinations.length > limits.maxDestinations
  )
    fail("Too many destinations.", "invalid-argument");
  const resolved = [];
  for (const d of input.destinations) {
    if (!d || typeof d !== "object" || Array.isArray(d))
      fail("Invalid destination.", "invalid-argument");
    if (d.orderId) {
      if (!id(d.orderId) || !id(d.fulfilmentId))
        fail("Invalid saved delivery.", "invalid-argument");
      const doc = await db.collection("storeOrders").doc(d.orderId).get();
      const order = { ...doc.data(), id: doc.id };
      if (
        !doc.exists ||
        order.storeId !== store.id ||
        order.workspaceId !== (store.workspaceId || store.id)
      )
        fail("Delivery belongs to another Store.", "permission-denied");
      const day = (order.fulfilments || []).find(
        (f) => f.id === d.fulfilmentId,
      );
      if (!day) fail("Saved delivery is unavailable.");
      const saved = plannerOrderDestination(
        order,
        day,
        input.date,
        limits.slotMinutes,
      );
      if (
        d.windowStart !== saved.windowStart ||
        d.windowEnd !== saved.windowEnd
      )
        fail("Saved delivery times cannot be changed by the planner.");
      resolved.push(saved);
      sources.push({ ref: doc.ref, fingerprint: hash(order) });
    } else {
      if (!id(d.placeId))
        fail("Select a mapped manual address.", "invalid-argument");
      resolved.push({
        ...d,
        ...point(await args.resolvePlace(d.placeId)),
        source: "manual",
      });
    }
  }
  const draft = validatePlannerDraft(
    { ...input, destinations: resolved },
    clock(),
  );
  const stop = (d) => ({
    coordinates: { lat: String(d.latitude), lng: String(d.longitude) },
    address: d.address,
  });
  const n = draft.destinations.length;
  await reserveBudget(db, 3 * n - 2, clock());
  const quote = async (destinations, optimized = false) => {
    const requested = [pickup, ...destinations];
    const scheduleAt = new Date(
      `${draft.date}T${draft.pickupTime}:00+08:00`,
    ).toISOString();
    const raw = await provider.createQuote({
      market: "MY",
      data: {
        serviceType,
        language: "en_MY",
        scheduleAt,
        isRouteOptimized: optimized,
        stops: requested.map(stop),
      },
    });
    if (
      !text(raw?.quotationId) ||
      Date.parse(raw.scheduleAt) !== Date.parse(scheduleAt) ||
      raw.serviceType !== serviceType ||
      raw.priceBreakdown?.currency !== "MYR" ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(raw.priceBreakdown.total)) ||
      Date.parse(raw.expiresAt) <= clock().getTime() ||
      !Number.isFinite(Date.parse(raw.expiresAt)) ||
      raw.stops?.length !== requested.length
    )
      fail("Invalid or expired Sandbox quotation.");
    const remaining = destinations.slice();
    const sequence = [];
    const same = (a, b) =>
      Math.abs(Number(a?.coordinates?.lat) - b.latitude) < 1e-8 &&
      Math.abs(Number(a?.coordinates?.lng) - b.longitude) < 1e-8;
    if (!same(raw.stops[0], pickup))
      fail("Provider changed the kitchen pickup.");
    for (const s of raw.stops.slice(1)) {
      const i = remaining.findIndex(
        (d) => same(s, d) && (!optimized || s.address === d.address),
      );
      if (i < 0) fail("Provider returned an unrecognized destination.");
      sequence.push(remaining.splice(i, 1)[0]);
    }
    if (!optimized && sequence.some((d, i) => d.id !== destinations[i].id))
      fail("Provider changed the manual route.");
    const feeMinor = Math.round(Number(raw.priceBreakdown.total) * 100);
    if (!Number.isSafeInteger(feeMinor) || feeMinor > 10000000)
      fail("Invalid provider amount.");
    return {
      quotationId: raw.quotationId,
      expiresAt: raw.expiresAt,
      feeMinor,
      serviceType,
      priceBreakdown: raw.priceBreakdown,
      stops: raw.stops,
      requestedOptimization: optimized,
      providerOptimized: raw.isRouteOptimized === true,
      sequence: sequence.map((d) => d.id),
      timing: planSequence(sequence, draft.pickupTime, limits),
      distance: raw.distance || null,
    };
  };
  const individual = [];
  for (const d of draft.destinations) individual.push(await quote([d]));
  const buffer = fixedDeliveryBuffer(store.delivery, serviceType);
  // Explain the existing policy decision without changing fee calculation or
  // applying defaults when the Store has no applicable buffer policy.
  const configured = store.delivery.fixedDeliveryBuffer;
  const pricingPolicy = {
    status: buffer
      ? "applied"
      : !configured
        ? "missing"
        : serviceType !== "MOTORCYCLE"
          ? "vehicle_not_applicable"
          : configured.enabled !== true
            ? "disabled"
            : "invalid",
    serviceType,
    configuredBufferMinor:
      Number.isSafeInteger(configured?.amountMinor) &&
      configured.amountMinor >= 0
        ? configured.amountMinor
        : null,
    configuredMaximumExtraCostMinor:
      Number.isSafeInteger(configured?.maximumExtraCostMinor) &&
      configured.maximumExtraCostMinor >= 0
        ? configured.maximumExtraCostMinor
        : null,
  };
  const routes = [];
  for (let count = 1; count <= n; count++) {
    const destinations = draft.destinations.slice(0, count),
      base = individual.slice(0, count).map((q) => q.feeMinor);
    const manual = count === 1 ? individual[0] : await quote(destinations);
    const optimized = count === 1 ? null : await quote(destinations, true);
    const preview = (q) =>
      q
        ? {
            ...q,
            ...allocatePlannerFees(base, q.feeMinor, buffer?.amountMinor || 0),
            recommended:
              q.timing.feasible &&
              allocatePlannerFees(base, q.feeMinor, buffer?.amountMinor || 0)
                .economical,
            bufferMinor: buffer?.amountMinor || 0,
            maximumExtraCostMinor: buffer?.maximumExtraCostMinor || 0,
          }
        : null;
    routes.push({
      count,
      individualTotalMinor: base.reduce((a, b) => a + b, 0),
      incrementalMinor:
        count === 1
          ? manual.feeMinor
          : manual.feeMinor - routes.at(-1).manual.feeMinor,
      manual: preview(manual),
      optimized: preview(optimized),
    });
  }
  const refreshed = await loadReviewStore(args);
  if (hash(refreshed.delivery) !== hash(store.delivery))
    fail("Store delivery configuration changed. Refresh quotations.");
  for (const source of sources) {
    const doc = await source.ref.get();
    if (hash({ ...doc.data(), id: doc.id }) !== source.fingerprint)
      fail("A saved delivery changed while quoting. Refresh the plan.");
  }
  const all = [
    ...individual,
    ...routes.flatMap((r) => [r.manual, r.optimized].filter(Boolean)),
  ];
  const expiresAt = new Date(
    Math.min(...all.map((q) => Date.parse(q.expiresAt))),
  ).toISOString();
  if (Date.parse(expiresAt) <= clock().getTime() + 5000)
    fail("Comparison expired while quoting. Request a fresh comparison.");
  return {
    environment: "sandbox",
    pricingPolicy,
    currency: "MYR",
    createdAt: clock().toISOString(),
    expiresAt,
    fingerprint: hash({ draft, delivery: store.delivery }),
    draft,
    individual,
    routes,
    subsidyMinor: 0,
    arrivalBasis:
      "Planning assumption only: fixed minutes per leg plus service and waiting time; no traffic or provider arrival estimate.",
    pricingNotice:
      "Sandbox provider prices are mock values, not Production rates. Customer charges are unchanged.",
  };
};
