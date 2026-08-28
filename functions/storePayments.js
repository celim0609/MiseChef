import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  PAYMENT_REFUND_STATUS,
  buildPendingOrder,
  createAvailableOrderReference,
  getEnabledStorePaymentMethod,
  PAYMENT_STATUS,
  readString,
  toPublicOrderResult
} from './storePaymentsCore.js';
import {
  buildStoreNotification,
  getStoreNotificationId,
  STORE_NOTIFICATION_TYPE
} from './storeNotifications.js';
import { revalidateCheckoutGroupInTransaction, resolveCheckoutGroup } from './groupOrders.js';

const loadStoreCheckoutData = async (db, slug) => {
  const storeSnapshot = await db.collection('stores')
    .where('slug', '==', readString(slug).toLowerCase())
    .limit(1)
    .get();
  const storeDocument = storeSnapshot.docs[0];
  if (!storeDocument) throw new Error('This Store is no longer available.');

  const store = { id: storeDocument.id, ...storeDocument.data() };
  const [productSnapshot, optionGroupSnapshot, setSnapshot] = await Promise.all([
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
      .get()
  ]);
  return {
    store,
    products: productSnapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    optionGroups: optionGroupSnapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    sets: setSnapshot.docs.map(document => ({ id: document.id, ...document.data() }))
  };
};

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
  grabpay: 'GrabPay'
})[method] || 'Secure online payment';

const hashCheckoutAccessToken = token => createHash('sha256')
  .update(readString(token))
  .digest('hex');

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
      'payment.providerTransactionId': readString(payment.providerTransactionId),
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
  slug,
  draft,
  returnUrl,
  now = new Date()
}) => {
  const checkoutData = await loadStoreCheckoutData(db, slug);
  const groupOrder = await resolveCheckoutGroup({ db, store: checkoutData.store, draft, now });
  const paymentMethod = getEnabledStorePaymentMethod(checkoutData.store, draft?.paymentMethodId);
  const activeAdapter = adapter || resolveAdapter(paymentMethod);
  if (activeAdapter.requiresSellingWorkspace) {
    assertSellingWorkspace(checkoutData.store, sellingWorkspaceId);
  }
  const checkoutReturnUrl = activeAdapter.provider === 'stripe'
    ? validateStoreCheckoutReturnUrl(returnUrl)
    : '';
  const orderReference = db.collection('storeOrders').doc();
  const checkoutAccessToken = randomBytes(32).toString('hex');
  const storeId = readString(checkoutData.store.id) || readString(checkoutData.store.workspaceId);
  const { order } = await db.runTransaction(async transaction => {
    const currentGroupOrder = await revalidateCheckoutGroupInTransaction({
      db,
      transaction,
      groupOrder,
      store: checkoutData.store,
      draft,
      now
    });
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
      draft,
      now
    });
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
    transaction.create(orderReference, pendingOrder);
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
    await orderReference.update({
      'payment.providerPaymentId': providerPaymentId,
      'payment.updatedAt': new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return {
      orderNumber: order.orderNumber,
      pickupCode: order.pickupCode,
      provider: activeAdapter.provider,
      paymentSessionId: providerPaymentId,
      checkout: payment.checkout,
      checkoutAccessToken
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
  // The signed webhook is authoritative for online payment state. A browser
  // return may read the order but must never promote it to Paid.
  return toPublicOrderResult(authorizedOrder);
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

export const handleStorePaymentWebhook = async ({ db, adapter, event }) => {
  const update = await adapter.readWebhookUpdate(event);
  if (update.kind === 'ignored') {
    return { received: true, ignored: true };
  }
  const providerPaymentId = readString(update.payment?.providerPaymentId);
  if (update.kind === 'refund') {
    await reconcileStoreRefund({ db, payment: update.payment });
  } else {
    await reconcileStorePayment({ db, payment: update.payment });
  }
  await db.collection('storePaymentEvents').doc(event.id).set({
    provider: adapter.provider,
    providerMode: adapter.mode,
    type: event.type,
    providerPaymentId,
    providerTransactionId: readString(update.payment?.providerTransactionId),
    processedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { received: true };
};
