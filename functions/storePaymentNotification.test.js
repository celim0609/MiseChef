import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileStorePayment, reconcileStoreRefund } from './storePayments.js';
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
    collection: collectionName => ({
      doc: id => reference(collectionName, id),
      where(field, _operator, value) {
        return { query: true, collectionName, field, value, limit() { return this; } };
      }
    }),
    runTransaction: handler => handler({
      get: ref => {
        if (ref.query) {
          const [parent, child] = ref.field.split('.');
          const docs = [...documents.entries()]
            .filter(([key, value]) => key.startsWith(`${ref.collectionName}/`) && value?.[parent]?.[child] === ref.value)
            .map(([key, value]) => ({ id: key.split('/').at(-1), data: () => value }));
          return Promise.resolve({ empty: docs.length === 0, docs });
        }
        return Promise.resolve(read(ref));
      },
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
      customerUid: 'customer-a',
      workspaceId: 'workspace-a',
      storeId: 'workspace-a',
      fulfilmentStatus: 'New',
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

  assert.equal(db.documents.get('storeOrders/order-a').fulfilmentStatus, 'New');
  assert.equal(db.documents.get('storeOrders/order-a').payment.status, 'paid');
  assert.equal(db.documents.get('storeOrders/order-a').customerUid, 'customer-a');
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

test('refund reconciliation preserves authenticated customer ownership', async () => {
  const db = createFakeDb({
    'storeOrders/order-refund': {
      id: 'order-refund',
      customerUid: 'customer-a',
      status: 'Paid',
      currency: 'MYR',
      payment: { providerPaymentId: 'pi_test_refund', amountMinor: 1000, status: 'paid' }
    }
  });

  const result = await reconcileStoreRefund({
    db,
    payment: {
      orderId: 'order-refund',
      providerPaymentId: 'pi_test_refund',
      amountMinor: 1000,
      currency: 'MYR',
      refund: { status: 'partial', refundedAmountMinor: 200, failureCode: '' }
    }
  });

  assert.equal(result.customerUid, 'customer-a');
  assert.equal(db.documents.get('storeOrders/order-refund').customerUid, 'customer-a');
});

test('paid is terminal for Stripe and a later failed gateway event cannot downgrade it', async () => {
  const db = createFakeDb({
    'storeOrders/order-terminal': { id: 'order-terminal', orderNumber: 'MC-TERMINAL', workspaceId: 'workspace-a', storeId: 'workspace-a', fulfilmentStatus: 'New', status: 'Paid', currency: 'MYR', payment: { providerPaymentId: 'cs_terminal', amountMinor: 590, status: 'paid' } }
  });
  const result = await reconcileStorePayment({ db, payment: { orderId: 'order-terminal', providerPaymentId: 'cs_terminal', amountMinor: 590, currency: 'MYR', status: 'failed', paymentMethod: 'card', failureCode: 'declined' } });
  assert.equal(result.payment.status, 'paid');
  assert.equal(db.documents.get('storeOrders/order-terminal').payment.status, 'paid');
  assert.equal(db.documents.get('storeOrders/order-terminal').status, 'Paid');
});

test('payment reconciliation rejects unknown orders, provider-order mismatches, amount mismatches, and currency mismatches', async () => {
  const db = createFakeDb({
    'storeOrders/order-validated': { id: 'order-validated', currency: 'MYR', payment: { providerPaymentId: 'order_curlec_ok', amountMinor: 590, status: 'pending' } }
  });
  const base = { orderId: 'order-validated', providerPaymentId: 'order_curlec_ok', amountMinor: 590, currency: 'MYR', status: 'paid' };
  await assert.rejects(reconcileStorePayment({ db, payment: { ...base, orderId: 'missing' } }), /could not be found/);
  await assert.rejects(reconcileStorePayment({ db, payment: { ...base, providerPaymentId: 'order_other' } }), /does not match/);
  await assert.rejects(reconcileStorePayment({ db, payment: { ...base, amountMinor: 591 } }), /amount does not match/);
  await assert.rejects(reconcileStorePayment({ db, payment: { ...base, currency: 'SGD' } }), /amount does not match/);
});

test('a Curlec payment id cannot be reused to pay a different MiseChef order', async () => {
  const db = createFakeDb({
    'storeOrders/order-one': { id: 'order-one', currency: 'MYR', payment: { providerPaymentId: 'order_curlec_one', providerTransactionId: 'pay_reused', amountMinor: 590, status: 'paid' } },
    'storeOrders/order-two': { id: 'order-two', currency: 'MYR', payment: { providerPaymentId: 'order_curlec_two', amountMinor: 590, status: 'pending' } }
  });
  await assert.rejects(reconcileStorePayment({ db, payment: {
    orderId: 'order-two', providerPaymentId: 'order_curlec_two', providerTransactionId: 'pay_reused',
    amountMinor: 590, currency: 'MYR', status: 'paid'
  } }), /already bound to a different MiseChef order/);
});
