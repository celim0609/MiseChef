import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertOperator } from './externalPosOrders.js';
import { posScheduleTime } from './posWeeklyDay.js';
import { assertSellingWorkspace, reconcileStorePayment, validateStoreCheckoutReturnUrl } from './storePayments.js';
import { PAYMENT_STATUS, readString } from './storePaymentsCore.js';

const fail = message => { throw new HttpsError('failed-precondition', message); };
const hash = value => createHash('sha256').update(value).digest('hex');

export async function manageWeeklyPosPaymentLink({ db, uid, input, adapter, sellingWorkspaceId, now = new Date() }) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage a payment link.');
  if (!/^[A-Za-z0-9]{20}$/.test(input?.orderId || '') || !['generate', 'cancel'].includes(input.action))
    throw new HttpsError('invalid-argument', 'Choose a Weekly POS order and payment link action.');
  const ref = db.collection('storeOrders').doc(input.orderId);
  const claim = await db.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    if (!order?.weeklyDayPos || !order.manualOrder || order.deletedAt || order.fulfilmentStatus !== 'New')
      fail('Choose an active Weekly POS pending order.');
    await assertOperator({ db, uid, workspaceId: order.workspaceId, financial: true, transaction: tx });
    if (order.payment.status === PAYMENT_STATUS.paid) return { status: 'paid' };
    const store = (await tx.get(db.collection('stores').doc(order.storeId))).data();
    if (!store || store.workspaceId !== order.workspaceId)
      fail('Stripe payment links are unavailable for this Store.');
    if (order.weeklyPosLink) {
      const attemptRef = db.collection('storeCheckoutAttempts').doc(order.weeklyPosLink.attemptId);
      const attempt = (await tx.get(attemptRef)).data();
      if (!attempt || attempt.orderId !== ref.id || attempt.revision !== order.manualOrder.revision)
        fail('The payment link requires reconciliation.');
      return { order, attemptRef, attempt };
    }
    if (input.action === 'cancel') return { status: 'cancelled' };
    if (order.payment.provider !== 'manual_pos' || order.payment.status !== PAYMENT_STATUS.pending
      || !Number.isSafeInteger(order.payment.amountMinor) || order.payment.amountMinor <= 0)
      fail('This order cannot start online payment.');
    if (store.workspaceId !== sellingWorkspaceId || !store.paymentMethods?.some(method => method.id === 'stripe' && method.enabled === true))
      fail('Stripe payment links are unavailable for this Store.');
    assertSellingWorkspace(store, sellingWorkspaceId);
    const returnUrl = validateStoreCheckoutReturnUrl(input.returnUrl);
    if (new URL(returnUrl).pathname !== `/store/${encodeURIComponent(readString(store.slug))}`)
      fail('Choose the saved order’s Store checkout URL.');
    const earliest = Math.min(...order.fulfilments.map(day => posScheduleTime(store, day.date, day.time)));
    const expiresAt = Math.floor(Math.min(earliest, now.getTime() + 2 * 3600000) / 1000);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 - now.getTime() < 31 * 60000)
      fail('Stripe needs at least 31 minutes before the earliest fulfilment. Use manual or pending payment.');
    const sequence = (order.weeklyPosLinkSequence || 0) + 1;
    const attemptId = hash(`weekly-pos:${ref.id}:${order.manualOrder.revision}:${sequence}`);
    const attemptRef = db.collection('storeCheckoutAttempts').doc(attemptId);
    const checkoutAccessToken = randomBytes(32).toString('hex');
    const attempt = {
      orderId: ref.id, storeId: order.storeId, revision: order.manualOrder.revision, provider: 'stripe',
      returnUrl, checkoutAccessToken, expiresAt, createdAt: now.toISOString(),
    };
    tx.create(attemptRef, attempt);
    tx.update(ref, {
      weeklyPosLink: { attemptId, expiresAt },
      weeklyPosLinkSequence: sequence,
      'payment.provider': 'stripe',
      'payment.providerMode': adapter.mode,
      'payment.checkoutAccessTokenHash': hash(checkoutAccessToken),
    });
    return { order, attemptRef, attempt, newlyClaimed: true };
  });
  if (claim.status) return claim;

  const { order, attemptRef, attempt } = claim;
  let providerPaymentId = attempt.providerPaymentId;
  let checkout = attempt.checkout;
  const closeUnpaid = () => db.runTransaction(async tx => {
    const saved = (await tx.get(ref)).data();
    if (saved?.weeklyPosLink?.attemptId !== attemptRef.id) return { status: 'cancelled' };
    if (saved.payment.status === PAYMENT_STATUS.paid) return { status: 'paid' };
    if (readString(saved.payment.providerPaymentId) !== readString(providerPaymentId)) fail('Payment link changed during cancellation.');
    tx.update(ref, {
      weeklyPosLink: FieldValue.delete(),
      paymentMethodId: 'manual_pos', paymentMethodName: 'Manual payment', status: 'Pending payment',
      'payment.provider': 'manual_pos', 'payment.providerMode': 'manual',
      'payment.status': PAYMENT_STATUS.pending,
      'payment.providerPaymentId': FieldValue.delete(),
      'payment.providerTransactionId': FieldValue.delete(),
      'payment.providerPaymentMethod': FieldValue.delete(),
      'payment.checkoutAccessTokenHash': FieldValue.delete(),
      'payment.failureCode': FieldValue.delete(),
      'payment.updatedAt': now.toISOString(), updatedAt: now.toISOString(),
    });
    tx.update(attemptRef, { closedAt: now.toISOString(), checkout: FieldValue.delete(), checkoutAccessToken: FieldValue.delete() });
    return { status: 'cancelled' };
  });
  if (!providerPaymentId) {
    // Stripe can discard stored keys after 24 hours. Never retry a creation
    // with an old key whose result we could no longer recover.
    if (now.getTime() - Date.parse(attempt.createdAt) >= 23 * 3600000)
      fail('Payment link creation requires Stripe reconciliation.');
    let result;
    try {
      result = await adapter.createPayment({
        order: { ...order, id: ref.id }, returnUrl: attempt.returnUrl,
        checkoutAccessToken: attempt.checkoutAccessToken,
        weeklyPosSession: { id: attemptRef.id, expiresAt: attempt.expiresAt },
      });
    } catch (error) {
      if (!claim.newlyClaimed || error.promotionDefinitelyNotCreated !== true) throw error;
      const closed = await closeUnpaid();
      if (input.action === 'cancel' || closed.status === 'paid') return closed;
      fail('Stripe declined to create the payment link. The order remains pending.');
    }
    providerPaymentId = result.providerPaymentId;
    checkout = result.checkout;
    if (!/^cs_[A-Za-z0-9_]+$/.test(providerPaymentId || '') || !checkout?.redirectUrl)
      fail('Stripe did not return a usable checkout session.');
    const current = await db.runTransaction(async tx => {
      const saved = (await tx.get(ref)).data();
      const currentAttempt = (await tx.get(attemptRef)).data();
      if (saved?.weeklyPosLink?.attemptId !== attemptRef.id || !currentAttempt) return false;
      if (currentAttempt.providerPaymentId) {
        if (currentAttempt.providerPaymentId !== providerPaymentId) fail('Payment link creation requires reconciliation.');
        return true;
      }
      tx.update(ref, { 'payment.providerPaymentId': providerPaymentId });
      tx.update(attemptRef, { providerPaymentId, checkout });
      return true;
    });
    if (!current) return { status: 'cancelled' };
  }

  const retrieve = async () => {
    const payment = await adapter.retrievePayment(providerPaymentId);
    if (payment.orderId !== ref.id || payment.providerPaymentId !== providerPaymentId
      || payment.amountMinor !== order.payment.amountMinor || payment.currency !== order.currency)
      fail('Stripe did not return the saved order amount.');
    return payment;
  };
  let payment = await retrieve();
  if (input.action === 'cancel' && !payment.promotionTerminal && payment.status !== PAYMENT_STATUS.paid) {
    try { await adapter.cancelPayment(providerPaymentId); } catch { /* Resolve the cancellation race by reading Stripe. */ }
    payment = await retrieve();
  }
  if (payment.status === PAYMENT_STATUS.paid) {
    await reconcileStorePayment({ db, payment });
    return { status: 'paid' };
  }
  if (payment.status === PAYMENT_STATUS.cancelled && payment.promotionTerminal === true) {
    return closeUnpaid();
  }
  const payable = payment.checkoutSessionStatus === 'open'
    ? [PAYMENT_STATUS.pending, PAYMENT_STATUS.failed].includes(payment.status)
    : payment.status === PAYMENT_STATUS.pending && !payment.checkoutSessionStatus;
  if (input.action === 'cancel' || !payable || attempt.expiresAt * 1000 <= now.getTime())
    fail('Stripe payment is still resolving. Retry after checking the existing payment link.');
  return { status: 'active', url: checkout.redirectUrl, expiresAt: attempt.expiresAt };
}
