import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { PAYMENT_STATUS, readString, toPublicOrderResult } from './storePaymentsCore.js';
import { hasValidCheckoutAccessToken } from './storePayments.js';
import { projectGroupRewardInTransaction } from './groupOrders.js';
import {
  buildStoreNotification,
  getStoreNotificationId,
  STORE_NOTIFICATION_TYPE
} from './storeNotifications.js';
import { hasActiveBusinessEntitlement } from './subscriptionFoundation.js';

const MANUAL_METHODS = new Set(['cash_on_pickup', 'touch_n_go_qr', 'duitnow_qr', 'bank_transfer']);
const RECEIPT_METHODS = new Set(['touch_n_go_qr', 'duitnow_qr', 'bank_transfer']);
const RECEIPT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const receiptPrefix = order => `store-payment-receipts/${readString(order.workspaceId)}/${readString(order.id)}/`;

export const hasValidManualPaymentReceipt = order => {
  const path = readString(order.payment?.receiptPath);
  return RECEIPT_METHODS.has(readString(order.paymentMethodId))
    && path.startsWith(receiptPrefix(order))
    && /\.(?:jpg|png|webp)$/.test(path)
    && Boolean(readString(order.payment?.receiptFileName));
};

const loadGuestOrder = async ({ db, orderId, slug, checkoutAccessToken }) => {
  const snapshot = await db.collection('storeOrders').doc(readString(orderId)).get();
  if (!snapshot.exists) throw new Error('The matching MiseChef order could not be found.');
  const order = { id: snapshot.id, ...snapshot.data() };
  if (readString(order.payment?.provider) !== 'manual' || !MANUAL_METHODS.has(readString(order.paymentMethodId))) {
    throw new Error('This is not a manual payment order.');
  }
  if (!hasValidCheckoutAccessToken(order, checkoutAccessToken)) {
    throw new Error('This checkout access token is invalid.');
  }
  const store = await db.collection('stores').doc(readString(order.storeId)).get();
  if (!store.exists || readString(store.data()?.slug) !== readString(slug).toLowerCase()) {
    throw new Error('This payment does not belong to this Store.');
  }
  return order;
};

const requireManager = async ({ db, uid, workspaceId }) => {
  if (!readString(uid)) throw new Error('Sign in as the Store Owner or Manager.');
  const [workspace, member] = await Promise.all([
    db.collection('workspaces').doc(workspaceId).get(),
    db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`).get()
  ]);
  const isOwner = workspace.exists && readString(workspace.data()?.ownerId) === uid;
  const memberData = member.exists ? member.data() : {};
  const isManager = readString(memberData?.userId) === uid
    && readString(memberData?.workspaceId) === workspaceId
    && memberData?.status === 'Active'
    && ['Owner', 'Manager'].includes(memberData?.role);
  if (!workspace.exists || !hasActiveBusinessEntitlement(workspace.data() || {})) {
    throw new Error('An active Workspace Business subscription is required.');
  }
  if (!isOwner && !isManager) throw new Error('Only the Store Owner or Manager can review this payment.');
};

export const uploadManualStorePaymentReceipt = async ({ db, bucket, slug, orderId, checkoutAccessToken, dataUrl, fileName }) => {
  const order = await loadGuestOrder({ db, orderId, slug, checkoutAccessToken });
  if (!RECEIPT_METHODS.has(readString(order.paymentMethodId))) throw new Error('This payment method does not accept receipts.');
  if (order.payment?.status !== PAYMENT_STATUS.pending) {
    throw new Error('This payment can no longer accept a receipt.');
  }
  const match = readString(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Choose a JPG, PNG, or WebP receipt image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 1 || bytes.length > 2 * 1024 * 1024) throw new Error('Choose a receipt image smaller than 2 MB.');
  const extension = RECEIPT_TYPES.get(match[1]);
  const safeFileName = readString(fileName).slice(0, 160);
  if (!safeFileName) throw new Error('Choose a payment proof image before submitting.');
  const path = `${receiptPrefix(order)}receipt-${randomBytes(8).toString('hex')}.${extension}`;
  const receiptFile = bucket.file(path);
  await receiptFile.save(bytes, {
    resumable: false,
    metadata: { contentType: match[1], cacheControl: 'private,no-store' }
  });
  const reference = db.collection('storeOrders').doc(order.id);
  const previousReceiptPath = readString(order.payment?.receiptPath);
  try {
    await db.runTransaction(async transaction => {
      const fresh = await transaction.get(reference);
      if (!fresh.exists || fresh.data()?.payment?.status !== PAYMENT_STATUS.pending) {
        throw new Error('This payment can no longer accept a receipt.');
      }
      transaction.update(reference, {
        'payment.receiptPath': path,
        'payment.receiptFileName': safeFileName,
        'payment.receiptUploadedAt': FieldValue.serverTimestamp(),
        'payment.updatedAt': new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
  } catch (error) {
    await receiptFile.delete().catch(() => undefined);
    throw error;
  }
  if (previousReceiptPath.startsWith(receiptPrefix(order)) && previousReceiptPath !== path) {
    await bucket.file(previousReceiptPath).delete().catch(() => undefined);
  }
  return { uploaded: true };
};

export const submitManualStorePayment = async ({ db, slug, orderId, checkoutAccessToken }) => {
  const order = await loadGuestOrder({ db, orderId, slug, checkoutAccessToken });
  if (order.payment?.status !== PAYMENT_STATUS.pending) return toPublicOrderResult(order);
  const cash = order.paymentMethodId === 'cash_on_pickup';
  const paymentStatus = cash ? PAYMENT_STATUS.pending : PAYMENT_STATUS.pendingVerification;
  const status = cash ? 'Confirmed' : 'Pending Verification';
  const reference = db.collection('storeOrders').doc(order.id);
  const notificationType = cash
    ? STORE_NOTIFICATION_TYPE.newOrder
    : STORE_NOTIFICATION_TYPE.paymentSubmitted;
  const notificationReference = db.collection('storeNotifications').doc(
    getStoreNotificationId(notificationType, order.id)
  );
  const timelineReference = db.collection('storeOrderTimeline').doc(`${order.id}_${cash ? 'order-confirmed' : 'payment-submitted'}`);
  const result = await db.runTransaction(async transaction => {
    const fresh = await transaction.get(reference);
    const current = { id: fresh.id, ...fresh.data() };
    if (current.payment?.status !== PAYMENT_STATUS.pending) return current;
    if (RECEIPT_METHODS.has(readString(current.paymentMethodId)) && !hasValidManualPaymentReceipt(current)) {
      throw new Error('Upload payment proof before submitting this payment.');
    }
    const update = {
      status,
      ...(cash ? {
        fulfilmentStatus: 'Confirmed',
        fulfilmentUpdatedAt: FieldValue.serverTimestamp(),
        fulfilmentUpdatedBy: 'system:checkout'
      } : {}),
      'payment.status': paymentStatus,
      'payment.updatedAt': new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    transaction.update(reference, update);
    transaction.set(timelineReference, {
      id: timelineReference.id, orderId: order.id, workspaceId: order.workspaceId, storeId: order.storeId,
      type: cash ? 'fulfilment_status' : 'payment_review',
      label: cash ? 'Order Confirmed' : 'Payment Submitted', previousStatus: '', newStatus: status,
      actingUserId: 'system:checkout', createdAt: FieldValue.serverTimestamp()
    }, { merge: false });
    transaction.set(notificationReference, buildStoreNotification({
      id: notificationReference.id,
      type: notificationType,
      order,
      title: cash ? 'New Order' : 'Payment Submitted',
      message: cash ? `${order.orderNumber} is confirmed for cash on pickup.` : `${order.orderNumber} is waiting for payment review.`,
      createdAt: FieldValue.serverTimestamp()
    }), { merge: false });
    return { ...current, ...update, payment: { ...current.payment, status: paymentStatus } };
  });
  return toPublicOrderResult(result);
};

export const reviewManualStorePayment = async ({ db, uid, orderId, decision }) => {
  const reference = db.collection('storeOrders').doc(readString(orderId));
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error('Order not found.');
  const order = { id: snapshot.id, ...snapshot.data() };
  await requireManager({ db, uid, workspaceId: readString(order.workspaceId) });
  if (!['approve', 'reject'].includes(decision)) throw new Error('Choose Approve or Reject.');
  if (decision === 'approve' && order.payment?.status === PAYMENT_STATUS.paid) {
    return { orderId: order.id, paymentStatus: PAYMENT_STATUS.paid, alreadyConfirmed: true };
  }
  if (order.payment?.status !== PAYMENT_STATUS.pendingVerification) {
    throw new Error('Only a payment pending verification can be reviewed.');
  }
  const approved = decision === 'approve';
  const now = new Date().toISOString();
  const update = {
    status: approved ? 'Paid' : 'Payment Rejected',
    'payment.status': approved ? PAYMENT_STATUS.paid : PAYMENT_STATUS.rejected,
    'payment.reviewedAt': FieldValue.serverTimestamp(),
    'payment.reviewedBy': uid,
    'payment.updatedAt': now,
    updatedAt: now
  };
  const timeline = db.collection('storeOrderTimeline').doc(`${order.id}_payment-${decision}`);
  const notificationType = approved
    ? STORE_NOTIFICATION_TYPE.paymentApproved
    : STORE_NOTIFICATION_TYPE.paymentRejected;
  const notification = db.collection('storeNotifications').doc(
    getStoreNotificationId(notificationType, order.id)
  );
  const alreadyConfirmed = await db.runTransaction(async transaction => {
    const fresh = await transaction.get(reference);
    if (approved && fresh.data()?.payment?.status === PAYMENT_STATUS.paid) {
      return true;
    }
    if (fresh.data()?.payment?.status !== PAYMENT_STATUS.pendingVerification) {
      throw new Error('Only a payment pending verification can be reviewed.');
    }
    if (approved && !hasValidManualPaymentReceipt({ id: fresh.id, ...fresh.data() })) {
      throw new Error('Payment proof is required before this payment can be approved.');
    }
    if (approved) {
      const freshOrder = { id: fresh.id, ...fresh.data() };
      await projectGroupRewardInTransaction({
        db,
        transaction,
        orderId: fresh.id,
        order: {
          ...freshOrder,
          status: 'Paid',
          payment: { ...freshOrder.payment, status: PAYMENT_STATUS.paid }
        }
      });
    }
    transaction.update(reference, update);
    transaction.create(timeline, {
      id: timeline.id, orderId: order.id, workspaceId: order.workspaceId, storeId: order.storeId,
      type: 'payment_review', label: approved ? 'Payment Approved' : 'Payment Rejected',
      previousStatus: 'Pending Verification', newStatus: approved ? 'Paid' : 'Payment Rejected',
      actingUserId: uid, createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(notification, buildStoreNotification({
      id: notification.id,
      type: notificationType,
      order,
      title: approved ? 'Payment Approved' : 'Payment Rejected',
      message: `${order.orderNumber} payment was ${approved ? 'approved' : 'rejected'}.`,
      createdAt: FieldValue.serverTimestamp()
    }));
    return false;
  });
  return {
    orderId: order.id,
    paymentStatus: approved ? PAYMENT_STATUS.paid : PAYMENT_STATUS.rejected,
    alreadyConfirmed
  };
};
