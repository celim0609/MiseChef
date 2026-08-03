import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileStorePayment } from './storePayments.js';
import { PAYMENT_STATUS } from './storePaymentsCore.js';

const setNestedValue = (target, path, value) => {
  const parts = path.split('.');
  const finalKey = parts.pop();
  const parent = parts.reduce((current, part) => {
    current[part] ||= {};
    return current[part];
  }, target);
  parent[finalKey] = value;
};

const createFakeDb = initialDocuments => {
  const documents = new Map(Object.entries(initialDocuments));
  const writes = [];
  const reference = (collectionName, id) => ({
    collectionName,
    id,
    key: `${collectionName}/${id}`
  });
  const read = ref => ({
    exists: documents.has(ref.key),
    data: () => documents.get(ref.key)
  });
  return {
    documents,
    writes,
    collection: collectionName => ({ doc: id => reference(collectionName, id) }),
    runTransaction: handler => handler({
      get: ref => Promise.resolve(read(ref)),
      update(ref, update) {
        const next = structuredClone(documents.get(ref.key));
        Object.entries(update).forEach(([path, value]) => setNestedValue(next, path, value));
        documents.set(ref.key, next);
        writes.push({ operation: 'update', key: ref.key });
      },
      create(ref, data) {
        if (documents.has(ref.key)) throw new Error('already-exists');
        documents.set(ref.key, data);
        writes.push({ operation: 'create', key: ref.key });
      }
    })
  };
};

test('the first paid reconciliation creates exactly one notification and one payment timeline event', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': {
      id: 'order-a',
      orderNumber: 'MC-260729-PAID01',
      workspaceId: 'workspace-a',
      storeId: 'workspace-a',
      currency: 'MYR',
      payment: {
        providerPaymentId: 'pi_test_paid',
        amountMinor: 590,
        status: 'pending'
      }
    }
  });
  const payment = {
    orderId: 'order-a',
    providerPaymentId: 'pi_test_paid',
    amountMinor: 590,
    currency: 'MYR',
    status: PAYMENT_STATUS.paid,
    paymentMethod: 'card',
    failureCode: ''
  };

  await reconcileStorePayment({ db, payment });
  await reconcileStorePayment({ db, payment });

  assert.equal(db.documents.get('storeOrders/order-a').fulfilmentStatus, 'Paid');
  assert.equal(db.documents.get('storeOrders/order-a').payment.status, 'paid');
  assert.equal(db.documents.get('storeNotifications/new-paid-order_order-a').orderId, 'order-a');
  assert.equal(db.documents.get('storeOrderTimeline/order-a_payment-received').label, 'Payment Received');
  assert.equal(
    db.writes.filter(write => write.key === 'storeNotifications/new-paid-order_order-a').length,
    1
  );
  assert.equal(
    db.writes.filter(write => write.key === 'storeOrderTimeline/order-a_payment-received').length,
    1
  );
});
