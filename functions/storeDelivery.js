import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildOrderItems, readString } from './storePaymentsCore.js';
import { loadStoreCheckoutData } from './storePayments.js';

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const coord = value => typeof value === 'string' && /^-?\d{1,3}(\.\d{1,15})?$/.test(value) && Math.abs(Number(value)) <= 180 ? value : '';
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
export const mapLalamoveStatus = status => ({ COMPLETED: 'Completed', PICKED_UP: 'Out for delivery', ON_GOING: 'Driver assigned', ASSIGNING_DRIVER: 'Dispatching' })[readString(status)] || 'Dispatching';

export const createStoreDeliveryQuote = async ({ db, provider, slug, draft }) => {
  const checkout = await loadStoreCheckoutData(db, slug);
  const { config, pickup } = validateStoreDelivery(checkout.store);
  const destination = validateDestination(draft?.destination);
  // Rebuild cart on the server. The browser does not send prices or service type.
  const items = buildOrderItems(draft?.selections || [], checkout.products, checkout.optionGroups, checkout.sets);
  if (!items.length) throw deliveryError('Your cart is empty.');
  const quotation = await provider.createQuote({ market: 'MY', data: { serviceType: config.serviceType, language: 'en_MY', stops: [
    { coordinates: { lat: pickup.latitude, lng: pickup.longitude }, address: pickup.address },
    { coordinates: { lat: destination.latitude, lng: destination.longitude }, address: destination.address }
  ] } });
  const quote = quoteSnapshot(quotation);
  if (!quote.quotationId || quote.currency !== 'MYR' || quote.fee < 0 || !quote.expiresAt) throw new Error('Lalamove returned an invalid quotation.');
  return { quote, merchandiseSubtotal: money(items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)), destination };
};

export const getLalamoveSandboxCityInfo = async ({ db, uid, workspaceId, provider }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view delivery services.');
  const storeSnapshot = await db.collection('stores').doc(readString(workspaceId)).get();
  if (!storeSnapshot.exists) throw new HttpsError('not-found', 'This Store could not be found.');
  await assertWorkspaceOperator({ db, uid, order: { workspaceId: storeSnapshot.id } });
  return provider.getCityInfo('MY');
};

export const revalidateDeliveryForPayment = async ({ provider, store, draft }) => {
  const { config, pickup } = validateStoreDelivery(store);
  const destination = validateDestination(draft?.destination);
  const quote = quoteSnapshot(await provider.retrieveQuote({ market: 'MY', quotationId: readString(draft?.deliveryQuoteId) }));
  const now = Date.now();
  if (!quote.quotationId || quote.currency !== 'MYR' || Date.parse(quote.expiresAt) <= now || quote.serviceType !== config.serviceType || quote.stops.length !== 2) throw deliveryError('Refresh your delivery quote before checkout.');
  const dropoff = quote.stops[1] || {};
  if (readString(dropoff.address) !== destination.address || readString(dropoff.coordinates?.lat) !== destination.latitude || readString(dropoff.coordinates?.lng) !== destination.longitude) throw deliveryError('Delivery quote no longer matches the selected address.');
  return { fulfilmentMethod: 'delivery', quote, pickup: { name: readString(pickup.name), address: readString(pickup.address), latitude: pickup.latitude, longitude: pickup.longitude, contactName: pickup.contactName, contactPhoneE164: pickup.contactPhoneE164 }, recipient: { name: readString(draft.customerName), phoneE164: readString(draft.phone), address: destination.address, latitude: destination.latitude, longitude: destination.longitude, instructions: destination.instructions }, dispatch: { status: 'not_requested' } };
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
    if (order.payment?.status !== 'paid' || order.fulfilmentStatus !== 'Ready' || delivery.fulfilmentMethod !== 'delivery') throw deliveryError('Only ready, paid delivery orders can be dispatched.');
    if (delivery.dispatch?.status === 'created') return { order, alreadyCreated: true };
    if (delivery.dispatch?.status === 'creating') return { order, alreadyCreating: true };
    transaction.update(orderRef, { 'delivery.dispatch.status': 'creating', 'delivery.dispatch.requestedBy': uid, 'delivery.dispatch.requestedAt': FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
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
  await orderRef.update({ 'delivery.dispatch.status': 'created', 'delivery.providerOrder': { orderId: created.orderId, quotationId: created.quotationId, status: created.status, driverId: created.driverId || '', shareLink: created.shareLink || '', priceBreakdown: created.priceBreakdown || {}, lastSyncedAt: FieldValue.serverTimestamp() }, fulfilmentStatus: 'Dispatching', updatedAt: FieldValue.serverTimestamp() });
  return { status: 'created', orderId: created.orderId };
  } catch (error) {
    await orderRef.update({ 'delivery.dispatch.status': 'failed', 'delivery.dispatch.errorCode': readString(error?.message).slice(0, 120) || 'provider_error', updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    throw error;
  }
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
  const status = readString(detail.status);
  const update = { 'delivery.providerOrder.status': status, 'delivery.providerOrder.driverId': readString(detail.driverId), 'delivery.providerOrder.shareLink': readString(detail.shareLink), 'delivery.providerOrder.priceBreakdown': detail.priceBreakdown || {}, 'delivery.providerOrder.lastSyncedAt': FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  if (status === 'COMPLETED') { update.fulfilmentStatus = 'Completed'; update.completedAt = FieldValue.serverTimestamp(); }
  await ref.update(update);
  return { status };
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
  await ref.update({ 'delivery.dispatch.status': 'cancelled', 'delivery.providerOrder.status': 'CANCELED', updatedAt: FieldValue.serverTimestamp() });
  return { status: 'cancelled' };
};

export const reconcileActiveDeliveries = async ({ db, provider, limit = 50 }) => {
  const active = await db.collection('storeOrders').where('delivery.dispatch.status', 'in', ['created', 'cancel_requested']).limit(limit).get();
  return Promise.all(active.docs.map(async doc => {
    const order = doc.data(); const providerOrderId = readString(order.delivery?.providerOrder?.orderId); if (!providerOrderId) return null;
    try { const detail = await provider.retrieveOrder({ market: 'MY', orderId: providerOrderId }); const status = readString(detail.status); const update = { 'delivery.providerOrder.status': status, 'delivery.providerOrder.driverId': readString(detail.driverId), 'delivery.providerOrder.lastSyncedAt': FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }; if (status === 'COMPLETED') { update.fulfilmentStatus = 'Completed'; update.completedAt = FieldValue.serverTimestamp(); } await doc.ref.update(update); return status; } catch { return null; }
  }));
};
