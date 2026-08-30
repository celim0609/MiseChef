import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-misechef-preview';
const require = createRequire(import.meta.url);
const { initializeApp, deleteApp } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/app/index.js`
);
const { getFirestore } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/firestore/index.js`
);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJECT_ID;

const app = initializeApp({ projectId: PROJECT_ID }, 'verify-store-payment-qa');
const db = getFirestore(app);

const readOrder = async customerName => {
  const snapshot = await db.collection('storeOrders')
    .where('customerName', '==', customerName)
    .get();
  assert.equal(snapshot.size, 1, `Expected exactly one ${customerName} sandbox order.`);
  return snapshot.docs[0];
};

const readOrderEvents = async orderId => {
  const [notifications, timeline] = await Promise.all([
    db.collection('storeNotifications').where('orderId', '==', orderId).get(),
    db.collection('storeOrderTimeline').where('orderId', '==', orderId).get()
  ]);
  return { notifications, timeline };
};

const [completedDocument, cancelledDocument, declinedDocument] = await Promise.all([
  readOrder('Milestone 45E QA'),
  readOrder('Milestone 45E Refund'),
  readOrder('Milestone 45E Decline')
]);
const completed = completedDocument.data();
const cancelled = cancelledDocument.data();
const declined = declinedDocument.data();
const [completedEvents, cancelledEvents, declinedEvents] = await Promise.all([
  readOrderEvents(completedDocument.id),
  readOrderEvents(cancelledDocument.id),
  readOrderEvents(declinedDocument.id)
]);

assert.equal(completed.payment?.status, 'paid');
assert.equal(completed.fulfilmentStatus, 'Completed');
assert.equal(completedEvents.notifications.size, 1);
assert.equal(completedEvents.timeline.size, 4);

assert.equal(cancelled.payment?.status, 'paid');
assert.equal(cancelled.payment?.refundStatus, 'refunded');
assert.equal(cancelled.fulfilmentStatus, 'Cancelled');
assert.equal(cancelledEvents.notifications.size, 1);
assert.equal(cancelledEvents.timeline.size, 2);

assert.equal(declined.payment?.status, 'cancelled');
assert.equal(declined.fulfilmentStatus, '');
assert.equal(declinedEvents.notifications.size, 0);
assert.equal(declinedEvents.timeline.size, 0);

console.log(JSON.stringify({
  completedOrder: {
    orderNumber: completed.orderNumber,
    paymentStatus: completed.payment.status,
    fulfilmentStatus: completed.fulfilmentStatus,
    notificationCount: completedEvents.notifications.size,
    timelineCount: completedEvents.timeline.size
  },
  refundedOrder: {
    orderNumber: cancelled.orderNumber,
    paymentStatus: cancelled.payment.status,
    refundStatus: cancelled.payment.refundStatus,
    fulfilmentStatus: cancelled.fulfilmentStatus,
    notificationCount: cancelledEvents.notifications.size,
    timelineCount: cancelledEvents.timeline.size
  },
  declinedAndCancelledOrder: {
    orderNumber: declined.orderNumber,
    paymentStatus: declined.payment.status,
    fulfilmentStatus: declined.fulfilmentStatus,
    notificationCount: declinedEvents.notifications.size,
    timelineCount: declinedEvents.timeline.size
  }
}, null, 2));

await deleteApp(app);
