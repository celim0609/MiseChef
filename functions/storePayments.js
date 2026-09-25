import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  PAYMENT_REFUND_STATUS,
  buildPendingOrder,
  createAvailableOrderReference,
  getEnabledStorePaymentMethod,
  PAYMENT_STATUS,
  readString,
  toPublicGroupOrderContext,
  toPublicPaymentOrderSummary,
  toPublicOrderResult
} from './storePaymentsCore.js';
import {
  buildStoreNotification,
  getStoreNotificationId,
  STORE_NOTIFICATION_TYPE
} from './storeNotifications.js';
import {
  incrementGroupLifetimeOrderCountInTransaction,
  revalidateCheckoutGroupInTransaction,
  resolveCheckoutGroup
} from './groupOrders.js';
import { DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS, revalidateDeliveryForPayment } from './storeDelivery.js';

export const loadStoreCheckoutData = async (db, slug) => {
  const storeSnapshot = await db.collection('stores')
    .where('slug', '==', readString(slug).toLowerCase())
    .limit(1)
    .get();
  const storeDocument = storeSnapshot.docs[0];
  if (!storeDocument) throw new Error('This Store is no longer available.');

  const store = { id: storeDocument.id, ...storeDocument.data() };
  const [productSnapshot, optionGroupSnapshot, setSnapshot, promotionSnapshot] = await Promise.all([
    db.collection('storeProducts')
      .where('storeId', '==', storeDocument.id)
      .where('available', '==', true)
      .get(),
    db.collection('storeOptionGroups')
      .where('storeId', '==', storeDocument.id)
      .get(),
    db.collection('storeSets')
      .where('storeId', '==', storeDocument.id)
      .where('available', '==', true)
      .get(),
    db.collection('storePromotions')
      .where('storeId', '==', storeDocument.id)
      .where('active', '==', true)
      .get()
  ]);
  return {
    store,
    products: productSnapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    optionGroups: optionGroupSnapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    sets: setSnapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    promotions: promotionSnapshot.docs.map(document => ({ id: document.id, ...document.data() }))
  };
};

const activePromotionsQuery = (db, storeId) => db.collection('storePromotions')
  .where('storeId', '==', storeId).where('active', '==', true);

export const assertSellingWorkspace = (store, sellingWorkspaceId) => {
  if (!readString(sellingWorkspaceId)) throw new Error('Online payments are not configured yet.');
  const workspaceId = readString(store.workspaceId) || readString(store.id);
  if (workspaceId !== readString(sellingWorkspaceId)) {
    throw new Error('Online payments are not available for this Store.');
  }
};

const paymentMethodLabel = method => ({
  card: 'Debit / Credit Card',
  fpx: 'FPX',
  paynow: 'PayNow',
  grabpay: 'GrabPay',
  wallet: 'E-Wallet'
})[method] || 'Secure online payment';

const hashCheckoutAccessToken = token => createHash('sha256')
  .update(readString(token))
  .digest('hex');

const isCheckoutAttemptId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(readString(value));

const checkoutAttemptLog = (event, { provider = '', mode = '', checkoutType = '' } = {}) => {
  // Deliberately excludes order ids, browser tokens, URLs, and customer data.
  logger.info(event, { provider: readString(provider), mode: readString(mode), checkoutType: readString(checkoutType) });
};

const toCheckoutAttemptResult = (attempt, order) => ({
  orderNumber: order.orderNumber,
  pickupCode: order.pickupCode,
  provider: readString(attempt.provider),
  paymentSessionId: readString(attempt.providerPaymentId),
  checkout: attempt.checkout,
  checkoutAccessToken: readString(attempt.checkoutAccessToken),
  ...(toPublicPaymentOrderSummary(order) ? { orderSummary: toPublicPaymentOrderSummary(order) } : {}),
  ...toPublicGroupOrderContext(order)
});

export const replayStoreCheckoutAttempt = async ({ db, priorAttempt, mode = '' }) => {
  const orderSnapshot = await db.collection('storeOrders').doc(readString(priorAttempt.orderId)).get();
  if (!orderSnapshot.exists) throw new Error('The matching MiseChef order could not be found.');
  checkoutAttemptLog('Store checkout attempt replayed', {
    provider: priorAttempt.provider, mode, checkoutType: priorAttempt.checkout?.type
  });
  return toCheckoutAttemptResult(priorAttempt, orderSnapshot.data());
};

export const recoverIncompleteStoreCheckoutAttempt = async ({
  db, checkoutAttemptReference, priorAttempt, activeAdapter
}) => {
  const orderId = readString(priorAttempt?.orderId);
  if (!orderId || activeAdapter.mode !== 'standard_checkout' || typeof activeAdapter.recoverPayment !== 'function') return null;
  const orderReference = db.collection('storeOrders').doc(orderId);
  const orderSnapshot = await orderReference.get();
  if (!orderSnapshot.exists) throw new Error('The matching MiseChef order could not be found.');
  const order = orderSnapshot.data();
  if (readString(order?.payment?.provider) !== readString(activeAdapter.provider)
    || readString(order?.payment?.providerMode) !== readString(activeAdapter.mode)
    || !readString(order?.payment?.providerPaymentId)) return null;
  const recovered = await activeAdapter.recoverPayment({ order });
  if (readString(recovered?.providerPaymentId) !== readString(order.payment.providerPaymentId)
    || !readString(recovered?.checkout?.type)) return null;
  // Old attempts did not store the browser capability. Rotate it while writing
  // both documents together; the existing Curlec order remains the only one.
  const checkoutAccessToken = randomBytes(32).toString('hex');
  const recovery = await db.runTransaction(async transaction => {
    const currentAttempt = await transaction.get(checkoutAttemptReference);
    const currentOrder = await transaction.get(orderReference);
    if (!currentAttempt.exists || !currentOrder.exists) throw new Error('The checkout attempt changed during recovery.');
    const current = currentAttempt.data();
    const currentOrderData = currentOrder.data();
    if (readString(current?.providerPaymentId) && current?.checkout && readString(current?.checkoutAccessToken)) {
      return { replay: true, attempt: current, order: currentOrderData };
    }
    if (readString(current.orderId) !== orderId
      || readString(currentOrderData?.payment?.providerPaymentId) !== readString(recovered.providerPaymentId)) {
      throw new Error('The checkout attempt changed during recovery.');
    }
    transaction.update(orderReference, {
      'payment.checkoutAccessTokenHash': hashCheckoutAccessToken(checkoutAccessToken),
      'payment.updatedAt': new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    transaction.update(checkoutAttemptReference, {
      provider: activeAdapter.provider, providerPaymentId: recovered.providerPaymentId,
      checkout: recovered.checkout, checkoutAccessToken
    });
    return { replay: false };
  });
  if (recovery.replay) {
    checkoutAttemptLog('Store checkout attempt replayed during recovery', {
      provider: recovery.attempt.provider, mode: activeAdapter.mode, checkoutType: recovery.attempt.checkout?.type
    });
    return toCheckoutAttemptResult(recovery.attempt, recovery.order);
  }
  checkoutAttemptLog('Store checkout attempt recovered', {
    provider: activeAdapter.provider, mode: activeAdapter.mode, checkoutType: recovered.checkout.type
  });
  return toCheckoutAttemptResult({
    ...priorAttempt, provider: activeAdapter.provider, providerPaymentId: recovered.providerPaymentId,
    checkout: recovered.checkout, checkoutAccessToken
  }, order);
};

export const completeStoreCheckoutAttempt = async ({
  db, orderReference, checkoutAttemptReference, provider, mode, providerPaymentId, checkout, checkoutAccessToken
}) => {
  await db.runTransaction(async transaction => {
    const [currentOrder, currentAttempt] = await Promise.all([
      transaction.get(orderReference), transaction.get(checkoutAttemptReference)
    ]);
    if (!currentOrder.exists || !currentAttempt.exists
      || readString(currentAttempt.data()?.orderId) !== orderReference.id) {
      throw new Error('The checkout attempt could not be completed safely.');
    }
    const completedAt = new Date().toISOString();
    transaction.update(orderReference, {
      'payment.providerPaymentId': providerPaymentId,
      'payment.updatedAt': completedAt, updatedAt: completedAt
    });
    transaction.update(checkoutAttemptReference, {
      provider, providerPaymentId, checkout, checkoutAccessToken
    });
  });
  checkoutAttemptLog('Store checkout attempt completed', { provider, mode, checkoutType: checkout.type });
};

const CHECKOUT_RETURN_HOSTS = new Set([
  'misechef.ai',
  'www.misechef.ai',
  'misechef-fa4bf.web.app',
  'misechef-beta-fa4bf.web.app'
]);

export const validateStoreCheckoutReturnUrl = value => {
  let url;
  try {
    url = new URL(readString(value));
  } catch {
    throw new Error('Secure checkout return URL is invalid.');
  }
  const isHostedStore = url.protocol === 'https:' && CHECKOUT_RETURN_HOSTS.has(url.hostname);
  const isLocalEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!isHostedStore && !isLocalEmulator)
    || (!url.pathname.startsWith('/store/') && !url.pathname.startsWith('/group/'))) {
    throw new Error('Secure checkout return URL is invalid.');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
};

export const hasValidCheckoutAccessToken = (order, token) => {
  const expected = Buffer.from(readString(order.payment?.checkoutAccessTokenHash), 'hex');
  const received = Buffer.from(hashCheckoutAccessToken(token), 'hex');
  return expected.length === received.length
    && expected.length > 0
    && timingSafeEqual(expected, received);
};

const loadAuthorizedPaymentOrder = async ({
  db,
  payment,
  provider,
  sellingWorkspaceId,
  requiresSellingWorkspace,
  slug,
  checkoutAccessToken
}) => {
  const orderId = readString(payment?.orderId);
  const orderSnapshot = orderId ? await db.collection('storeOrders').doc(orderId).get() : null;
  if (!orderSnapshot?.exists) throw new Error('The matching MiseChef order could not be found.');
  const order = orderSnapshot.data();
  if (readString(order.payment?.provider) !== readString(provider)) {
    throw new Error('This payment belongs to a different payment provider.');
  }
  if (!hasValidCheckoutAccessToken(order, checkoutAccessToken)) {
    throw new Error('This checkout access token is invalid.');
  }
  if (requiresSellingWorkspace && readString(order.workspaceId) !== readString(sellingWorkspaceId)) {
    throw new Error('This payment does not belong to the active selling workspace.');
  }
  const storeSnapshot = await db.collection('stores').doc(order.storeId).get();
  if (!storeSnapshot.exists || readString(storeSnapshot.data()?.slug) !== readString(slug).toLowerCase()) {
    throw new Error('This payment does not belong to this Store.');
  }
  return order;
};

// A checkout access token is an order-specific bearer credential. This claim
// operation intentionally uses the same payment/session and token checks as
// the public payment-result read, then repeats them against the transaction
// snapshot before assigning ownership.
export const claimPublicStoreGuestOrderOperation = async ({
  db,
  adapter,
  slug,
  providerPaymentId,
  checkoutAccessToken,
  authUid
}) => {
  if (!readString(authUid)) throw new HttpsError('unauthenticated', 'Sign in to save this order.');
  const payment = await adapter.retrievePayment(readString(providerPaymentId), { db });
  if (readString(payment?.providerPaymentId) !== readString(providerPaymentId)) {
    throw new HttpsError('failed-precondition', 'This payment does not match this MiseChef order.');
  }
  const initialOrder = await loadAuthorizedPaymentOrder({
    db,
    payment,
    provider: adapter.provider,
    slug,
    checkoutAccessToken,
    requiresSellingWorkspace: false,
    sellingWorkspaceId: ''
  });
  const orderId = readString(payment?.orderId);
  if (!orderId || readString(initialOrder.payment?.providerPaymentId) !== readString(payment.providerPaymentId)) {
    throw new HttpsError('failed-precondition', 'This payment does not match this MiseChef order.');
  }
  const orderReference = db.collection('storeOrders').doc(orderId);
  const result = await db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(orderReference);
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'The matching MiseChef order could not be found.');
    const order = orderSnapshot.data();
    if (readString(order.payment?.provider) !== readString(adapter.provider)
      || readString(order.payment?.providerPaymentId) !== readString(payment.providerPaymentId)
      || !hasValidCheckoutAccessToken(order, checkoutAccessToken)) {
      throw new HttpsError('permission-denied', 'This checkout credential cannot save this order.');
    }
    const storeSnapshot = await transaction.get(db.collection('stores').doc(readString(order.storeId)));
    if (!storeSnapshot.exists || readString(storeSnapshot.data()?.slug) !== readString(slug).toLowerCase()) {
      throw new HttpsError('permission-denied', 'This payment does not belong to this Store.');
    }
    const customerUid = readString(order.customerUid);
    if (customerUid && customerUid !== authUid) {
      throw new HttpsError('permission-denied', 'This order has already been saved by another account.');
    }
    if (!customerUid) {
      transaction.update(orderReference, {
        customerUid: authUid,
        claimedAt: FieldValue.serverTimestamp()
      });
    }
    return { orderNumber: readString(order.orderNumber), claimed: !customerUid };
  });
  return result;
};

export const reconcileStorePayment = async ({ db, payment }) => {
  const orderId = readString(payment?.orderId);
  if (!orderId) throw new Error('Payment is missing its MiseChef order reference.');
  const orderReference = db.collection('storeOrders').doc(orderId);

  return db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(orderReference);
    if (!orderSnapshot.exists) throw new Error('The matching MiseChef order could not be found.');
    const order = orderSnapshot.data();
    if (readString(order.payment?.providerPaymentId) !== readString(payment.providerPaymentId)) {
      throw new Error('Payment does not match this MiseChef order.');
    }
    if (Number(payment.amountMinor) !== Number(order.payment?.amountMinor)
      || readString(payment.currency).toUpperCase() !== readString(order.currency)) {
      throw new Error('Payment amount does not match this MiseChef order.');
    }
    const providerTransactionId = readString(payment.providerTransactionId);
    if (providerTransactionId) {
      const paymentIdQuery = db.collection('storeOrders')
        .where('payment.providerTransactionId', '==', providerTransactionId)
        .limit(2);
      const matchingPayments = await transaction.get(paymentIdQuery);
      if (!matchingPayments.empty && matchingPayments.docs.some(document => document.id !== orderId)) {
        throw new Error('Payment transaction is already bound to a different MiseChef order.');
      }
    }

    const previousPaymentStatus = readString(order.payment?.status);
    // A payment confirmation is terminal. Gateways can legitimately send an
    // older failed/expired event after capture, but it must never undo fulfilment.
    if (previousPaymentStatus === PAYMENT_STATUS.paid && payment.status !== PAYMENT_STATUS.paid) {
      return order;
    }
    const paymentStatus = payment.status;
    const isNewPaidOrder = paymentStatus === PAYMENT_STATUS.paid
      && readString(order.payment?.status) !== PAYMENT_STATUS.paid;
    const providerPaymentMethod = readString(payment.paymentMethod);
    const status = paymentStatus === PAYMENT_STATUS.paid
      ? 'Paid'
      : paymentStatus === PAYMENT_STATUS.processing
        ? 'Payment Processing'
        : paymentStatus === PAYMENT_STATUS.failed
          ? 'Payment Failed'
          : paymentStatus === PAYMENT_STATUS.cancelled
            ? 'Payment Cancelled'
            : 'Awaiting Payment';
    const update = {
      status,
      paymentMethodId: providerPaymentMethod || 'online',
      paymentMethodName: paymentMethodLabel(providerPaymentMethod),
      'payment.status': paymentStatus,
      'payment.providerTransactionId': providerTransactionId,
      'payment.providerPaymentMethod': providerPaymentMethod,
      'payment.failureCode': readString(payment.failureCode),
      'payment.updatedAt': new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    let notificationReference;
    let timelineReference;
    let notificationSnapshot;
    let timelineSnapshot;
    if (isNewPaidOrder) {
      notificationReference = db.collection('storeNotifications').doc(
        getStoreNotificationId(STORE_NOTIFICATION_TYPE.newOrder, orderId)
      );
      timelineReference = db.collection('storeOrderTimeline').doc(`${orderId}_payment-received`);
      [notificationSnapshot, timelineSnapshot] = await Promise.all([
        transaction.get(notificationReference),
        transaction.get(timelineReference)
      ]);
    }

    transaction.update(orderReference, update);
    if (isNewPaidOrder && notificationReference && !notificationSnapshot.exists) {
      transaction.create(notificationReference, buildStoreNotification({
        id: notificationReference.id,
        type: STORE_NOTIFICATION_TYPE.newOrder,
        order: { ...order, id: orderId },
        title: 'New Order',
        message: `${readString(order.orderNumber)} is ready to prepare.`,
        createdAt: FieldValue.serverTimestamp()
      }));
    }
    if (isNewPaidOrder && timelineReference && !timelineSnapshot.exists) {
      transaction.create(timelineReference, {
        id: timelineReference.id,
        orderId,
        workspaceId: readString(order.workspaceId),
        storeId: readString(order.storeId),
        type: 'payment_received',
        label: 'Payment Received',
        previousStatus: '',
        newStatus: 'Paid',
        actingUserId: 'system:payment',
        createdAt: FieldValue.serverTimestamp()
      });
    }
    return { ...order, ...update, payment: { ...order.payment, status: paymentStatus } };
  });
};

export const reconcileStoreRefund = async ({ db, payment }) => {
  const orderId = readString(payment?.orderId);
  if (!orderId) throw new Error('Refund is missing its MiseChef order reference.');
  const orderReference = db.collection('storeOrders').doc(orderId);
  const refund = payment.refund;
  if (!refund) throw new Error('Refund update is missing its normalized state.');

  return db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(orderReference);
    if (!orderSnapshot.exists) throw new Error('The matching MiseChef order could not be found.');
    const order = orderSnapshot.data();
    if (readString(order.payment?.providerPaymentId) !== readString(payment.providerPaymentId)) {
      throw new Error('Refund does not match this MiseChef order.');
    }
    if (Number(payment.amountMinor) !== Number(order.payment?.amountMinor)
      || readString(payment.currency).toUpperCase() !== readString(order.currency)) {
      throw new Error('Refund amount does not match this MiseChef order.');
    }

    const status = refund.status === PAYMENT_REFUND_STATUS.refunded
      ? 'Refunded'
      : refund.status === PAYMENT_REFUND_STATUS.partial
        ? 'Partially Refunded'
        : refund.status === PAYMENT_REFUND_STATUS.pending
          ? 'Refund Processing'
          : refund.status === PAYMENT_REFUND_STATUS.failed
            ? refund.refundedAmountMinor > 0
              ? 'Partially Refunded'
              : 'Paid'
            : order.status;
    const now = new Date().toISOString();
    const update = {
      status,
      'payment.refundStatus': refund.status,
      'payment.refundedAmountMinor': refund.refundedAmountMinor,
      'payment.refundFailureCode': refund.failureCode,
      'payment.updatedAt': now,
      updatedAt: now
    };
    transaction.update(orderReference, update);
    return {
      ...order,
      status,
      payment: {
        ...order.payment,
        refundStatus: refund.status,
        refundedAmountMinor: refund.refundedAmountMinor,
        refundFailureCode: refund.failureCode,
        updatedAt: now
      },
      updatedAt: now
    };
  });
};

export const createStorePayment = async ({
  db,
  adapter,
  resolveAdapter,
  sellingWorkspaceId,
  customerUid = '',
  slug,
  draft,
  returnUrl,
  deliveryProvider,
  now = new Date()
}) => {
  const checkoutData = await loadStoreCheckoutData(db, slug);
  if (readString(draft?.fulfilmentMethod) === 'delivery') {
    if (!deliveryProvider) throw new Error('Delivery is not configured.');
    if (!readString(draft?.deliveryQuoteId) || !readString(draft?.deliveryPricingSnapshotId) || !draft?.destination || typeof draft.destination !== 'object') {
      throw new HttpsError('failed-precondition', 'A valid delivery quote is required before payment.');
    }
    draft = {
      ...draft,
      deliverySnapshot: await revalidateDeliveryForPayment({
        provider: deliveryProvider,
        store: checkoutData.store,
        draft,
        now: now.getTime(),
        minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS
      })
    };
  }
  const groupOrder = await resolveCheckoutGroup({ db, store: checkoutData.store, draft, now });
  const paymentMethod = getEnabledStorePaymentMethod(checkoutData.store, draft?.paymentMethodId);
  const activeAdapter = adapter || resolveAdapter(paymentMethod);
  if (activeAdapter.requiresSellingWorkspace) {
    assertSellingWorkspace(checkoutData.store, sellingWorkspaceId);
  }
  const checkoutReturnUrl = activeAdapter.provider === 'stripe' || activeAdapter.mode === 'payment_link'
    ? validateStoreCheckoutReturnUrl(returnUrl)
    : '';
  // Current clients always provide a UUID. Keep older deployed clients
  // compatible during a rolling release, but they cannot select an attempt id.
  const checkoutAttemptId = isCheckoutAttemptId(draft?.checkoutAttemptId)
    ? readString(draft.checkoutAttemptId)
    : randomBytes(16).toString('hex');
  const orderReference = db.collection('storeOrders').doc();
  const checkoutAccessToken = randomBytes(32).toString('hex');
  const storeId = readString(checkoutData.store.id) || readString(checkoutData.store.workspaceId);
  // A public checkout can be retried by the browser or a network intermediary.
  // Reserve this opaque, browser-generated attempt inside the same transaction
  // as the order so retries cannot produce a second order/payment session.
  const checkoutAttemptReference = db.collection('storeCheckoutAttempts')
    .doc(hashCheckoutAccessToken(`${storeId}:${checkoutAttemptId}`));
  // A completed provider-session write is replayable using the same opaque
  // checkout attempt. This avoids a second Curlec Payment Link if the browser
  // loses the callable response after the gateway link was created.
  const priorAttempt = await checkoutAttemptReference.get();
  if (priorAttempt.exists) {
    const prior = priorAttempt.data();
    if (!readString(prior?.providerPaymentId) || !prior?.checkout || !readString(prior?.checkoutAccessToken)) {
      const recovered = await recoverIncompleteStoreCheckoutAttempt({
        db, checkoutAttemptReference, priorAttempt: prior, activeAdapter
      });
      if (recovered) return recovered;
      checkoutAttemptLog('Store checkout attempt remains incomplete', {
        provider: activeAdapter.provider, mode: activeAdapter.mode
      });
      throw new HttpsError('already-exists', 'This checkout is already being created. Please wait.');
    }
    return replayStoreCheckoutAttempt({ db, priorAttempt: prior, mode: activeAdapter.mode });
  }
  const { order } = await db.runTransaction(async transaction => {
    const currentGroupOrder = await revalidateCheckoutGroupInTransaction({
      db,
      transaction,
      groupOrder,
      store: checkoutData.store,
      draft,
      now
    });
    const existingAttempt = await transaction.get(checkoutAttemptReference);
    if (existingAttempt.exists) {
      throw new HttpsError('already-exists', 'This checkout is already being created. Please wait.');
    }
    // The initial read supports validation before this transaction, but only
    // this transaction read is allowed to determine the persisted promotion
    // snapshot. Firestore retries the transaction if these documents change.
    const freshPromotionSnapshot = await transaction.get(activePromotionsQuery(db, storeId));
    const freshPromotions = freshPromotionSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    const deliveryPricingSnapshot = draft.deliverySnapshot
      ? await transaction.get(db.collection('storeDeliveryQuoteSnapshots').doc(readString(draft.deliveryPricingSnapshotId)))
      : null;
    const reference = await createAvailableOrderReference({
      date: now,
      exists: async ({ orderNumber, pickupCode, businessDateKey }) => {
        const reservationReference = db.collection('stores')
          .doc(storeId)
          .collection('orderNumberReservations')
          .doc(`${businessDateKey}_${pickupCode}`);
        const existingOrderQuery = db.collection('storeOrders')
          .where('storeId', '==', storeId)
          .where('orderNumber', '==', orderNumber)
          .limit(1);
        const [reservationSnapshot, existingOrderSnapshot] = await Promise.all([
          transaction.get(reservationReference),
          transaction.get(existingOrderQuery)
        ]);
        return reservationSnapshot.exists || !existingOrderSnapshot.empty;
      }
    });
    const pendingOrder = buildPendingOrder({
      id: orderReference.id,
      orderNumber: reference.orderNumber,
      pickupCode: reference.pickupCode,
      ...checkoutData,
      paymentProvider: activeAdapter.provider,
      paymentProviderMode: activeAdapter.mode,
      paymentMethod,
      groupOrder: currentGroupOrder,
      promotions: freshPromotions,
      customerUid,
      draft,
      requireCustomerEmail: activeAdapter.mode === 'payment_link',
      now
    });
    if (draft.deliverySnapshot) {
      const displayed = deliveryPricingSnapshot?.exists ? deliveryPricingSnapshot.data() : null;
      if (!displayed || readString(displayed.storeId) !== storeId
        || readString(displayed.quotationId) !== readString(draft.deliveryQuoteId)
        || Number(displayed.discountedMerchandiseTotal) !== Number(pendingOrder.totals.discountedMerchandiseTotal)
        || Number(displayed.deliveryFee) !== Number(pendingOrder.totals.deliveryFee)
        || Number(displayed.grandTotal) !== Number(pendingOrder.totals.grandTotal)) {
        throw new HttpsError('failed-precondition', 'Promotion or delivery pricing changed. Refresh your delivery quote before checkout.');
      }
    }
    pendingOrder.payment.checkoutAccessTokenHash = hashCheckoutAccessToken(checkoutAccessToken);
    // Store Order History performs Firestore Timestamp range queries. Keep the
    // nested payment clock as its existing provider-facing ISO value, but write
    // the authoritative order creation clock using the canonical Firestore type.
    pendingOrder.createdAt = Timestamp.fromDate(now);
    const reservationReference = db.collection('stores')
      .doc(storeId)
      .collection('orderNumberReservations')
      .doc(`${reference.businessDateKey}_${reference.pickupCode}`);
    transaction.create(reservationReference, {
      orderId: orderReference.id,
      orderNumber: reference.orderNumber,
      pickupCode: reference.pickupCode,
      businessDateKey: reference.businessDateKey,
      storeId,
      workspaceId: readString(checkoutData.store.workspaceId),
      createdAt: now.toISOString()
    });
    transaction.create(checkoutAttemptReference, {
      orderId: orderReference.id,
      storeId,
      createdAt: now.toISOString()
    });
    transaction.create(orderReference, pendingOrder);
    incrementGroupLifetimeOrderCountInTransaction({
      db,
      transaction,
      groupOrder: currentGroupOrder
    });
    return { order: pendingOrder };
  });

  let providerPaymentId = '';
  try {
    const payment = await activeAdapter.createPayment({
      order,
      returnUrl: checkoutReturnUrl,
      checkoutAccessToken
    });
    if (!readString(payment.providerPaymentId) || !readString(payment.checkout?.type)) {
      throw new Error('The payment provider did not create a usable checkout session.');
    }
    providerPaymentId = payment.providerPaymentId;
    await completeStoreCheckoutAttempt({
      db, orderReference, checkoutAttemptReference, provider: activeAdapter.provider,
      mode: activeAdapter.mode, providerPaymentId, checkout: payment.checkout,
      // This is an opaque browser capability in a server-only collection. It
      // allows the original idempotency key to resume after response loss.
      checkoutAccessToken
    });
    const orderSummary = toPublicPaymentOrderSummary(order);
    return {
      orderNumber: order.orderNumber,
      pickupCode: order.pickupCode,
      provider: activeAdapter.provider,
      paymentSessionId: providerPaymentId,
      checkout: payment.checkout,
      checkoutAccessToken,
      ...(orderSummary ? { orderSummary } : {}),
      ...toPublicGroupOrderContext(order)
    };
  } catch (error) {
    if (providerPaymentId) {
      await activeAdapter.cancelPayment(providerPaymentId, { db }).catch(() => undefined);
    }
    await orderReference.update({
      status: 'Payment Failed',
      'payment.status': PAYMENT_STATUS.failed,
      'payment.failureCode': 'provider_creation_failed',
      'payment.updatedAt': new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).catch(() => undefined);
    throw error;
  }
};

export const getStorePaymentResult = async ({
  db,
  adapter,
  sellingWorkspaceId,
  slug,
  providerPaymentId,
  checkoutAccessToken
}) => {
  const payment = await adapter.retrievePayment(readString(providerPaymentId), { db });
  const authorizedOrder = await loadAuthorizedPaymentOrder({
    db,
    payment,
    provider: adapter.provider,
    sellingWorkspaceId,
    requiresSellingWorkspace: adapter.requiresSellingWorkspace,
    slug,
    checkoutAccessToken
  });
  // Most gateways remain webhook-owned. Curlec Standard Checkout additionally
  // supports a strictly authorized, server-side captured-payment lookup for
  // recovery when a signed webhook has not arrived.
  if (typeof adapter.retrieveVerifiedCapturedPayment !== 'function') {
    return toPublicOrderResult(authorizedOrder);
  }
  // This recovery path is intentionally promotion-only. A terminal or other
  // non-pending local state remains webhook/review-owned and is returned as-is.
  if (readString(authorizedOrder.payment?.status) !== PAYMENT_STATUS.pending) {
    return toPublicOrderResult(authorizedOrder);
  }
  const verifiedPayment = await adapter.retrieveVerifiedCapturedPayment({ order: authorizedOrder });
  if (!verifiedPayment) return toPublicOrderResult(authorizedOrder);
  return toPublicOrderResult(await reconcileStorePayment({ db, payment: verifiedPayment }));
};

export const cancelStorePayment = async ({
  db,
  adapter,
  sellingWorkspaceId,
  slug,
  providerPaymentId,
  checkoutAccessToken
}) => {
  const payment = await adapter.retrievePayment(readString(providerPaymentId), { db });
  const order = await loadAuthorizedPaymentOrder({
    db,
    payment,
    provider: adapter.provider,
    sellingWorkspaceId,
    requiresSellingWorkspace: adapter.requiresSellingWorkspace,
    slug,
    checkoutAccessToken
  });
  if (payment.status === PAYMENT_STATUS.paid) return toPublicOrderResult(order);
  const cancelledPayment = payment.status === PAYMENT_STATUS.cancelled
    ? payment
    : await adapter.cancelPayment(payment.providerPaymentId, { db });
  const cancelledOrder = await reconcileStorePayment({ db, payment: cancelledPayment });
  return toPublicOrderResult(cancelledOrder);
};

export const handleStorePaymentWebhook = async ({ db, adapter, event, onRejectionStage }) => {
  // This callback is diagnostic-only. It does not alter webhook processing or
  // reconciliation and is omitted by every existing provider call path.
  onRejectionStage?.('captured_event_validation');
  const update = await adapter.readWebhookUpdate(event);
  if (update.kind === 'ignored') {
    return { received: true, ignored: true };
  }
  const providerPaymentId = readString(update.payment?.providerPaymentId);
  // Curlec webhooks are keyed by the gateway Order ID. Resolve the local order
  // from that server-persisted ID instead of requiring notes to be echoed back.
  if (!readString(update.payment?.orderId) && providerPaymentId) {
    onRejectionStage?.('provider_order_resolution');
    const orders = await db.collection('storeOrders')
      .where('payment.providerPaymentId', '==', providerPaymentId).limit(2).get();
    if (orders.size !== 1) throw new Error('Curlec payment has no unique MiseChef order.');
    update.payment.orderId = orders.docs[0].id;
  }
  const eventReference = db.collection('storePaymentEvents').doc(event.id);
    onRejectionStage?.('event_dedupe_read');
  const priorEvent = await eventReference.get();
  if (priorEvent.exists) return { received: true, duplicate: true };
    onRejectionStage?.('reconciliation');
  if (update.kind === 'refund') {
    await reconcileStoreRefund({ db, payment: update.payment });
  } else {
    await reconcileStorePayment({ db, payment: update.payment });
  }
  await eventReference.set({
    provider: adapter.provider,
    providerMode: adapter.mode,
    type: event.type,
    providerPaymentId,
    providerTransactionId: readString(update.payment?.providerTransactionId),
    processedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { received: true };
};
