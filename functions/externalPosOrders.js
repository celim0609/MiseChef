import { buildExternalOrderItems } from './externalPosOrderModel.js';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { createAvailableOrderReference, readString } from './storePaymentsCore.js';
import { loadStoreCheckoutData } from './storePayments.js';
import { hasActiveBusinessEntitlement } from './subscriptionFoundation.js';

const EXTERNAL_SOURCES = new Set(['shopeefood', 'walk_in', 'other']);
const OPERATOR_ROLES = new Set(['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef']);
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const idempotencyId = ({ storeId, source, externalOrderNumber }) => createHash('sha256')
  .update(`${storeId}:${source}:${externalOrderNumber}`).digest('hex');

export const assertOperator = async ({ db, uid, workspaceId, financial = false, transaction }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to add an external order.');
  const read = ref => transaction ? transaction.get(ref) : ref.get();
  const [workspaceSnapshot, memberSnapshot] = await Promise.all([
    read(db.collection('workspaces').doc(workspaceId)),
    read(db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`))
  ]);
  const workspace = workspaceSnapshot.data() || {}; const member = memberSnapshot.data() || {};
  if (!hasActiveBusinessEntitlement(workspace)) throw new HttpsError('permission-denied', 'An active Workspace Business subscription is required.');
  if (readString(workspace.ownerId) !== uid && !(member.userId === uid && member.workspaceId === workspaceId && member.status === 'Active' && (financial ? ['Owner', 'Manager'].includes(readString(member.role)) : OPERATOR_ROLES.has(readString(member.role))))) {
    throw new HttpsError('permission-denied', 'Your Workspace role cannot add Store orders.');
  }
};

const externalError = message => new HttpsError('failed-precondition', message);
const validateInput = input => {
  const source = readString(input?.source).toLowerCase();
  const externalOrderNumber = readString(input?.externalOrderNumber);
  const paymentLabel = readString(input?.paymentLabel);
  if (!EXTERNAL_SOURCES.has(source)) throw externalError('Choose a valid external order source.');
  if (externalOrderNumber.length > 120) throw externalError('External order number must be 120 characters or fewer.');
  if (!['walk_in_paid', 'shopeefood_platform_paid', 'other_paid'].includes(paymentLabel)) throw externalError('Choose a valid payment label.');
  if (readString(input?.customerName).length > 120) throw externalError('Customer name must be 120 characters or fewer.');
  const phone = readString(input?.phone);
  if ((phone && phone.replace(/\D/g, '').length < 6) || phone.length > 40) throw externalError('Enter a valid phone number.');
  if (readString(input?.notes).length > 500) throw externalError('Notes must be 500 characters or fewer.');
  if (!Array.isArray(input?.selections) || !input.selections.length || input.selections.length > 50) throw externalError('Choose one or more Store items.');
  if (input.selections.some(item => !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 20)) throw externalError('Each product quantity must be between 1 and 20.');
  if ((source === 'shopeefood' && paymentLabel !== 'shopeefood_platform_paid') || (source === 'walk_in' && paymentLabel !== 'walk_in_paid') || (source === 'other' && paymentLabel !== 'other_paid')) throw externalError('Choose the payment label that matches the order source.');
  const requestId = readString(input?.requestId);
  if (requestId && !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw externalError('Invalid order request.');
  if (!requestId && !externalOrderNumber) throw externalError('An order request ID is required. Refresh POS and retry.');
  return { source, externalOrderNumber, paymentLabel, phone, requestId };
};

export const createExternalPosOrder = async ({ db, uid, input, deliveryProvider, now = new Date() }) => {
  const { source, externalOrderNumber, paymentLabel, phone, requestId } = validateInput(input);
  const workspaceId = readString(input?.workspaceId);
  const checkout = await loadStoreCheckoutData(db, input?.slug);
  const storeId = readString(checkout.store.id) || readString(checkout.store.workspaceId);
  if (!workspaceId || workspaceId !== readString(checkout.store.workspaceId) || storeId !== readString(input?.storeId)) throw new HttpsError('permission-denied', 'This Store does not match the active Workspace.');
  await assertOperator({ db, uid, workspaceId });
  const idempotencyReference = externalOrderNumber ? db.collection('storeExternalOrderReferences').doc(idempotencyId({ storeId, source, externalOrderNumber })) : null;
  const requestReference = requestId ? db.collection('storeExternalOrderReferences').doc(createHash('sha256').update(`${storeId}:${uid}:${requestId}`).digest('hex')) : null;
  const fingerprint = createHash('sha256').update(JSON.stringify({source,externalOrderNumber,paymentLabel,customerName:readString(input.customerName),phone,notes:readString(input.notes),selections:input.selections,lineSchedules:input.lineSchedules,pickupLocationId:input.pickupLocationId})).digest('hex');
  const orderReference = db.collection('storeOrders').doc();
  const commit = () => db.runTransaction(async transaction => {
    if (requestReference) {
      const previous = await transaction.get(requestReference);
      if (previous.exists) {
        if (previous.data().fingerprint !== fingerprint) throw externalError('This request already saved different order details. Check View Orders before starting a new order.');
        return {orderId:previous.data().orderId,duplicate:true};
      }
    }
    if (idempotencyReference) {
      const existing = await transaction.get(idempotencyReference);
      if (existing.exists) return { orderId: readString(existing.data()?.orderId), duplicate: true };
    }
    let built;
    try { built = buildExternalOrderItems(input, checkout, now); } catch(error) { throw externalError(error.message || 'Check the items and fulfilment dates.'); }
    const {items} = built;
    const merchandiseSubtotal = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const total = merchandiseSubtotal;
    if (total <= 0) throw externalError('Order total must be greater than zero.');
    const reference = await createAvailableOrderReference({ date: now, exists: async ({ orderNumber, pickupCode, businessDateKey }) => {
      const reservation = db.collection('stores').doc(storeId).collection('orderNumberReservations').doc(`${businessDateKey}_${pickupCode}`);
      const matches = db.collection('storeOrders').where('storeId', '==', storeId).where('orderNumber', '==', orderNumber).limit(1);
      const reserved = await transaction.get(reservation);
      const existing = await transaction.get(matches);
      return reserved.exists || !existing.empty;
    } });
    const createdAt = now.toISOString();
    const paymentMethodName = paymentLabel === 'shopeefood_platform_paid' ? 'ShopeeFood / Platform Paid' : paymentLabel === 'walk_in_paid' ? 'Walk-in / Paid' : 'Other / Paid';
    const order = { id: orderReference.id, orderNumber: reference.orderNumber, pickupCode: reference.pickupCode, storeId, workspaceId, orderSource: 'pos', externalOrder: { source, ...(externalOrderNumber ? { externalOrderNumber } : {}) }, storeName: readString(checkout.store.name), currency: readString(checkout.store.currency), paymentMethodId: paymentLabel, paymentMethodName, customerName: readString(input.customerName, source === 'walk_in' ? 'Walk-in customer' : 'Customer'), phone, fulfilmentMethod: 'pickup', notes: readString(input.notes), ...built, itemCount: items.reduce((sum, item) => sum + item.quantity, 0), totals: { merchandiseSubtotal, discountTotal: 0, discountedMerchandiseTotal: merchandiseSubtotal, deliveryFee: 0, grandTotal: total, currency: readString(checkout.store.currency) }, total, status: 'Paid externally', fulfilmentStatus: 'New', fulfilmentUpdatedAt: null, fulfilmentUpdatedBy: '', payment: { provider: 'external', providerMode: 'platform_handled', status: 'paid', amountMinor: Math.round(total * 100), currency: readString(checkout.store.currency), providerPaymentId: '', providerTransactionId: '', providerPaymentMethod: paymentLabel, failureCode: '', refundStatus: 'none', refundedAmountMinor: 0, refundFailureCode: '', createdAt, updatedAt: createdAt }, createdAt, updatedAt: createdAt };
    const reservation = db.collection('stores').doc(storeId).collection('orderNumberReservations').doc(`${reference.businessDateKey}_${reference.pickupCode}`);
    transaction.create(reservation, { orderId: orderReference.id, orderNumber: reference.orderNumber, pickupCode: reference.pickupCode, createdAt: FieldValue.serverTimestamp() });
    transaction.create(orderReference, order);
    if (requestReference) transaction.create(requestReference, {orderId:orderReference.id,storeId,workspaceId,requestId,fingerprint,createdAt:FieldValue.serverTimestamp()});
    if (idempotencyReference) transaction.create(idempotencyReference, { orderId: orderReference.id, storeId, workspaceId, source, externalOrderNumber, createdAt: FieldValue.serverTimestamp() });
    return { orderId: orderReference.id, orderNumber: reference.orderNumber, duplicate: false };
  });
  // The emulator can close a contended transaction during its query read with
  // code 3 rather than ABORTED. Retry only that precise transient condition.
  // The same request ledger and order reference make an ambiguous retry safe.
  for (let attempt = 0; ; attempt++) {
    try { return await commit(); }
    catch (error) {
      if (attempt >= 2 || Number(error.code) !== 3 || !/Transaction is invalid or closed/.test(error.message || '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
};
