import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  buildStoreNotification,
  getStoreNotificationId,
  STORE_NOTIFICATION_TYPE
} from './storeNotifications.js';

export const STORE_FULFILMENT_STATUS = Object.freeze({
  new: 'New',
  confirmed: 'Confirmed',
  paid: 'Paid',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [STORE_FULFILMENT_STATUS.new]: new Set([
    STORE_FULFILMENT_STATUS.preparing,
    STORE_FULFILMENT_STATUS.cancelled
  ]),
  [STORE_FULFILMENT_STATUS.confirmed]: new Set([
    STORE_FULFILMENT_STATUS.preparing,
    STORE_FULFILMENT_STATUS.cancelled
  ]),
  [STORE_FULFILMENT_STATUS.paid]: new Set([
    STORE_FULFILMENT_STATUS.preparing,
    STORE_FULFILMENT_STATUS.cancelled
  ]),
  [STORE_FULFILMENT_STATUS.preparing]: new Set([
    STORE_FULFILMENT_STATUS.ready,
    STORE_FULFILMENT_STATUS.cancelled
  ]),
  [STORE_FULFILMENT_STATUS.ready]: new Set([
    STORE_FULFILMENT_STATUS.completed,
    STORE_FULFILMENT_STATUS.cancelled
  ]),
  [STORE_FULFILMENT_STATUS.completed]: new Set(),
  [STORE_FULFILMENT_STATUS.cancelled]: new Set()
});

const readString = value => typeof value === 'string' ? value.trim() : '';

export const canTransitionStoreFulfilment = ({ currentStatus, nextStatus }) => {
  const allowed = ALLOWED_TRANSITIONS[readString(currentStatus)];
  return Boolean(allowed?.has(readString(nextStatus)));
};

const STANDARD_CANCELLATION_REASONS = new Set([
  'Customer requested cancellation',
  'Item unavailable',
  'Duplicate order',
  'Store unable to fulfil'
]);

const normalizeCancellationReason = value => {
  const reason = readString(value);
  if (STANDARD_CANCELLATION_REASONS.has(reason)) return reason;
  if (reason.startsWith('Other:') && readString(reason.slice('Other:'.length))) return reason;
  return '';
};

const normalizeEventStatus = status => readString(status).toLowerCase().replace(/\s+/g, '-');

export const updateStoreOrderFulfilment = async ({
  db,
  uid,
  orderId,
  nextStatus,
  cancellationReason
}) => {
  const normalizedOrderId = readString(orderId);
  const normalizedNextStatus = readString(nextStatus);
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to update this order.');
  if (!normalizedOrderId) throw new HttpsError('invalid-argument', 'Order ID is required.');
  if (!Object.values(STORE_FULFILMENT_STATUS).includes(normalizedNextStatus)) {
    throw new HttpsError('invalid-argument', 'Choose a valid fulfilment status.');
  }
  const normalizedCancellationReason = normalizedNextStatus === STORE_FULFILMENT_STATUS.cancelled
    ? normalizeCancellationReason(cancellationReason)
    : '';
  if (normalizedNextStatus === STORE_FULFILMENT_STATUS.cancelled && !normalizedCancellationReason) {
    throw new HttpsError('invalid-argument', 'Choose a cancellation reason.');
  }
  if (normalizedCancellationReason.length > 240) {
    throw new HttpsError('invalid-argument', 'Cancellation reason must be 240 characters or fewer.');
  }

  const orderReference = db.collection('storeOrders').doc(normalizedOrderId);
  return db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(orderReference);
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'This order could not be found.');

    const order = orderSnapshot.data() || {};
    const workspaceId = readString(order.workspaceId);
    if (!workspaceId) throw new HttpsError('failed-precondition', 'This order has no Workspace.');

    const workspaceReference = db.collection('workspaces').doc(workspaceId);
    const membershipReference = db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`);
    const [workspaceSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(workspaceReference),
      transaction.get(membershipReference)
    ]);
    const workspace = workspaceSnapshot.exists ? workspaceSnapshot.data() || {} : {};
    const membership = membershipSnapshot.exists ? membershipSnapshot.data() || {} : {};
    const isOwner = readString(workspace.ownerId) === uid;
    const isManager = membership.userId === uid
      && membership.workspaceId === workspaceId
      && membership.status === 'Active'
      && membership.role === 'Manager';
    if (!isOwner && !isManager) {
      throw new HttpsError('permission-denied', 'Only the Store Owner or Manager can update orders.');
    }

    const currentStatus = readString(order.fulfilmentStatus);
    if (!canTransitionStoreFulfilment({
      currentStatus,
      nextStatus: normalizedNextStatus
    })) {
      throw new HttpsError('failed-precondition', 'This fulfilment status change is not allowed.');
    }

    const eventReference = db.collection('storeOrderTimeline')
      .doc(`${normalizedOrderId}_${normalizeEventStatus(normalizedNextStatus)}`);
    const readyNotificationReference = normalizedNextStatus === STORE_FULFILMENT_STATUS.ready
      ? db.collection('storeNotifications').doc(
        getStoreNotificationId(STORE_NOTIFICATION_TYPE.orderReady, normalizedOrderId)
      )
      : null;
    const orderUpdate = {
      fulfilmentStatus: normalizedNextStatus,
      fulfilmentUpdatedAt: FieldValue.serverTimestamp(),
      fulfilmentUpdatedBy: uid,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (normalizedNextStatus === STORE_FULFILMENT_STATUS.completed) {
      orderUpdate.completedAt = FieldValue.serverTimestamp();
    }
    if (normalizedNextStatus === STORE_FULFILMENT_STATUS.cancelled) {
      orderUpdate.cancelledAt = FieldValue.serverTimestamp();
      orderUpdate.cancelledBy = uid;
      orderUpdate.cancellationReason = normalizedCancellationReason;
    }
    transaction.update(orderReference, orderUpdate);
    transaction.create(eventReference, {
      id: eventReference.id,
      orderId: normalizedOrderId,
      workspaceId,
      storeId: readString(order.storeId) || workspaceId,
      type: 'fulfilment_status',
      label: normalizedNextStatus,
      previousStatus: currentStatus,
      newStatus: normalizedNextStatus,
      actingUserId: uid,
      ...(normalizedCancellationReason ? { cancellationReason: normalizedCancellationReason } : {}),
      createdAt: FieldValue.serverTimestamp()
    });
    if (readyNotificationReference) {
      transaction.create(readyNotificationReference, buildStoreNotification({
        id: readyNotificationReference.id,
        type: STORE_NOTIFICATION_TYPE.orderReady,
        order: { ...order, id: normalizedOrderId },
        title: 'Order Ready',
        message: `${readString(order.orderNumber)} is ready for pickup.`,
        createdAt: FieldValue.serverTimestamp()
      }));
    }
    return {
      orderId: normalizedOrderId,
      previousStatus: currentStatus,
      fulfilmentStatus: normalizedNextStatus,
      cancellationReason: normalizedCancellationReason
    };
  });
};
