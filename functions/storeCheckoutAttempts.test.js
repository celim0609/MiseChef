import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeStoreCheckoutAttempt,
  replayStoreCheckoutAttempt,
  recoverIncompleteStoreCheckoutAttempt
} from './storePayments.js';

const clone = value => structuredClone(value);
const setPath = (target, path, value) => {
  const keys = path.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
};

const createDb = records => {
  const documents = new Map(Object.entries(records).map(([key, value]) => [key, clone(value)]));
  const ref = (collection, id) => ({
    id, path: `${collection}/${id}`,
    async get() {
      const value = documents.get(this.path);
      return { exists: value !== undefined, data: () => clone(value) };
    }
  });
  return {
    collection: collection => ({ doc: id => ref(collection, id) }),
    async runTransaction(work) {
      const transaction = {
        get: reference => reference.get(),
        update: (reference, update) => {
          const current = clone(documents.get(reference.path));
          for (const [key, value] of Object.entries(update)) setPath(current, key, clone(value));
          documents.set(reference.path, current);
        }
      };
      return work(transaction);
    },
    read: path => clone(documents.get(path))
  };
};

const standardCheckout = { type: 'curlec_standard_checkout', keyId: 'key_test', orderId: 'order_curlec_1', amountMinor: 6790, currency: 'MYR' };

test('first Standard Checkout creation atomically persists all replay fields', async () => {
  const db = createDb({
    'storeOrders/local-order': { payment: { status: 'pending' } },
    'storeCheckoutAttempts/attempt': { orderId: 'local-order', storeId: 'store' }
  });
  await completeStoreCheckoutAttempt({
    db, orderReference: db.collection('storeOrders').doc('local-order'),
    checkoutAttemptReference: db.collection('storeCheckoutAttempts').doc('attempt'),
    provider: 'curlec', mode: 'standard_checkout', providerPaymentId: 'order_curlec_1',
    checkout: standardCheckout, checkoutAccessToken: 'opaque-token'
  });
  assert.equal(db.read('storeOrders/local-order').payment.providerPaymentId, 'order_curlec_1');
  assert.deepEqual(db.read('storeCheckoutAttempts/attempt'), {
    orderId: 'local-order', storeId: 'store', provider: 'curlec', providerPaymentId: 'order_curlec_1',
    checkout: standardCheckout, checkoutAccessToken: 'opaque-token'
  });
});

test('completed Standard Checkout retry replays persisted session fields without provider creation', async () => {
  const attempt = { orderId: 'local-order', provider: 'curlec', providerPaymentId: 'order_curlec_1', checkout: standardCheckout, checkoutAccessToken: 'opaque-token' };
  const db = createDb({ 'storeOrders/local-order': { orderNumber: 'MC-TEST-0002', pickupCode: '0002' } });
  const result = await replayStoreCheckoutAttempt({ db, priorAttempt: attempt, mode: 'standard_checkout' });
  assert.equal(result.paymentSessionId, 'order_curlec_1');
  assert.deepEqual(result.checkout, standardCheckout);
  assert.equal(result.checkoutAccessToken, 'opaque-token');
});

test('legacy incomplete Standard Checkout attempt recovers its existing Curlec session without a duplicate', async () => {
  const db = createDb({
    'storeOrders/legacy-order': {
      orderNumber: 'MC-TEST-0001', pickupCode: '0001', currency: 'MYR', storeName: 'Test Store',
      payment: { provider: 'curlec', providerMode: 'standard_checkout', providerPaymentId: 'order_existing', status: 'pending' }
    },
    'storeCheckoutAttempts/legacy-attempt': { orderId: 'legacy-order', storeId: 'store' }
  });
  let recoverCalls = 0;
  let createCalls = 0;
  const result = await recoverIncompleteStoreCheckoutAttempt({
    db, checkoutAttemptReference: db.collection('storeCheckoutAttempts').doc('legacy-attempt'),
    priorAttempt: db.read('storeCheckoutAttempts/legacy-attempt'),
    activeAdapter: {
      provider: 'curlec', mode: 'standard_checkout',
      async createPayment() { createCalls += 1; throw new Error('must not create'); },
      async recoverPayment({ order }) {
        recoverCalls += 1;
        return { providerPaymentId: order.payment.providerPaymentId, checkout: { ...standardCheckout, orderId: order.payment.providerPaymentId } };
      }
    }
  });
  assert.equal(recoverCalls, 1);
  assert.equal(createCalls, 0);
  assert.equal(result.paymentSessionId, 'order_existing');
  const attempt = db.read('storeCheckoutAttempts/legacy-attempt');
  assert.equal(attempt.providerPaymentId, 'order_existing');
  assert.equal(attempt.checkout.orderId, 'order_existing');
  assert.match(attempt.checkoutAccessToken, /^[a-f0-9]{64}$/);
  assert.match(db.read('storeOrders/legacy-order').payment.checkoutAccessTokenHash, /^[a-f0-9]{64}$/);
});

test('legacy recovery refuses to create a new provider session when the persisted session is absent', async () => {
  const db = createDb({
    'storeOrders/broken-order': { payment: { provider: 'curlec', providerMode: 'standard_checkout', status: 'pending' } },
    'storeCheckoutAttempts/broken-attempt': { orderId: 'broken-order', storeId: 'store' }
  });
  let createCalls = 0;
  const result = await recoverIncompleteStoreCheckoutAttempt({
    db, checkoutAttemptReference: db.collection('storeCheckoutAttempts').doc('broken-attempt'),
    priorAttempt: db.read('storeCheckoutAttempts/broken-attempt'),
    activeAdapter: { provider: 'curlec', mode: 'standard_checkout', async createPayment() { createCalls += 1; }, async recoverPayment() { throw new Error('must not recover'); } }
  });
  assert.equal(result, null);
  assert.equal(createCalls, 0);
});
