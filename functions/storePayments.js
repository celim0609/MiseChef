import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  PAYMENT_REFUND_STATUS,
  buildPendingOrder,
  createOrderNumber,
  PAYMENT_STATUS,
  readString,
  toPublicOrderResult
} from './storePaymentsCore.js';

const loadStoreCheckoutData = async (db, slug) => {
  const storeSnapshot = await db.collection('stores')
    .where('slug', '==', readString(slug).toLowerCase())
    .limit(1)
    .get();
  const storeDocument = storeSnapshot.docs[0];
  if (!storeDocument) throw new Error('This Store is no longer available.');

  const store = { id: storeDocument.id, ...storeDocument.data() };
  const [productSnapshot, optionGroupSnapshot] = await Promise.all([
    db.collection('storeProducts')
      .where('storeId', '==', storeDocument.id)
      .where('available', '==', true)
      .get(),
    db.collection('storeOptionGroups')
      .where('storeId', '==', storeDocument.id)
      .get()
  ]);
  return {
    store,
    products: productSnapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    optionGroups: optionGroupSnapshot.docs.map(document => ({ id: document.id, ...document.data() }))
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

const hasValidCheckoutAccessToken = (order, token) => {
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
  if (readString(order.workspaceId) !== readString(sellingWorkspaceId)) {
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
      'payment.providerPaymentMethod': providerPaymentMethod,
      'payment.failureCode': readString(payment.failureCode),
      'payment.updatedAt': new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    transaction.update(orderReference, update);
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
  sellingWorkspaceId,
  slug,
  draft,
  now = new Date()
}) => {
  const checkoutData = await loadStoreCheckoutData(db, slug);
  assertSellingWorkspace(checkoutData.store, sellingWorkspaceId);
  const orderReference = db.collection('storeOrders').doc();
  const order = buildPendingOrder({
    id: orderReference.id,
    orderNumber: createOrderNumber(now),
    ...checkoutData,
    paymentProvider: adapter.provider,
    paymentProviderMode: adapter.mode,
    draft,
    now
  });
  const checkoutAccessToken = randomBytes(32).toString('hex');
  order.payment.checkoutAccessTokenHash = hashCheckoutAccessToken(checkoutAccessToken);
  await orderReference.create(order);

  let providerPaymentId = '';
  try {
    const payment = await adapter.createPayment({ order });
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
      provider: adapter.provider,
      paymentSessionId: providerPaymentId,
      checkout: payment.checkout,
      checkoutAccessToken
    };
  } catch (error) {
    if (providerPaymentId) {
      await adapter.cancelPayment(providerPaymentId).catch(() => undefined);
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
  const payment = await adapter.retrievePayment(readString(providerPaymentId));
  await loadAuthorizedPaymentOrder({
    db,
    payment,
    provider: adapter.provider,
    sellingWorkspaceId,
    slug,
    checkoutAccessToken
  });
  const order = await reconcileStorePayment({ db, payment });
  return toPublicOrderResult(order);
};

export const cancelStorePayment = async ({
  db,
  adapter,
  sellingWorkspaceId,
  slug,
  providerPaymentId,
  checkoutAccessToken
}) => {
  const payment = await adapter.retrievePayment(readString(providerPaymentId));
  const order = await loadAuthorizedPaymentOrder({
    db,
    payment,
    provider: adapter.provider,
    sellingWorkspaceId,
    slug,
    checkoutAccessToken
  });
  if (payment.status === PAYMENT_STATUS.paid) return toPublicOrderResult(order);
  const cancelledPayment = payment.status === PAYMENT_STATUS.cancelled
    ? payment
    : await adapter.cancelPayment(payment.providerPaymentId);
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
    processedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { received: true };
};
