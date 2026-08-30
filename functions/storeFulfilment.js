import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  buildStoreNotification,
  getStoreNotificationId,
  STORE_NOTIFICATION_TYPE
} from './storeNotifications.js';
import { hasActiveBusinessEntitlement } from './subscriptionFoundation.js';

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

export const STORE_GROUP_BATCH_ACTION = Object.freeze({
  startPreparing: 'start_preparing',
  markReady: 'mark_ready',
  complete: 'complete'
});

export const MAX_STORE_GROUP_BATCH_ORDERS = 150;

const GROUP_BATCH_TRANSITIONS = Object.freeze({
  [STORE_GROUP_BATCH_ACTION.startPreparing]: {
    currentStatus: STORE_FULFILMENT_STATUS.new,
    nextStatus: STORE_FULFILMENT_STATUS.preparing
  },
  [STORE_GROUP_BATCH_ACTION.markReady]: {
    currentStatus: STORE_FULFILMENT_STATUS.preparing,
    nextStatus: STORE_FULFILMENT_STATUS.ready
  },
  [STORE_GROUP_BATCH_ACTION.complete]: {
    currentStatus: STORE_FULFILMENT_STATUS.ready,
    nextStatus: STORE_FULFILMENT_STATUS.completed
  }
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

const hasStoreProcessingAuthority = ({ uid, workspaceId, workspace, membership }) => (
  readString(workspace.ownerId) === uid
  || (
    membership.userId === uid
    && membership.workspaceId === workspaceId
    && membership.status === 'Active'
    && ['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef'].includes(membership.role)
  )
);

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
    if (!hasActiveBusinessEntitlement(workspace)) {
      throw new HttpsError('permission-denied', 'An active Workspace Business subscription is required.');
    }
    if (!hasStoreProcessingAuthority({ uid, workspaceId, workspace, membership })) {
      throw new HttpsError('permission-denied', 'Your Workspace role cannot process Store orders.');
    }

    const currentStatus = readString(order.fulfilmentStatus);
    const isLegacyCashOnPickup = readString(order.paymentMethodId) === 'cash_on_pickup';
    const requiresConfirmedPayment = readString(order.orderSource) === 'online' && !isLegacyCashOnPickup;
    if (
      normalizedNextStatus !== STORE_FULFILMENT_STATUS.cancelled
      && requiresConfirmedPayment
      && readString(order.payment?.status) !== 'paid'
    ) {
      throw new HttpsError('failed-precondition', 'Confirm payment before processing this order.');
    }
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

export const updateStoreGroupOrderFulfilment = async ({ db, uid, groupId, action }) => {
  const normalizedGroupId = readString(groupId);
  const transition = GROUP_BATCH_TRANSITIONS[readString(action)];
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to update this Group Order.');
  if (!normalizedGroupId) throw new HttpsError('invalid-argument', 'Group Order ID is required.');
  if (!transition) throw new HttpsError('invalid-argument', 'Choose a valid Group Kitchen action.');

  return db.runTransaction(async transaction => {
    const groupReference = db.collection('groupOrders').doc(normalizedGroupId);
    const groupSnapshot = await transaction.get(groupReference);
    if (!groupSnapshot.exists) throw new HttpsError('not-found', 'This Group Order could not be found.');

    const group = groupSnapshot.data() || {};
    const workspaceId = readString(group.workspaceId);
    const storeId = readString(group.storeId);
    if (!workspaceId || !storeId) {
      throw new HttpsError('failed-precondition', 'This Group Order has no canonical Store ownership.');
    }

    const workspaceReference = db.collection('workspaces').doc(workspaceId);
    const membershipReference = db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`);
    const [workspaceSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(workspaceReference),
      transaction.get(membershipReference)
    ]);
    const workspace = workspaceSnapshot.exists ? workspaceSnapshot.data() || {} : {};
    const membership = membershipSnapshot.exists ? membershipSnapshot.data() || {} : {};
    if (!hasActiveBusinessEntitlement(workspace)) {
      throw new HttpsError('permission-denied', 'An active Workspace Business subscription is required.');
    }
    if (!hasStoreProcessingAuthority({ uid, workspaceId, workspace, membership })) {
      throw new HttpsError('permission-denied', 'Your Workspace role cannot process Store orders.');
    }

    const ordersSnapshot = await transaction.get(
      db.collection('storeOrders').where('groupOrder.id', '==', normalizedGroupId)
    );
    const matchedOrders = ordersSnapshot.docs.map(document => ({
      document,
      order: document.data() || {}
    }));
    if (matchedOrders.some(({ order }) => (
      readString(order.groupOrder?.id) !== normalizedGroupId
      || readString(order.workspaceId) !== workspaceId
      || readString(order.storeId) !== storeId
    ))) {
      throw new HttpsError('failed-precondition', 'This Group Order contains inconsistent Store ownership.');
    }

    if (matchedOrders.length > MAX_STORE_GROUP_BATCH_ORDERS) {
      throw new HttpsError(
        'resource-exhausted',
        `This Group action supports up to ${MAX_STORE_GROUP_BATCH_ORDERS} member orders at once.`
      );
    }
    const eligibleOrders = matchedOrders.filter(({ order }) => (
      readString(order.payment?.status) === 'paid'
      && readString(order.fulfilmentStatus) === transition.currentStatus
    ));

    for (const { document, order } of eligibleOrders) {
      const orderUpdate = {
        fulfilmentStatus: transition.nextStatus,
        fulfilmentUpdatedAt: FieldValue.serverTimestamp(),
        fulfilmentUpdatedBy: uid,
        updatedAt: FieldValue.serverTimestamp()
      };
      if (transition.nextStatus === STORE_FULFILMENT_STATUS.completed) {
        orderUpdate.completedAt = FieldValue.serverTimestamp();
      }
      transaction.update(document.ref, orderUpdate);

      const eventReference = db.collection('storeOrderTimeline')
        .doc(`${document.id}_${normalizeEventStatus(transition.nextStatus)}`);
      transaction.create(eventReference, {
        id: eventReference.id,
        orderId: document.id,
        workspaceId,
        storeId,
        type: 'fulfilment_status',
        label: transition.nextStatus,
        previousStatus: transition.currentStatus,
        newStatus: transition.nextStatus,
        actingUserId: uid,
        batchGroupOrderId: normalizedGroupId,
        createdAt: FieldValue.serverTimestamp()
      });

      if (transition.nextStatus === STORE_FULFILMENT_STATUS.ready) {
        const notificationReference = db.collection('storeNotifications').doc(
          getStoreNotificationId(STORE_NOTIFICATION_TYPE.orderReady, document.id)
        );
        transaction.create(notificationReference, buildStoreNotification({
          id: notificationReference.id,
          type: STORE_NOTIFICATION_TYPE.orderReady,
          order: { ...order, id: document.id },
          title: 'Order Ready',
          message: `${readString(order.orderNumber)} is ready for pickup.`,
          createdAt: FieldValue.serverTimestamp()
        }));
      }
    }

    return {
      groupId: normalizedGroupId,
      action: readString(action),
      previousStatus: transition.currentStatus,
      fulfilmentStatus: transition.nextStatus,
      matchedOrderCount: matchedOrders.length,
      transitionedOrderCount: eligibleOrders.length
    };
  });
};
