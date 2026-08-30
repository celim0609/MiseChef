export const STORE_NOTIFICATION_TYPE = Object.freeze({
  newOrder: 'new_order',
  paymentSubmitted: 'payment_submitted',
  paymentApproved: 'payment_approved',
  paymentRejected: 'payment_rejected',
  orderReady: 'order_ready'
});

const NOTIFICATION_ID_PREFIX = Object.freeze({
  [STORE_NOTIFICATION_TYPE.newOrder]: 'new-paid-order',
  [STORE_NOTIFICATION_TYPE.paymentSubmitted]: 'payment-verification',
  [STORE_NOTIFICATION_TYPE.paymentApproved]: 'payment-approved',
  [STORE_NOTIFICATION_TYPE.paymentRejected]: 'payment-rejected',
  [STORE_NOTIFICATION_TYPE.orderReady]: 'order-ready'
});

const readString = value => typeof value === 'string' ? value.trim() : '';

export const getStoreNotificationId = (type, orderId) => {
  const prefix = NOTIFICATION_ID_PREFIX[type];
  const normalizedOrderId = readString(orderId);
  if (!prefix || !normalizedOrderId) throw new Error('A valid notification type and order are required.');
  return `${prefix}_${normalizedOrderId}`;
};

export const buildStoreNotification = ({
  id,
  type,
  order,
  title,
  message,
  createdAt
}) => ({
  id,
  workspaceId: readString(order.workspaceId),
  storeId: readString(order.storeId) || readString(order.workspaceId),
  orderId: readString(order.id),
  orderNumber: readString(order.orderNumber),
  type,
  title: readString(title),
  message: readString(message),
  readAt: null,
  createdAt
});
