import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildOrderItems, getValidPickupDates, readString } from './storePaymentsCore.js';
import { loadStoreCheckoutData } from './storePayments.js';

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
// This buffer applies at the checkout-to-payment boundary. It is returned with
// a quote so the browser never presents a quote as payable when the server
// would reject it as too close to expiry.
export const DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS = 5_000;
const coord = value => {
  const raw = typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  return /^-?\d{1,3}(\.\d{1,15})?$/.test(raw) && Math.abs(Number(raw)) <= 180 ? String(Number(raw)) : '';
};
export const sameDeliveryCoordinates = (left, right) => coord(left) !== '' && coord(left) === coord(right);
const deliveryError = message => new HttpsError('failed-precondition', message);
const deliveryConfig = store => store?.delivery && typeof store.delivery === 'object' ? store.delivery : {};
const validateDestination = destination => {
  const address = readString(destination?.formattedAddress);
  const latitude = coord(destination?.latitude);
  const longitude = coord(destination?.longitude);
  if (!address || address.length > 500 || !latitude || !longitude) throw deliveryError('Choose a delivery address with valid coordinates.');
  return { address, latitude, longitude, instructions: readString(destination?.deliveryInstructions).slice(0, 1500) };
};
const validateStoreDelivery = store => {
  const config = deliveryConfig(store);
  const pickup = config.pickup && typeof config.pickup === 'object' ? config.pickup : {};
  if (config.enabled !== true || config.provider !== 'lalamove' || config.environment !== 'sandbox' || readString(config.market) !== 'MY') throw deliveryError('Delivery is not configured for this Store.');
  if (!readString(config.serviceType) || !readString(pickup.address) || !coord(pickup.latitude) || !coord(pickup.longitude) || !readString(pickup.contactName) || !/^\+[1-9]\d{1,14}$/.test(readString(pickup.contactPhoneE164))) throw deliveryError('This Store delivery pickup is incomplete.');
  return { config, pickup };
};
const validatePreOrderSchedule = (store, config, draft) => {
  const preOrder = config.fulfilment?.preOrder || { enabled: true, orderDays: store.orderDays, earliestDays: store.earliestPickupDays, maximumAdvanceDays: store.maximumAdvanceDays, unavailableDates: store.unavailableDates, sessions: store.pickupSessions };
  if (preOrder.enabled !== true) throw deliveryError('Pre-order delivery is unavailable for this Store.');
  const deliveryDate = readString(draft?.deliveryDate);
  const deliverySession = readString(draft?.deliverySession);
  const dates = getValidPickupDates({ country: store.country, orderDays: preOrder.orderDays, earliestPickupDays: preOrder.earliestDays, maximumAdvanceDays: preOrder.maximumAdvanceDays, unavailableDates: preOrder.unavailableDates });
  if (!dates.includes(deliveryDate)) throw deliveryError('Choose an available delivery date.');
  if (!Array.isArray(preOrder.sessions) || !preOrder.sessions.includes(deliverySession)) throw deliveryError('Choose a valid delivery session.');
  return { mode: 'preorder', date: deliveryDate, session: deliverySession, timeZone: 'Asia/Kuala_Lumpur' };
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
const customerPricing = ({ providerFee, config, merchandiseSubtotal }) => {
  const subsidy = config.subsidy || {}; const eligible = subsidy.enabled === true && merchandiseSubtotal >= Number(subsidy.minimumMerchandiseSpend || 0);
  const customerDeliveryFee = eligible ? money(Math.min(providerFee, Number(subsidy.maximumCustomerDeliveryCharge || 0))) : providerFee;
  return { providerDeliveryFee: providerFee, customerDeliveryFee, storeAbsorbedDeliveryFee: money(Math.max(providerFee - customerDeliveryFee, 0)), subsidyEnabled: subsidy.enabled === true, subsidyApplied: eligible, minimumMerchandiseSpend: money(Math.max(0, Number(subsidy.minimumMerchandiseSpend || 0))), deliveryFeeCap: money(Math.max(0, Number(subsidy.maximumCustomerDeliveryCharge || 0))), currency: 'MYR' };
};
const quoteSnapshot = quote => ({ quotationId: readString(quote.quotationId), expiresAt: readString(quote.expiresAt), serviceType: readString(quote.serviceType), fee: money(quote.priceBreakdown?.total), currency: readString(quote.priceBreakdown?.currency), priceBreakdown: quote.priceBreakdown || {}, stops: quote.stops || [] });
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

export const createStoreDeliveryQuote = async ({ db, provider, slug, draft }) => {
  const checkout = await loadStoreCheckoutData(db, slug);
  const { config, pickup } = validateStoreDelivery(checkout.store);
  const destination = validateDestination(draft?.destination);
  const schedule = validateDeliverySchedule(checkout.store, config, draft);
  // Rebuild cart on the server. The browser does not send prices or service type.
  const items = buildOrderItems(draft?.selections || [], checkout.products, checkout.optionGroups, checkout.sets);
  if (!items.length) throw deliveryError('Your cart is empty.');
  const quotation = await provider.createQuote({ market: 'MY', data: { serviceType: config.serviceType, language: 'en_MY', stops: [
    { coordinates: { lat: pickup.latitude, lng: pickup.longitude }, address: pickup.address },
    { coordinates: { lat: destination.latitude, lng: destination.longitude }, address: destination.address }
  ] } });
  const quote = quoteSnapshot(quotation);
  if (!quote.quotationId || quote.currency !== 'MYR' || quote.fee < 0 || !quote.expiresAt) throw new Error('Lalamove returned an invalid quotation.');
  const merchandiseSubtotal = money(items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const pricing = customerPricing({ providerFee: quote.fee, config, merchandiseSubtotal });
  return { quote: { quotationId: quote.quotationId, expiresAt: quote.expiresAt, customerDeliveryFee: pricing.customerDeliveryFee, currency: 'MYR', minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS }, merchandiseSubtotal, destination, schedule };
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
export const revalidateDeliveryForPayment = async ({ provider, store, draft, now = Date.now(), minimumValidityMs = 0 }) => {
  const { config, pickup } = validateStoreDelivery(store);
  const destination = validateDestination(draft?.destination);
  const schedule = validateDeliverySchedule(store, config, draft);
  const quote = quoteSnapshot(await provider.retrieveQuote({ market: 'MY', quotationId: readString(draft?.deliveryQuoteId) }));
  if (!quote.quotationId || quote.currency !== 'MYR' || Date.parse(quote.expiresAt) <= Number(now) + Number(minimumValidityMs) || quote.serviceType !== config.serviceType || quote.stops.length !== 2) throw deliveryError('Refresh your delivery quote before checkout.');
  const dropoff = quote.stops[1] || {};
  // Lalamove returns coordinates as either JSON numbers or strings. Coordinates
  // are the provider routing identity; display-address differences must not
  // turn an otherwise identical selected place into a false mismatch.
  if (!sameDeliveryCoordinates(dropoff.coordinates?.lat, destination.latitude) || !sameDeliveryCoordinates(dropoff.coordinates?.lng, destination.longitude)) throw deliveryError('Delivery quote no longer matches the selected address.');
  return { fulfilmentMethod: 'delivery', fulfilmentMode: schedule.mode, ...(schedule.mode === 'preorder' ? { schedule } : {}), quote, pickup: { name: readString(pickup.name), address: readString(pickup.address), latitude: pickup.latitude, longitude: pickup.longitude, contactName: pickup.contactName, contactPhoneE164: pickup.contactPhoneE164 }, recipient: { name: readString(draft.customerName), phoneE164: readString(draft.phone), address: destination.address, latitude: destination.latitude, longitude: destination.longitude, instructions: destination.instructions }, dispatch: { status: 'not_requested' }, lifecycle: { state: 'not_started' } };
};

export const dispatchStoreDelivery = async ({ db, provider, uid, orderId }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to dispatch this order.');
  const orderRef = db.collection('storeOrders').doc(readString(orderId));
  const authorizationSnapshot = await orderRef.get();
  if (!authorizationSnapshot.exists) throw new HttpsError('not-found', 'This order could not be found.');
  await assertWorkspaceOperator({ db, uid, order: authorizationSnapshot.data() || {} });
  const result = await db.runTransaction(async transaction => {
    const snap = await transaction.get(orderRef); if (!snap.exists) throw new HttpsError('not-found', 'This order could not be found.');
    const order = snap.data(); const delivery = order.delivery || {};
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

export const refreshStoreDelivery = async ({ db, provider, uid, orderId }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to refresh this delivery.');
  const ref = db.collection('storeOrders').doc(readString(orderId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'This order could not be found.');
  const order = snapshot.data() || {}; const delivery = order.delivery || {}; const providerOrderId = readString(delivery.providerOrder?.orderId);
  await assertWorkspaceOperator({ db, uid, order });
  if (!providerOrderId) throw deliveryError('This delivery has not been dispatched.');
  const detail = await provider.retrieveOrder({ market: 'MY', orderId: providerOrderId });
  const { update, nextState } = await buildProviderDetailUpdate({ provider, order, detail: { ...detail, orderId: providerOrderId }, source: 'manual_refresh' });
  await ref.update(update);
  return { status: readString(detail.status), lifecycleState: nextState };
};

export const cancelStoreDelivery = async ({ db, provider, uid, orderId }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to cancel this delivery.');
  const ref = db.collection('storeOrders').doc(readString(orderId)); const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This order could not be found.');
  const order = snap.data() || {}; await assertWorkspaceOperator({ db, uid, order });
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
  const active = await db.collection('storeOrders').where('delivery.dispatch.status', 'in', ['created', 'cancel_requested']).limit(limit).get();
  return Promise.all(active.docs.map(async doc => {
    const order = doc.data(); const providerOrderId = readString(order.delivery?.providerOrder?.orderId); if (!providerOrderId) return null;
    try {
      const detail = await provider.retrieveOrder({ market: 'MY', orderId: providerOrderId });
      const { update } = await buildProviderDetailUpdate({ provider, order, detail: { ...detail, orderId: providerOrderId }, source: 'scheduled_reconciliation' });
      await doc.ref.update(update);
      return readString(detail.status);
    } catch { return null; }
  }));
};
