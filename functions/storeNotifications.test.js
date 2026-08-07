import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStoreNotification,
  getStoreNotificationId,
  STORE_NOTIFICATION_TYPE
} from './storeNotifications.js';

test('Store notification ids are deterministic for every supported event', () => {
  assert.equal(getStoreNotificationId(STORE_NOTIFICATION_TYPE.newOrder, 'order-a'), 'new-paid-order_order-a');
  assert.equal(getStoreNotificationId(STORE_NOTIFICATION_TYPE.paymentSubmitted, 'order-a'), 'payment-verification_order-a');
  assert.equal(getStoreNotificationId(STORE_NOTIFICATION_TYPE.paymentApproved, 'order-a'), 'payment-approved_order-a');
  assert.equal(getStoreNotificationId(STORE_NOTIFICATION_TYPE.paymentRejected, 'order-a'), 'payment-rejected_order-a');
  assert.equal(getStoreNotificationId(STORE_NOTIFICATION_TYPE.orderReady, 'order-a'), 'order-ready_order-a');
});

test('the channel-neutral notification model contains routing and persistent read state', () => {
  const notification = buildStoreNotification({
    id: 'payment-approved_order-a',
    type: STORE_NOTIFICATION_TYPE.paymentApproved,
    order: {
      id: 'order-a',
      orderNumber: 'MC-001',
      workspaceId: 'workspace-a',
      storeId: 'store-a'
    },
    title: 'Payment approved',
    message: 'MC-001 payment was approved.',
    createdAt: 'server-timestamp'
  });

  assert.deepEqual(notification, {
    id: 'payment-approved_order-a',
    type: 'payment_approved',
    orderId: 'order-a',
    orderNumber: 'MC-001',
    workspaceId: 'workspace-a',
    storeId: 'store-a',
    title: 'Payment approved',
    message: 'MC-001 payment was approved.',
    readAt: null,
    createdAt: 'server-timestamp'
  });
  assert.equal('channel' in notification, false);
  assert.equal('pushToken' in notification, false);
});
