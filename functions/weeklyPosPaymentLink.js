import { assertCurlecEnvironment } from './curlecEnvironment.js';
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertOperator } from './externalPosOrders.js';
import { posScheduleTime } from './posWeeklyDay.js';
import { assertSellingWorkspace, reconcileStorePayment, validateStoreCheckoutReturnUrl } from './storePayments.js';
import { PAYMENT_STATUS, readString } from './storePaymentsCore.js';

const fail = message => { throw new HttpsError('failed-precondition', message); };
const hash = value => createHash('sha256').update(value).digest('hex');

// Retry the Firestore emulator's closed-transaction error under contention.
// Provider requests always run outside this retry boundary.
async function runLinkTransaction(db, operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.runTransaction(operation); }
    catch (error) {
      if (attempt >= 2 || Number(error.code) !== 3 || !/Transaction is invalid or closed/.test(error.message || '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

const LINK_PROVIDERS = ['curlec', 'stripe'];
const enabledProviders = (store, sellingWorkspaceId, configuredProviders) =>
  store.workspaceId !== sellingWorkspaceId ? [] : LINK_PROVIDERS.filter(provider =>
    configuredProviders.includes(provider) && (provider !== 'curlec' || store.currency === 'MYR')
    && store.paymentMethods?.some(method => method.id === provider && method.enabled === true));

export async function manageWeeklyPosPaymentLink({
  db, uid, input, adapter, resolveAdapter = () => adapter,
  merchantIdentity = provider => provider, newCurlecEnvironment, configuredProviders = adapter ? [adapter.provider || 'stripe'] : [], sellingWorkspaceId, now = new Date(),
}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage a payment link.');
  if (input?.action === 'availability') {
    const storeId = readString(input.storeId);
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(storeId)) throw new HttpsError('invalid-argument', 'Choose a Store.');
    const store = (await db.collection('stores').doc(storeId).get()).data();
    if (!store?.workspaceId) fail('Choose an active Store.');
    await assertOperator({ db, uid, workspaceId: store.workspaceId, financial: true });
    return { providers: enabledProviders(store, sellingWorkspaceId, configuredProviders) };
  }
  if (!/^[A-Za-z0-9]{20}$/.test(input?.orderId || '') || !['generate', 'cancel'].includes(input.action))
    throw new HttpsError('invalid-argument', 'Choose a Weekly POS order and payment link action.');
  const ref = db.collection('storeOrders').doc(input.orderId);
  const claim = await runLinkTransaction(db, async tx => {
    const order = (await tx.get(ref)).data();
    if (!order?.weeklyDayPos || !order.manualOrder || order.deletedAt || order.fulfilmentStatus !== 'New')
      fail('Choose an active Weekly POS pending order.');
    await assertOperator({ db, uid, workspaceId: order.workspaceId, financial: true, transaction: tx });
    if (input.expectedRevision !== order.manualOrder.revision)
      fail('The order revision changed. Reload before managing payment.');
    if (order.payment.status === PAYMENT_STATUS.paid) return { status: 'paid' };
    const store = (await tx.get(db.collection('stores').doc(order.storeId))).data();
    if (!store || store.workspaceId !== order.workspaceId)
      fail('Payment links are unavailable for this Store.');
    if (order.weeklyPosLink) {
      const attemptRef = db.collection('storeCheckoutAttempts').doc(order.weeklyPosLink.attemptId);
      const attempt = (await tx.get(attemptRef)).data();
      if (attempt?.curlecEnvironment) assertCurlecEnvironment(order, attempt.curlecEnvironment);
      if (!attempt || attempt.storeId !== order.storeId || attempt.orderId !== ref.id || attempt.revision !== order.manualOrder.revision
        || attempt.provider !== order.payment.provider || attempt.mode !== order.payment.providerMode || attempt.amountMinor !== order.payment.amountMinor
        || attempt.currency !== order.currency || attempt.expiresAt !== order.weeklyPosLink.expiresAt
        || (input.provider && input.provider !== attempt.provider))
        fail('The payment link requires reconciliation.');
      return { order, attemptRef, attempt };
    }
    if (input.action === 'cancel') return { status: 'cancelled' };
    if (order.payment.provider !== 'manual_pos' || order.payment.status !== PAYMENT_STATUS.pending
      || !Number.isSafeInteger(order.payment.amountMinor) || order.payment.amountMinor <= 0
      || !Array.isArray(order.fulfilments) || !order.fulfilments.length)
      fail('This order cannot start online payment.');
    const provider = readString(input.provider);
    if (!enabledProviders(store, sellingWorkspaceId, configuredProviders).includes(provider))
      fail('The selected payment provider is unavailable for this Store.');
    const environment = provider === 'curlec' ? newCurlecEnvironment : undefined;
    if (order.payment.curlecEnvironment === 'test' && environment !== 'test')
      fail('A sandbox order cannot use a live payment method.');
    const activeAdapter = resolveAdapter(provider, environment);
    if (activeAdapter.provider !== provider || activeAdapter.curlecEnvironment !== environment || (provider === 'curlec' && activeAdapter.mode !== 'payment_link'))
      fail('The selected payment provider is unavailable for this Store.');
    const merchant = readString(merchantIdentity(provider, environment));
    if (!merchant) fail('The selected merchant account is unavailable.');
    const customerEmail = readString(input.customerEmail);
    if (provider === 'curlec' && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)))
      fail('Enter the customer’s email address for Curlec.');
    assertSellingWorkspace(store, sellingWorkspaceId);
    const returnUrl = validateStoreCheckoutReturnUrl(input.returnUrl);
    if (new URL(returnUrl).pathname !== `/store/${encodeURIComponent(readString(store.slug))}`)
      fail('Choose the saved order’s Store checkout URL.');
    const earliest = Math.min(...order.fulfilments.map(day => posScheduleTime(store, day.date, day.time)));
    const expiresAt = Math.floor(Math.min(earliest, now.getTime() + 2 * 3600000) / 1000);
    const minimumMinutes = provider === 'curlec' ? 16 : 31;
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 - now.getTime() < minimumMinutes * 60000)
      fail(`${provider === 'curlec' ? 'Curlec' : 'Stripe'} needs at least ${minimumMinutes} minutes before the earliest fulfilment. Use manual or pending payment.`);
    const sequence = (order.weeklyPosLinkSequence || 0) + 1;
    const attemptId = hash(`weekly-pos:${ref.id}:${order.manualOrder.revision}:${sequence}`);
    const attemptRef = db.collection('storeCheckoutAttempts').doc(attemptId);
    const checkoutAccessToken = randomBytes(32).toString('hex');
    const attempt = {
      orderId: ref.id, storeId: order.storeId, revision: order.manualOrder.revision, provider, mode: activeAdapter.mode,
      amountMinor: order.payment.amountMinor, currency: order.currency, merchantFingerprint: hash(merchant),
      ...(provider === 'curlec' ? { customerEmail } : {}),
      ...(environment ? { curlecEnvironment: environment } : {}),
      returnUrl, checkoutAccessToken, expiresAt, createdAt: now.toISOString(),
    };
    tx.create(attemptRef, attempt);
    tx.update(ref, {
      weeklyPosLink: { attemptId, expiresAt, provider },
      weeklyPosLinkSequence: sequence,
      'payment.provider': provider,
      ...(environment ? { 'payment.curlecEnvironment': environment } : {}),
      'payment.providerMode': activeAdapter.mode,
      'payment.checkoutAccessTokenHash': hash(checkoutAccessToken),
    });
    return { order, attemptRef, attempt, newlyClaimed: true };
  });
  if (claim.status) return claim;

  const { order, attemptRef, attempt } = claim;
  const merchant = readString(merchantIdentity(attempt.provider, attempt.curlecEnvironment));
  if (!merchant || attempt.merchantFingerprint !== hash(merchant))
    fail('The payment link requires reconciliation with its original merchant credentials.');
  const gateway = resolveAdapter(attempt.provider, attempt.curlecEnvironment);
  const curlec = attempt.provider === 'curlec';
  if (gateway.provider !== attempt.provider || gateway.mode !== attempt.mode || gateway.curlecEnvironment !== attempt.curlecEnvironment)
    fail('The saved payment provider is unavailable.');
  const weeklyPosSession = { id: attemptRef.id, expiresAt: attempt.expiresAt, revision: attempt.revision };
  const createArgs = {
    order: { ...order, id: ref.id, ...(curlec ? { customerEmail: attempt.customerEmail } : {}) },
    returnUrl: attempt.returnUrl, checkoutAccessToken: attempt.checkoutAccessToken, weeklyPosSession,
  };
  let providerPaymentId = attempt.providerPaymentId;
  let checkout = attempt.checkout;
  const closeUnpaid = () => runLinkTransaction(db, async tx => {
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
    tx.update(attemptRef, { closedAt: now.toISOString(), checkout: FieldValue.delete(), checkoutAccessToken: FieldValue.delete(), customerEmail: FieldValue.delete() });
    return { status: 'cancelled' };
  });
  if (!providerPaymentId) {
    // Stripe can discard stored keys after 24 hours. Never retry a creation
    // with an old key whose result we could no longer recover.
    if (!curlec && now.getTime() - Date.parse(attempt.createdAt) >= 23 * 3600000)
      fail('Payment link creation requires Stripe reconciliation.');
    let result;
    try {
      if (curlec && !claim.newlyClaimed) result = await gateway.findWeeklyPosPayment(createArgs);
      if (!result) {
        // Absence during a lookup is not proof that a previous POST failed.
        // Repeat only the original reference, which Curlec enforces as unique.
        if (curlec && attempt.expiresAt * 1000 - now.getTime() < 16 * 60000)
          fail('The Curlec payment link needs provider reconciliation before the order can be changed.');
        result = await gateway.createPayment(createArgs);
      }
    } catch (error) {
      if (curlec) {
        result = await gateway.findWeeklyPosPayment(createArgs);
        if (!result) fail('Curlec link creation is unresolved. Retry this order to recover the same link.');
      } else {
        if (!claim.newlyClaimed || error.promotionDefinitelyNotCreated !== true) throw error;
        const closed = await closeUnpaid();
        if (input.action === 'cancel' || closed.status === 'paid') return closed;
        fail('The provider declined to create the payment link. The order remains pending.');
      }
    }
    providerPaymentId = result.providerPaymentId;
    checkout = result.checkout;
    const validId = curlec ? /^plink_[A-Za-z0-9]+$/ : /^cs_[A-Za-z0-9_]+$/;
    if (!validId.test(providerPaymentId || '') || !checkout?.redirectUrl)
      fail('The provider did not return a usable checkout session.');
    const current = await runLinkTransaction(db, async tx => {
      const saved = (await tx.get(ref)).data();
      const currentAttempt = (await tx.get(attemptRef)).data();
      if (saved?.weeklyPosLink?.attemptId !== attemptRef.id || !currentAttempt) return false;
      if (currentAttempt.providerPaymentId) {
        if (currentAttempt.providerPaymentId !== providerPaymentId) fail('Payment link creation requires reconciliation.');
        return true;
      }
      tx.update(ref, { 'payment.providerPaymentId': providerPaymentId });
      tx.update(attemptRef, { providerPaymentId, checkout, ...(curlec ? { customerEmail: FieldValue.delete() } : {}) });
      return true;
    });
    if (!current) return { status: 'cancelled' };
  }

  const retrieve = async () => {
    const payment = curlec
      ? await gateway.retrieveWeeklyPosPayment({ ...createArgs, providerPaymentId })
      : await gateway.retrievePayment(providerPaymentId);
    if (payment.orderId !== ref.id || payment.providerPaymentId !== providerPaymentId
      || payment.amountMinor !== order.payment.amountMinor || payment.currency !== order.currency)
      fail('The provider payment does not match the saved order amount.');
    return payment;
  };
  let payment = await retrieve();
  if (input.action === 'cancel' && !payment.promotionTerminal && payment.status !== PAYMENT_STATUS.paid) {
    try {
      if (curlec) await gateway.cancelWeeklyPosPayment(providerPaymentId);
      else await gateway.cancelPayment(providerPaymentId);
    } catch { /* Resolve a cancellation race using a verified provider read. */ }
    payment = await retrieve();
  }
  if (payment.status === PAYMENT_STATUS.paid) {
    await reconcileStorePayment({ db, payment: { ...payment, curlecEnvironment: gateway.curlecEnvironment } });
    return { status: 'paid' };
  }
  if (payment.status === PAYMENT_STATUS.cancelled && payment.promotionTerminal === true) {
    return closeUnpaid();
  }
  const payable = payment.checkoutSessionStatus === 'open'
    ? [PAYMENT_STATUS.pending, PAYMENT_STATUS.failed].includes(payment.status)
    : payment.status === PAYMENT_STATUS.pending && !payment.checkoutSessionStatus;
  if (input.action === 'cancel' || !payable || attempt.expiresAt * 1000 <= now.getTime())
    fail('Payment is still resolving. Retry after checking the existing payment link.');
  return { status: 'active', url: checkout.redirectUrl, expiresAt: attempt.expiresAt };
}
