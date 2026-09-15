import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { buildOrderItems, createAvailableOrderReference, readString } from './storePaymentsCore.js';
import { loadStoreCheckoutData } from './storePayments.js';
import { hasActiveBusinessEntitlement } from './subscriptionFoundation.js';

const EXTERNAL_SOURCES = new Set(['shopeefood', 'walk_in', 'other']);
const OPERATOR_ROLES = new Set(['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef']);
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const idempotencyId = ({ storeId, source, externalOrderNumber }) => createHash('sha256')
  .update(`${storeId}:${source}:${externalOrderNumber}`).digest('hex');

const assertOperator = async ({ db, uid, workspaceId }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to add an external order.');
  const [workspaceSnapshot, memberSnapshot] = await Promise.all([
    db.collection('workspaces').doc(workspaceId).get(),
    db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`).get()
  ]);
  const workspace = workspaceSnapshot.data() || {}; const member = memberSnapshot.data() || {};
  if (!hasActiveBusinessEntitlement(workspace)) throw new HttpsError('permission-denied', 'An active Workspace Business subscription is required.');
  if (readString(workspace.ownerId) !== uid && !(member.userId === uid && member.workspaceId === workspaceId && member.status === 'Active' && OPERATOR_ROLES.has(readString(member.role)))) {
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
  if ((!readString(input?.customerName) && source !== 'walk_in') || readString(input?.customerName).length > 120) throw externalError('Customer name is required and must be 120 characters or fewer.');
  const phone = readString(input?.phone);
  if ((phone && phone.replace(/\D/g, '').length < 6) || (source !== 'walk_in' && !phone) || phone.length > 40) throw externalError('Enter a valid phone number.');
  if (readString(input?.notes).length > 500) throw externalError('Notes must be 500 characters or fewer.');
  if (!Array.isArray(input?.selections) || !input.selections.length || input.selections.length > 50) throw externalError('Choose one or more Store items.');
  if (input.selections.some(item => !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 20)) throw externalError('Each product quantity must be between 1 and 20.');
  if ((source === 'shopeefood' && paymentLabel !== 'shopeefood_platform_paid') || (source === 'walk_in' && paymentLabel !== 'walk_in_paid') || (source === 'other' && paymentLabel !== 'other_paid')) throw externalError('Choose the payment label that matches the order source.');
  return { source, externalOrderNumber, paymentLabel, phone };
};

export const createExternalPosOrder = async ({ db, uid, input, deliveryProvider, now = new Date() }) => {
  const { source, externalOrderNumber, paymentLabel, phone } = validateInput(input);
  const workspaceId = readString(input?.workspaceId);
  const checkout = await loadStoreCheckoutData(db, input?.slug);
  const storeId = readString(checkout.store.id) || readString(checkout.store.workspaceId);
  if (!workspaceId || workspaceId !== readString(checkout.store.workspaceId) || storeId !== readString(input?.storeId)) throw new HttpsError('permission-denied', 'This Store does not match the active Workspace.');
  await assertOperator({ db, uid, workspaceId });
  const idempotencyReference = externalOrderNumber ? db.collection('storeExternalOrderReferences').doc(idempotencyId({ storeId, source, externalOrderNumber })) : null;
  const orderReference = db.collection('storeOrders').doc();
  return db.runTransaction(async transaction => {
    if (idempotencyReference) {
      const existing = await transaction.get(idempotencyReference);
      if (existing.exists) return { orderId: readString(existing.data()?.orderId), duplicate: true };
    }
    const items = buildOrderItems(input.selections, checkout.products, checkout.optionGroups, checkout.sets);
    const merchandiseSubtotal = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const total = merchandiseSubtotal;
    if (total <= 0) throw externalError('Order total must be greater than zero.');
    const reference = await createAvailableOrderReference({ date: now, exists: async ({ orderNumber, pickupCode, businessDateKey }) => {
      const reservation = db.collection('stores').doc(storeId).collection('orderNumberReservations').doc(`${businessDateKey}_${pickupCode}`);
      const matches = db.collection('storeOrders').where('storeId', '==', storeId).where('orderNumber', '==', orderNumber).limit(1);
      const [reserved, existing] = await Promise.all([transaction.get(reservation), transaction.get(matches)]);
      return reserved.exists || !existing.empty;
    } });
    const createdAt = now.toISOString();
    const paymentMethodName = paymentLabel === 'shopeefood_platform_paid' ? 'ShopeeFood / Platform Paid' : paymentLabel === 'walk_in_paid' ? 'Walk-in / Paid' : 'Other / Paid';
    const order = { id: orderReference.id, orderNumber: reference.orderNumber, pickupCode: reference.pickupCode, storeId, workspaceId, orderSource: 'pos', externalOrder: { source, ...(externalOrderNumber ? { externalOrderNumber } : {}) }, storeName: readString(checkout.store.name), currency: readString(checkout.store.currency), paymentMethodId: paymentLabel, paymentMethodName, customerName: readString(input.customerName, source === 'walk_in' ? 'Walk-in customer' : 'Customer'), phone, fulfilmentMethod: 'pickup', notes: readString(input.notes), items, itemCount: items.reduce((sum, item) => sum + item.quantity, 0), totals: { merchandiseSubtotal, discountTotal: 0, discountedMerchandiseTotal: merchandiseSubtotal, deliveryFee: 0, grandTotal: total, currency: readString(checkout.store.currency) }, total, status: 'Paid externally', fulfilmentStatus: 'New', fulfilmentUpdatedAt: null, fulfilmentUpdatedBy: '', payment: { provider: 'external', providerMode: 'platform_handled', status: 'paid', amountMinor: Math.round(total * 100), currency: readString(checkout.store.currency), providerPaymentId: '', providerTransactionId: '', providerPaymentMethod: paymentLabel, failureCode: '', refundStatus: 'none', refundedAmountMinor: 0, refundFailureCode: '', createdAt, updatedAt: createdAt }, createdAt, updatedAt: createdAt };
    const reservation = db.collection('stores').doc(storeId).collection('orderNumberReservations').doc(`${reference.businessDateKey}_${reference.pickupCode}`);
    transaction.create(reservation, { orderId: orderReference.id, orderNumber: reference.orderNumber, pickupCode: reference.pickupCode, createdAt: FieldValue.serverTimestamp() });
    transaction.create(orderReference, order);
    if (idempotencyReference) transaction.create(idempotencyReference, { orderId: orderReference.id, storeId, workspaceId, source, externalOrderNumber, createdAt: FieldValue.serverTimestamp() });
    return { orderId: orderReference.id, orderNumber: reference.orderNumber, duplicate: false };
  });
};
