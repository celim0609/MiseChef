import { canonicalSchedule, buildOrderFulfilments } from './storeOrderFulfilments.js';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { randomBytes, createHash } from 'node:crypto';
import { buildOrderItems, getValidPickupDates, getPickupTimeSlots, readString } from './storePaymentsCore.js';
import { loadStoreCheckoutData } from './storePayments.js';
import { calculatePromotionPricing } from './storePromotionPricing.js';

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
// This buffer applies at the checkout-to-payment boundary. It is returned with
// a quote so the browser never presents a quote as payable when the server
// would reject it as too close to expiry.
export const DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS = 5_000;
const coord = (value, maximum = 180) => {
  const raw = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const numeric = raw === '' ? NaN : Number(raw);
  return Number.isFinite(numeric) && Math.abs(numeric) <= maximum ? String(numeric) : '';
};
export const sameDeliveryCoordinates = (left, right) => coord(left) !== '' && coord(left) === coord(right);
const deliveryError = message => new HttpsError('failed-precondition', message);
const deliveryConfig = store => store?.delivery && typeof store.delivery === 'object' ? store.delivery : {};
const validateDestination = destination => {
  const address = readString(destination?.formattedAddress);
  const latitude = coord(destination?.latitude, 90);
  const longitude = coord(destination?.longitude, 180);
  if (!address || address.length > 500 || !latitude || !longitude) throw deliveryError('Choose a delivery address with valid coordinates.');
  return { address, latitude, longitude, instructions: readString(destination?.deliveryInstructions).slice(0, 1500) };
};
const distanceKm = (from, to) => {
  const radians = value => Number(value) * Math.PI / 180;
  const dLat = radians(Number(to.latitude) - Number(from.latitude)); const dLng = radians(Number(to.longitude) - Number(from.longitude));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const validateStoreDelivery = (store, provider) => {
  const config = deliveryConfig(store);
  const pickup = config.pickup && typeof config.pickup === 'object' ? config.pickup : {};
  if (config.enabled !== true || config.provider !== 'lalamove' || readString(config.environment) !== readString(provider?.environment) || readString(config.market) !== 'MY') throw deliveryError('Delivery is not configured for this Store.');
  if (!readString(config.serviceType) || !readString(pickup.address) || !coord(pickup.latitude, 90) || !coord(pickup.longitude, 180) || !readString(pickup.contactName) || !/^\+[1-9]\d{1,14}$/.test(readString(pickup.contactPhoneE164))) throw deliveryError('This Store delivery pickup is incomplete.');
  return { config, pickup };
};
const assertDeliveryEnvironment = ({ delivery, provider }) => {
  // Legacy Sandbox orders pre-date the environment snapshot. They remain
  // operable only in Beta; a missing snapshot never defaults to Production.
  const environment = readString(delivery?.environment) || (readString(provider?.environment) === 'sandbox' ? 'sandbox' : '');
  if (!environment || environment !== readString(provider?.environment)) throw deliveryError('Delivery environment does not match this Firebase project.');
};
const validatePreOrderSchedule = (store, config, draft) => {
  const preOrder = config.fulfilment?.preOrder || { enabled: true, orderDays: store.orderDays, earliestDays: store.earliestPickupDays, maximumAdvanceDays: store.maximumAdvanceDays, unavailableDates: store.unavailableDates, sessions: store.pickupSessions };
  if (preOrder.enabled !== true) throw deliveryError('Pre-order delivery is unavailable for this Store.');
  const deliveryDate = readString(draft?.deliveryDate);
  const deliveryTime = readString(draft?.deliveryTime);
  const dates = getValidPickupDates({ country: store.country, orderDays: preOrder.orderDays, earliestPickupDays: preOrder.earliestDays, maximumAdvanceDays: preOrder.maximumAdvanceDays, unavailableDates: preOrder.unavailableDates });
  if (!dates.includes(deliveryDate)) throw deliveryError('Choose an available delivery date.');
  const hours = preOrder.deliveryHours || { from: '00:00', to: '23:59' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(deliveryTime) || deliveryTime < readString(hours.from) || deliveryTime > readString(hours.to)) throw deliveryError('Choose a delivery time within the configured delivery hours.');
  return { mode: 'preorder', date: deliveryDate, time: deliveryTime, timeZone: 'Asia/Kuala_Lumpur' };
};
const validateInstantSchedule = (store, config) => {
  const instant = config.fulfilment?.instant || {};
  if (instant.enabled !== true) throw deliveryError('Instant delivery is unavailable for this Store. Choose Pre-order delivery.');
  const zone = readString(store.timeZone) || 'Asia/Kuala_Lumpur';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const current = Number(parts.find(part => part.type === 'hour')?.value || 99) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 99);
  const minutes = value => { const match = /^(\d\d):(\d\d)$/.exec(readString(value)); return match ? Number(match[1]) * 60 + Number(match[2]) : -1; };
  const start = minutes(instant.operatingHours?.start); const end = minutes(instant.operatingHours?.end);
  const open = start >= 0 && end >= 0 && (start <= end ? current >= start && current < end : current >= start || current < end);
  if (!open) throw deliveryError('Instant delivery is currently unavailable. Choose Pre-order delivery.');
  return { mode: 'instant' };
};
const validateDeliverySchedule = (store, config, draft) => readString(draft?.fulfilmentMode) === 'instant' ? validateInstantSchedule(store, config) : validatePreOrderSchedule(store, config, draft);
export const malaysiaPreorderScheduleAt = schedule => new Date(`${schedule.date}T${schedule.time}:00+08:00`).toISOString();
export const assertFutureLalamoveSchedule = (schedule, now = Date.now()) => {
  if (schedule.mode !== 'preorder') return schedule;
  if (Date.parse(malaysiaPreorderScheduleAt(schedule)) <= now) {
    throw deliveryError('Choose a future delivery time.');
  }
  return schedule;
};
// Google Places coordinates are valid JavaScript numbers at higher precision
// than Lalamove accepts. Keep the selected location intact everywhere else,
// and canonicalize only the provider-bound representation (max 15 decimals).
export const lalamoveCoordinate = value => {
  const match = /^([+-]?\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) return '';
  return match[2] ? `${match[1]}.${match[2].slice(0, 15)}` : match[1];
};
export const buildLalamoveQuoteRequest = ({ config, pickup, destination, schedule }) => ({
  market: 'MY',
  data: {
    serviceType: config.serviceType,
    language: 'en_MY',
    ...(schedule.mode === 'preorder' ? { scheduleAt: malaysiaPreorderScheduleAt(schedule) } : {}),
    stops: [
      { coordinates: { lat: lalamoveCoordinate(pickup.latitude), lng: lalamoveCoordinate(pickup.longitude) }, address: pickup.address },
      { coordinates: { lat: lalamoveCoordinate(destination.latitude), lng: lalamoveCoordinate(destination.longitude) }, address: destination.address }
    ]
  }
});
const customerPricing = ({ providerFee, config, merchandiseSubtotal }) => {
  const subsidy = config.subsidy || {}; const eligible = subsidy.enabled === true && merchandiseSubtotal >= Number(subsidy.minimumMerchandiseSpend || 0);
  const customerDeliveryFee = eligible ? money(Math.min(providerFee, Number(subsidy.maximumCustomerDeliveryCharge || 0))) : providerFee;
  return { providerDeliveryFee: providerFee, customerDeliveryFee, storeAbsorbedDeliveryFee: money(Math.max(providerFee - customerDeliveryFee, 0)), subsidyEnabled: subsidy.enabled === true, subsidyApplied: eligible, minimumMerchandiseSpend: money(Math.max(0, Number(subsidy.minimumMerchandiseSpend || 0))), deliveryFeeCap: money(Math.max(0, Number(subsidy.maximumCustomerDeliveryCharge || 0))), currency: 'MYR' };
};
const quoteSnapshot = quote => ({ quotationId: readString(quote.quotationId), expiresAt: readString(quote.expiresAt), serviceType: readString(quote.serviceType), fee: money(quote.priceBreakdown?.total), currency: readString(quote.priceBreakdown?.currency), priceBreakdown: quote.priceBreakdown || {}, stops: quote.stops || [] });
// The provider may canonicalize a Google Places pin (for example, by snapping
// it to the routable point). Keep the Google address for the recipient, but
// bind payment revalidation to the coordinates Lalamove attached to its quote.
export const providerRoutingDestination = ({ quote, destination }) => {
  const dropoff = quote?.stops?.[1] || {};
  const latitude = coord(dropoff.coordinates?.lat);
  const longitude = coord(dropoff.coordinates?.lng);
  if (!latitude || !longitude) throw new Error('Lalamove returned an invalid quotation.');
  return { ...destination, latitude, longitude };
};
export const quoteMatchesDestination = ({ quote, destination }) => {
  const dropoff = quote?.stops?.[1] || {};
  return sameDeliveryCoordinates(dropoff.coordinates?.lat, destination?.latitude)
    && sameDeliveryCoordinates(dropoff.coordinates?.lng, destination?.longitude);
};
const ACTIVE_OPERATOR_ROLES = new Set(['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef']);
const assertWorkspaceOperator = async ({ db, uid, order }) => {
  const workspaceId = readString(order.workspaceId);
  const [workspaceSnapshot, membershipSnapshot] = await Promise.all([
    db.collection('workspaces').doc(workspaceId).get(),
    db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`).get()
  ]);
  const workspace = workspaceSnapshot.data() || {}; const membership = membershipSnapshot.data() || {};
  if (readString(workspace.ownerId) !== uid && !(membership.userId === uid && membership.workspaceId === workspaceId && membership.status === 'Active' && ACTIVE_OPERATOR_ROLES.has(readString(membership.role)))) throw new HttpsError('permission-denied', 'Your Workspace role cannot manage this delivery.');
};
export const mapLalamoveStatus = status => ({
  ASSIGNING_DRIVER: 'Finding driver', ON_GOING: 'Driver assigned', PICKED_UP: 'Picked up / On the way', COMPLETED: 'Delivered',
  CANCELED: 'Cancelled', EXPIRED: 'No driver found / Expired', REJECTED: 'Driver matching failed'
})[readString(status)] || 'Finding driver';

// This is deliberately a provider-status projection, not kitchen fulfilment.
// Lalamove does not publish "arriving" or "arrived" order statuses.
export const LALAMOVE_DELIVERY_LIFECYCLE = Object.freeze({
  ASSIGNING_DRIVER: 'assigning_driver',
  ON_GOING: 'driver_assigned',
  PICKED_UP: 'picked_up',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  REJECTED: 'rejected'
});
const TERMINAL_DELIVERY_STATES = new Set(['completed', 'canceled', 'expired', 'rejected']);
export const projectLalamoveLifecycle = ({ status, driverId }) => {
  const providerStatus = readString(status);
  if (providerStatus === 'ON_GOING' && readString(driverId)) return LALAMOVE_DELIVERY_LIFECYCLE.ON_GOING;
  return LALAMOVE_DELIVERY_LIFECYCLE[providerStatus] || 'assigning_driver';
};
const deliveryHistoryEntry = ({ state, providerStatus, source }) => ({
  state,
  providerStatus: readString(providerStatus),
  source,
  occurredAt: new Date().toISOString()
});
const canReplaceProviderState = ({ existingState, nextState }) => {
  if (existingState === nextState) return false;
  // A terminal provider result must not be overwritten by a late webhook/poll.
  return !TERMINAL_DELIVERY_STATES.has(existingState);
};

const deliveryScheduleBinding = draft => createHash('sha256').update(JSON.stringify({
  schedule: canonicalSchedule(draft), selections: draft.selections,
  address: validateDestination(draft.destination).address
})).digest('hex');
const scheduledDelivery = (store, draft) => {
  const entries = canonicalSchedule(draft);
  if (!entries) return { draft, entries: null };
  if (draft.fulfilmentMode === 'instant') throw deliveryError('Multiple fulfilments require pre-order delivery.');
  entries.forEach(entry => assertFutureLalamoveSchedule(validatePreOrderSchedule(store, deliveryConfig(store), { deliveryDate: entry.date, deliveryTime: entry.time })));
  return { entries, draft: { ...draft, fulfilmentMode: 'preorder', deliveryDate: entries[0].date, deliveryTime: entries[0].time } };
};

export const createStoreDeliveryQuote = async ({ db, provider, slug, draft }) => {
  const checkout = await loadStoreCheckoutData(db, slug);
  const { config, pickup } = validateStoreDelivery(checkout.store, provider);
  const destination = validateDestination(draft?.destination);
  if (distanceKm(pickup, destination) > Number(config.fulfilment?.preOrder?.maximumDistanceKm || Infinity)) throw deliveryError('This delivery address is outside the Store’s maximum delivery distance.');
  const scheduled = scheduledDelivery(checkout.store, draft);
  draft = scheduled.draft;
  const fulfilments = buildOrderFulfilments({ store: checkout.store, draft: { ...draft, fulfilmentMethod: 'delivery' }, products: checkout.products, getDates: getValidPickupDates, getTimes: getPickupTimeSlots });
  const schedule = assertFutureLalamoveSchedule(validateDeliverySchedule(checkout.store, config, draft));
  // Rebuild cart on the server. The browser does not send prices or service type.
  const items = buildOrderItems(draft?.selections || [], checkout.products, checkout.optionGroups, checkout.sets);
  if (!items.length) throw deliveryError('Your cart is empty.');
  const quotation = await provider.createQuote(buildLalamoveQuoteRequest({ config, pickup, destination, schedule }));
  const quote = quoteSnapshot(quotation);
  if (!quote.quotationId || quote.currency !== 'MYR' || !Number.isFinite(quote.fee) || quote.fee < 0 || !quote.expiresAt) throw new Error('Lalamove returned an invalid quotation.');
  const routingDestination = providerRoutingDestination({ quote, destination });
  const promotionPricing = calculatePromotionPricing({ items, promotions: checkout.promotions });
  const fulfilmentCount = fulfilments?.fulfilments.length || 1;
  const pricing = fulfilmentCount > 1 ? { customerDeliveryFee: money(quote.fee * fulfilmentCount) } : customerPricing({ providerFee: quote.fee, config, merchandiseSubtotal: promotionPricing.discountedMerchandiseTotal });
  // Bind the displayed promotion/delivery price to a server record. The
  // browser receives only an opaque id and cannot author a price baseline.
  const pricingSnapshotId = randomBytes(24).toString('hex');
  await db.collection('storeDeliveryQuoteSnapshots').doc(pricingSnapshotId).create({
    ...(fulfilments ? { scheduleBinding: deliveryScheduleBinding(draft), firstQuote: quote, fulfilmentCount, finalDeliveryTotal: pricing.customerDeliveryFee } : {}),
    storeId: checkout.store.id,
    quotationId: quote.quotationId,
    discountedMerchandiseTotal: promotionPricing.discountedMerchandiseTotal,
    deliveryFee: pricing.customerDeliveryFee,
    grandTotal: money(promotionPricing.discountedMerchandiseTotal + pricing.customerDeliveryFee),
    expiresAt: quote.expiresAt,
    createdAt: new Date().toISOString()
  });
  return { quote: { quotationId: quote.quotationId, expiresAt: quote.expiresAt, customerDeliveryFee: pricing.customerDeliveryFee, currency: 'MYR', minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS, ...(fulfilments ? { firstDayFee: fulfilmentCount > 1 ? quote.fee : pricing.customerDeliveryFee, fulfilmentCount } : {}) }, pricingSnapshotId, merchandiseSubtotal: promotionPricing.discountedMerchandiseTotal, destination: routingDestination, schedule };
};

export const getLalamoveSandboxCityInfo = async ({ db, uid, workspaceId, provider }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view delivery services.');
  const storeSnapshot = await db.collection('stores').doc(readString(workspaceId)).get();
  if (!storeSnapshot.exists) throw new HttpsError('not-found', 'This Store could not be found.');
  await assertWorkspaceOperator({ db, uid, order: { workspaceId: storeSnapshot.id } });
  return provider.getCityInfo('MY');
};

// A provider quotation cannot be atomically locked together with a third-party
// payment-session request. Refuse quotations that are about to expire before
// the order/payment boundary so no payment session is opened on a quote that
// is likely to expire while that boundary is crossed.
export const revalidateDeliveryForPayment = async ({ provider, store, draft, now = Date.now(), minimumValidityMs = 0, db }) => {
  const { config, pickup } = validateStoreDelivery(store, provider);
  const destination = validateDestination(draft?.destination);
  if (distanceKm(pickup, destination) > Number(config.fulfilment?.preOrder?.maximumDistanceKm || Infinity)) throw deliveryError('This delivery address is outside the Store’s maximum delivery distance.');
  const scheduled = scheduledDelivery(store, draft);
  draft = scheduled.draft;
  const schedule = validateDeliverySchedule(store, config, draft);
  const quote = quoteSnapshot(await provider.retrieveQuote({ market: 'MY', quotationId: readString(draft?.deliveryQuoteId) }));
  if (!quote.quotationId || quote.currency !== 'MYR' || !Number.isFinite(quote.fee) || quote.fee < 0 || Date.parse(quote.expiresAt) <= Number(now) + Number(minimumValidityMs) || quote.serviceType !== config.serviceType || quote.stops.length !== 2) throw deliveryError('Refresh your delivery quote before checkout.');
  // Lalamove returns coordinates as either JSON numbers or strings. Coordinates
  // are the provider routing identity; display-address differences must not
  // turn an otherwise identical selected place into a false mismatch.
  if (!quoteMatchesDestination({ quote, destination })) throw deliveryError('Delivery quote no longer matches the selected address.');
  if (scheduled.entries) {
    const snapshot = await (db || getFirestore()).collection('storeDeliveryQuoteSnapshots').doc(readString(draft.deliveryPricingSnapshotId)).get();
    const stored = snapshot.exists ? snapshot.data() : null;
    if (!stored || stored.storeId !== (store.id || store.workspaceId) || stored.quotationId !== quote.quotationId
      || stored.scheduleBinding !== deliveryScheduleBinding(draft) || stored.fulfilmentCount !== scheduled.entries.length
      || stored.firstQuote?.fee !== quote.fee) throw deliveryError('Fulfilment schedule or delivery pricing changed. Refresh your delivery quote.');
  }
  return { fulfilmentMethod: 'delivery', fulfilmentMode: schedule.mode, environment: provider.environment, ...(schedule.mode === 'preorder' ? { schedule } : {}), quote, pickup: { name: readString(pickup.name), address: readString(pickup.address), latitude: pickup.latitude, longitude: pickup.longitude, contactName: pickup.contactName, contactPhoneE164: pickup.contactPhoneE164 }, recipient: { name: readString(draft.customerName), phoneE164: readString(draft.phone), address: destination.address, latitude: destination.latitude, longitude: destination.longitude, instructions: destination.instructions }, dispatch: { status: 'not_requested' }, lifecycle: { state: 'not_started' } };
};

export const dispatchStoreDelivery = async ({ db, provider, uid, orderId, fulfilmentId }) => {
  if (fulfilmentId !== undefined) return dispatchFulfilmentDelivery({ db, provider, uid, orderId, fulfilmentId });
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to dispatch this order.');
  const orderRef = db.collection('storeOrders').doc(readString(orderId));
  const authorizationSnapshot = await orderRef.get();
  if (!authorizationSnapshot.exists) throw new HttpsError('not-found', 'This order could not be found.');
  await assertWorkspaceOperator({ db, uid, order: authorizationSnapshot.data() || {} });
  const result = await db.runTransaction(async transaction => {
    const snap = await transaction.get(orderRef); if (!snap.exists) throw new HttpsError('not-found', 'This order could not be found.');
    const order = snap.data();
    if (order.fulfilments) throw deliveryError('Choose a fulfilment to dispatch.');
    const delivery = order.delivery || {};
    const instant = delivery.fulfilmentMode === 'instant';
    const kitchenEligible = instant
      ? ['Preparing', 'Ready'].includes(readString(order.fulfilmentStatus))
      : readString(order.fulfilmentStatus) === 'Ready';
    if (order.payment?.status !== 'paid' || !kitchenEligible || delivery.fulfilmentMethod !== 'delivery') throw deliveryError(instant ? 'Only preparing or ready, paid instant delivery orders can find a driver.' : 'Only ready, paid pre-order delivery orders can be dispatched.');
    if (TERMINAL_DELIVERY_STATES.has(readString(delivery.lifecycle?.state))) throw deliveryError('This delivery is terminal. Merchant review is required before requesting a replacement.');
    if (delivery.dispatch?.status === 'created') return { order, alreadyCreated: true };
    if (delivery.dispatch?.status === 'creating') return { order, alreadyCreating: true };
    transaction.update(orderRef, {
      'delivery.dispatch.status': 'creating',
      'delivery.dispatch.requestedBy': uid,
      'delivery.dispatch.requestedAt': FieldValue.serverTimestamp(),
      'delivery.dispatch.attempt': Number(delivery.dispatch?.attempt || 0) + 1,
      'delivery.lifecycle.state': 'assigning_driver',
      'delivery.lifecycle.providerStatus': 'ASSIGNING_DRIVER',
      'delivery.lifecycle.changedAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return { order, alreadyCreated: false };
  });
  if (result.alreadyCreated) return { status: 'created' };
  if (result.alreadyCreating) return { status: 'creating' };
  const delivery = result.order.delivery;
  assertDeliveryEnvironment({ delivery, provider });
  // Always quote again at dispatch; GG may absorb at most RM5.
  try {
  const fresh = await provider.createQuote({ market: 'MY', data: { serviceType: delivery.quote.serviceType, language: 'en_MY', stops: delivery.quote.stops.map(stop => ({ coordinates: stop.coordinates, address: stop.address })) } });
  const freshQuote = quoteSnapshot(fresh); const difference = money(freshQuote.fee - Number(delivery.quote.fee));
  if (difference > 5) { await orderRef.update({ 'delivery.dispatch.status': 'dispatch_blocked_requote', 'delivery.dispatch.errorCode': 'requote_exceeds_absorption_limit', 'delivery.dispatch.requoteFee': freshQuote.fee }); return { status: 'dispatch_blocked_requote', difference }; }
  const [senderStop, recipientStop] = freshQuote.stops;
  const created = await provider.createOrder({ market: 'MY', data: { quotationId: freshQuote.quotationId, sender: { stopId: senderStop.stopId, name: delivery.pickup.contactName, phone: delivery.pickup.contactPhoneE164 }, recipients: [{ stopId: recipientStop.stopId, name: delivery.recipient.name, phone: delivery.recipient.phoneE164, remarks: delivery.recipient.instructions }], isPODEnabled: true, metadata: { misechefOrderId: result.order.id, misechefOrderNumber: result.order.orderNumber } } });
  const lifecycleState = projectLalamoveLifecycle(created);
  await orderRef.update({
    'delivery.dispatch.status': 'created',
    'delivery.providerOrder': { orderId: created.orderId, quotationId: created.quotationId, status: created.status, driverId: created.driverId || '', shareLink: created.shareLink || '', priceBreakdown: created.priceBreakdown || {}, lastSyncedAt: FieldValue.serverTimestamp() },
    'delivery.lifecycle.state': lifecycleState,
    'delivery.lifecycle.providerStatus': readString(created.status) || 'ASSIGNING_DRIVER',
    'delivery.lifecycle.changedAt': FieldValue.serverTimestamp(),
    'delivery.lifecycle.history': [deliveryHistoryEntry({ state: lifecycleState, providerStatus: created.status || 'ASSIGNING_DRIVER', source: 'create_order' })],
    updatedAt: FieldValue.serverTimestamp()
  });
  return { status: 'created', orderId: created.orderId };
  } catch (error) {
    await orderRef.update({ 'delivery.dispatch.status': 'failed', 'delivery.dispatch.errorCode': readString(error?.message).slice(0, 120) || 'provider_error', 'delivery.lifecycle.state': 'not_started', updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    throw error;
  }
};

const providerDriverSnapshot = async ({ provider, detail }) => {
  const driverId = readString(detail.driverId);
  if (!driverId) return null;
  try {
    const driver = await provider.retrieveDriver({ market: 'MY', orderId: readString(detail.orderId), driverId });
    return {
      driverId,
      name: readString(driver.name), phone: readString(driver.phone), plateNumber: readString(driver.plateNumber), photo: readString(driver.photo),
      coordinates: driver.coordinates && readString(driver.coordinates.lat) && readString(driver.coordinates.lng)
        ? { lat: readString(driver.coordinates.lat), lng: readString(driver.coordinates.lng), updatedAt: readString(driver.coordinates.updatedAt) }
        : undefined,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    // Lalamove returns 403 until driver details are permitted. It is not a delivery failure.
    if (Number(error?.status) === 403 || /403|forbidden/i.test(readString(error?.message))) return null;
    throw error;
  }
};
const buildProviderDetailUpdate = async ({ provider, order, detail, source }) => {
  const providerStatus = readString(detail.status);
  const nextState = projectLalamoveLifecycle(detail);
  const currentState = readString(order.delivery?.lifecycle?.state);
  const stateChanged = canReplaceProviderState({ existingState: currentState, nextState });
  const driver = await providerDriverSnapshot({ provider, detail });
  const update = {
    'delivery.providerOrder.status': providerStatus,
    'delivery.providerOrder.driverId': readString(detail.driverId),
    'delivery.providerOrder.shareLink': readString(detail.shareLink),
    'delivery.providerOrder.priceBreakdown': detail.priceBreakdown || {},
    'delivery.providerOrder.lastSyncedAt': FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  if (TERMINAL_DELIVERY_STATES.has(currentState) && currentState !== nextState) {
    // A delayed poll/event must not make a terminal operational state look active again.
    delete update['delivery.providerOrder.status'];
    delete update['delivery.providerOrder.driverId'];
    delete update['delivery.providerOrder.shareLink'];
    delete update['delivery.providerOrder.priceBreakdown'];
  }
  if (driver) update['delivery.providerOrder.driver'] = driver;
  if (stateChanged) {
    update['delivery.lifecycle.state'] = nextState;
    update['delivery.lifecycle.providerStatus'] = providerStatus;
    update['delivery.lifecycle.changedAt'] = FieldValue.serverTimestamp();
    update['delivery.lifecycle.history'] = FieldValue.arrayUnion(deliveryHistoryEntry({ state: nextState, providerStatus, source }));
  }
  if (TERMINAL_DELIVERY_STATES.has(nextState)) update['delivery.dispatch.status'] = nextState === 'completed' ? 'completed' : 'provider_terminal';
  if (nextState === 'completed') { update.fulfilmentStatus = 'Completed'; update.completedAt = FieldValue.serverTimestamp(); }
  return { update, nextState };
};

export const refreshStoreDelivery = async ({ db, provider, uid, orderId, fulfilmentId }) => {
  if (fulfilmentId !== undefined) return refreshFulfilmentDelivery({ db, provider, uid, orderId, fulfilmentId });
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to refresh this delivery.');
  const ref = db.collection('storeOrders').doc(readString(orderId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'This order could not be found.');
  const order = snapshot.data() || {};
  if (order.fulfilments) throw deliveryError('Choose a fulfilment to refresh.');
  const delivery = order.delivery || {}; const providerOrderId = readString(delivery.providerOrder?.orderId);
  await assertWorkspaceOperator({ db, uid, order });
  assertDeliveryEnvironment({ delivery, provider });
  if (!providerOrderId) throw deliveryError('This delivery has not been dispatched.');
  const detail = await provider.retrieveOrder({ market: 'MY', orderId: providerOrderId });
  const { update, nextState } = await buildProviderDetailUpdate({ provider, order, detail: { ...detail, orderId: providerOrderId }, source: 'manual_refresh' });
  await ref.update(update);
  return { status: readString(detail.status), lifecycleState: nextState };
};

export const cancelStoreDelivery = async ({ db, provider, uid, orderId, fulfilmentId }) => {
  if (fulfilmentId !== undefined) return cancelFulfilmentDelivery({ db, provider, uid, orderId, fulfilmentId });
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to cancel this delivery.');
  const ref = db.collection('storeOrders').doc(readString(orderId)); const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This order could not be found.');
  const order = snap.data() || {};
  if (order.fulfilments) throw deliveryError('Choose a fulfilment to cancel.');
  await assertWorkspaceOperator({ db, uid, order });
  assertDeliveryEnvironment({ delivery: order.delivery || {}, provider });
  const providerOrderId = readString(order.delivery?.providerOrder?.orderId);
  if (!providerOrderId) throw deliveryError('This delivery has not been dispatched.');
  if (order.delivery?.dispatch?.status === 'cancelled') return { status: 'cancelled' };
  await ref.update({ 'delivery.dispatch.status': 'cancel_requested', updatedAt: FieldValue.serverTimestamp() });
  try { await provider.cancelOrder({ market: 'MY', orderId: providerOrderId }); }
  catch (error) { await ref.update({ 'delivery.dispatch.status': 'created', 'delivery.dispatch.errorCode': readString(error?.message).slice(0, 120) || 'cancel_failed' }); throw error; }
  await ref.update({ 'delivery.dispatch.status': 'cancelled', 'delivery.providerOrder.status': 'CANCELED', 'delivery.lifecycle.state': 'canceled', 'delivery.lifecycle.providerStatus': 'CANCELED', 'delivery.lifecycle.changedAt': FieldValue.serverTimestamp(), 'delivery.lifecycle.history': FieldValue.arrayUnion(deliveryHistoryEntry({ state: 'canceled', providerStatus: 'CANCELED', source: 'merchant_cancel' })), updatedAt: FieldValue.serverTimestamp() });
  return { status: 'cancelled' };
};

export const reconcileActiveDeliveries = async ({ db, provider, limit = 50 }) => {
  await reconcileFulfilmentDeliveries({ db, provider, limit });
  const active = await db.collection('storeOrders').where('delivery.dispatch.status', 'in', ['created', 'cancel_requested']).limit(limit).get();
  return Promise.all(active.docs.map(async doc => {
    const order = doc.data(); const providerOrderId = readString(order.delivery?.providerOrder?.orderId); if (!providerOrderId) return null;
    try {
      assertDeliveryEnvironment({ delivery: order.delivery || {}, provider });
      const detail = await provider.retrieveOrder({ market: 'MY', orderId: providerOrderId });
      const { update } = await buildProviderDetailUpdate({ provider, order, detail: { ...detail, orderId: providerOrderId }, source: 'scheduled_reconciliation' });
      await doc.ref.update(update);
      return readString(detail.status);
    } catch { return null; }
  }));
};


// Multi-day operations never write order.total, totals, deliveryPricingSnapshot,
// payment or the immutable fulfilments array.
const fulfilmentContext = async ({ db, provider, uid, orderId, fulfilmentId, internal = false }) => {
  if (!internal && !uid) throw new HttpsError('unauthenticated', 'Sign in to manage this delivery.');
  const ref = db.collection('storeOrders').doc(readString(orderId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'This order could not be found.');
  const order = snapshot.data();
  if (!internal) await assertWorkspaceOperator({ db, uid, order });
  const entry = order.fulfilments?.find(entry => entry.id === fulfilmentId && entry.method === 'delivery');
  if (!entry || order.fulfilmentMethod !== 'delivery') throw deliveryError('Choose a delivery fulfilment.');
  assertDeliveryEnvironment({ delivery: order.delivery, provider });
  return { ref, order, entry, key: `fulfilmentOperations.${entry.id}` };
};

export const dispatchFulfilmentDelivery = async args => {
  const { db, provider, uid, orderId, fulfilmentId } = args;
  const { ref, entry, key } = await fulfilmentContext(args);
  const claim = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref); const order = snapshot.data();
    const operation = order.fulfilmentOperations?.[entry.id] || {};
    if (order.payment?.status !== 'paid' || order.fulfilmentStatus === 'Cancelled' || operation.kitchenStatus !== 'Ready') throw deliveryError('Only ready, paid delivery fulfilments can be dispatched.');
    if (['creating', 'created', 'outcome_unknown', 'completed', 'cancel_requested', 'cancelled', 'provider_terminal'].includes(operation.dispatch?.status)) return { reused: operation.dispatch.status };
    transaction.update(ref, { [`${key}.dispatch`]: { status: 'creating', identity: `${ref.id}:${entry.id}`, requestedBy: uid, requestedAt: new Date().toISOString(), attempt: Number(operation.dispatch?.attempt || 0) + 1 }, activeFulfilmentDeliveries: true, updatedAt: FieldValue.serverTimestamp() });
    return { order };
  });
  if (claim.reused) return { status: claim.reused };
  let submitted = false; let created;
  try {
    const delivery = claim.order.delivery;
    const schedule = { mode: 'preorder', date: entry.date, time: entry.time };
    // At dispatch time expired scheduled slots are requested immediately. Future
    // slots retain their date/time. This is operational pricing only.
    const request = buildLalamoveQuoteRequest({ config: { serviceType: delivery.quote.serviceType }, pickup: delivery.pickup, destination: delivery.recipient,
      schedule: Date.parse(malaysiaPreorderScheduleAt(schedule)) > Date.now() ? schedule : { mode: 'instant' } });
    const fresh = quoteSnapshot(await provider.createQuote(request));
    if (!fresh.quotationId || !Number.isFinite(fresh.fee) || fresh.fee < 0 || fresh.currency !== 'MYR' || fresh.stops.length !== 2) throw deliveryError('Invalid dispatch quotation.');
    const [sender, recipient] = fresh.stops;
    // Persist submission intent before the external side effect. A crash here
    // remains locked; reconciliation never automatically resubmits it.
    await ref.update({ [`${key}.dispatch.submissionStartedAt`]: new Date().toISOString(), [`${key}.dispatch.operationalQuote`]: fresh });
    submitted = true;
    created = await provider.createOrder({ market: 'MY', data: { quotationId: fresh.quotationId,
      sender: { stopId: sender.stopId, name: delivery.pickup.contactName, phone: delivery.pickup.contactPhoneE164 },
      recipients: [{ stopId: recipient.stopId, name: delivery.recipient.name, phone: delivery.recipient.phoneE164, remarks: delivery.recipient.instructions }], isPODEnabled: true,
      metadata: { misechefOrderId: ref.id, misechefFulfilmentId: entry.id, misechefDispatchIdentity: `${ref.id}:${entry.id}` } } });
    if (!readString(created.orderId)) throw new Error('Provider did not return an order ID.');
    // Terminal outcomes are applied transactionally by the same reconciliation
    // path as later polls, so an immediate COMPLETED response cannot skip a day.
    const state = 'assigning_driver';
    await ref.update({ [`${key}.dispatch.status`]: 'created', [`${key}.providerOrder`]: { orderId: created.orderId, quotationId: created.quotationId || fresh.quotationId, status: created.status || '', priceBreakdown: created.priceBreakdown || {} },
      [`${key}.lifecycle`]: { state: state, providerStatus: created.status || '', changedAt: new Date().toISOString() }, updatedAt: FieldValue.serverTimestamp() });
    if (TERMINAL_DELIVERY_STATES.has(projectLalamoveLifecycle(created))) await refreshFulfilmentDelivery(args);
    return { status: 'created', orderId: created.orderId };
  } catch (error) {
    await ref.update({ [`${key}.dispatch.status`]: submitted ? 'outcome_unknown' : 'failed',
      ...(created?.orderId ? { [`${key}.providerOrder.orderId`]: created.orderId } : {}),
      [`${key}.dispatch.errorCode`]: readString(error.message).slice(0, 120), updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    throw error;
  }
};

export const refreshFulfilmentDelivery = async args => {
  const { db, provider } = args;
  const { ref, order, entry, key } = await fulfilmentContext(args);
  const operation = order.fulfilmentOperations?.[entry.id] || {};
  const providerOrderId = readString(operation.providerOrder?.orderId);
  if (!providerOrderId) {
    if (operation.dispatch?.status === 'creating' && Date.now() - Date.parse(operation.dispatch.requestedAt) > 120000) {
      await db.runTransaction(async transaction => {
        const fresh = (await transaction.get(ref)).data()?.fulfilmentOperations?.[entry.id];
        if (fresh?.dispatch?.status === 'creating' && !fresh?.providerOrder?.orderId) transaction.update(ref, { [`${key}.dispatch.status`]: 'outcome_unknown' });
      });
    }
    return { status: operation.dispatch?.status || 'not_requested', lifecycleState: operation.lifecycle?.state || 'not_started' };
  }
  const detail = await provider.retrieveOrder({ market: 'MY', orderId: providerOrderId });
  const nextState = projectLalamoveLifecycle(detail);
  const driver = await providerDriverSnapshot({ provider, detail: { ...detail, orderId: providerOrderId } });
  return db.runTransaction(async transaction => {
    const fresh = (await transaction.get(ref)).data(); const current = fresh.fulfilmentOperations?.[entry.id] || {};
    if (current.providerOrder?.orderId !== providerOrderId) throw deliveryError('Dispatch changed; refresh again.');
    if (TERMINAL_DELIVERY_STATES.has(current.lifecycle?.state)) return { status: current.providerOrder.status, lifecycleState: current.lifecycle.state };
    const update = { [`${key}.providerOrder.status`]: readString(detail.status), [`${key}.providerOrder.priceBreakdown`]: detail.priceBreakdown || {},
      ...(driver ? { [`${key}.providerOrder.driver`]: driver } : {}),
      [`${key}.lifecycle`]: { state: nextState, providerStatus: readString(detail.status), changedAt: new Date().toISOString() },
      [`${key}.dispatch.status`]: nextState === 'completed' ? 'completed' : TERMINAL_DELIVERY_STATES.has(nextState) ? 'provider_terminal' : 'created', updatedAt: FieldValue.serverTimestamp() };
    if (nextState === 'completed') {
      const completion = { ...(fresh.fulfilmentCompletion || {}), [entry.id]: { completedAt: new Date().toISOString(), completedBy: 'lalamove' } };
      update.fulfilmentCompletion = completion;
      if (fresh.fulfilments.every(day => completion[day.id])) { update.fulfilmentStatus = 'Completed'; update.completedAt = FieldValue.serverTimestamp(); }
    }
    transaction.update(ref, update);
    return { status: readString(detail.status), lifecycleState: nextState };
  });
};

export const cancelFulfilmentDelivery = async args => {
  const { provider, db } = args;
  const { ref, entry, key } = await fulfilmentContext(args);
  const providerOrderId = await db.runTransaction(async transaction => {
    const order = (await transaction.get(ref)).data(); const operation = order.fulfilmentOperations?.[entry.id] || {};
    if (operation.dispatch?.status === 'cancel_requested' || operation.dispatch?.status === 'cancelled') return '';
    if (!operation.providerOrder?.orderId || TERMINAL_DELIVERY_STATES.has(operation.lifecycle?.state)) throw deliveryError('This dispatch cannot be cancelled.');
    transaction.update(ref, { [`${key}.dispatch.status`]: 'cancel_requested' });
    return operation.providerOrder.orderId;
  });
  if (!providerOrderId) return { status: 'cancel_requested' };
  // A timeout remains cancel_requested for provider reconciliation, never an
  // automatic new dispatch or a customer financial adjustment.
  await provider.cancelOrder({ market: 'MY', orderId: providerOrderId });
  return refreshFulfilmentDelivery(args);
};

const reconcileFulfilmentDeliveries = async ({ db, provider, limit }) => {
  const active = await db.collection('storeOrders').where('activeFulfilmentDeliveries', '==', true).limit(limit).get();
  for (const doc of active.docs) {
    const order = doc.data();
    for (const entry of order.fulfilments || []) {
      const operation = order.fulfilmentOperations?.[entry.id];
      if (!operation?.dispatch || ['completed', 'provider_terminal', 'cancelled', 'failed'].includes(operation.dispatch.status)) continue;
      await refreshFulfilmentDelivery({ db, provider, orderId: doc.id, fulfilmentId: entry.id, internal: true }).catch(() => undefined);
    }
    await db.runTransaction(async transaction => {
      const fresh = (await transaction.get(doc.ref)).data();
      const pending = Object.values(fresh.fulfilmentOperations || {}).some(operation => ['creating', 'created', 'cancel_requested'].includes(operation.dispatch?.status) || (operation.dispatch?.status === 'outcome_unknown' && operation.providerOrder?.orderId));
      if (!pending) transaction.update(doc.ref, { activeFulfilmentDeliveries: false });
    });
  }
};
