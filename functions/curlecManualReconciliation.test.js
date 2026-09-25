import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { getStorePaymentResult } from './storePayments.js';

const hashToken = token => createHash('sha256').update(token).digest('hex');

const setNestedValue = (target, path, value) => {
  const parts = path.split('.');
  const key = parts.pop();
  const parent = parts.reduce((current, part) => (current[part] ||= {}), target);
  parent[key] = value;
};

const createFakeDb = initialDocuments => {
  const documents = new Map(Object.entries(structuredClone(initialDocuments)));
  const writes = [];
  const reference = (collectionName, id) => ({ collectionName, id, key: `${collectionName}/${id}` });
  const snapshot = ref => ({ exists: documents.has(ref.key), data: () => documents.get(ref.key) });
  return {
    documents,
    writes,
    collection: collectionName => ({
      doc: id => {
        const ref = reference(collectionName, id);
        return { ...ref, get: async () => snapshot(ref) };
      },
      where(field, _operator, value) {
        return { query: true, collectionName, field, value, limit() { return this; } };
      }
    }),
    runTransaction: handler => handler({
      get: async ref => {
        if (!ref.query) return snapshot(ref);
        const [parent, child] = ref.field.split('.');
        const docs = [...documents.entries()]
          .filter(([key, value]) => key.startsWith(`${ref.collectionName}/`) && value?.[parent]?.[child] === ref.value)
          .map(([key, value]) => ({ id: key.split('/').at(-1), data: () => value }));
        return { empty: docs.length === 0, docs };
      },
      update(ref, update) {
        const next = structuredClone(documents.get(ref.key));
        Object.entries(update).forEach(([path, value]) => setNestedValue(next, path, value));
        documents.set(ref.key, next);
        writes.push({ operation: 'update', key: ref.key });
      },
      create(ref, value) {
        if (documents.has(ref.key)) throw new Error('already exists');
        documents.set(ref.key, value);
        writes.push({ operation: 'create', key: ref.key });
      }
    })
  };
};

const checkoutToken = 'checkout-access-token';
const order = (overrides = {}) => ({
  id: 'mise-order-1', orderNumber: 'MC-0908-ABCD', storeId: 'store-1', workspaceId: 'workspace-1',
  storeName: 'MiseChef Kitchen', currency: 'MYR', status: 'Awaiting Payment', fulfilmentStatus: 'New',
  payment: {
    provider: 'curlec', providerPaymentId: 'order_curlec_1', amountMinor: 1590, status: 'pending',
    checkoutAccessTokenHash: hashToken(checkoutToken)
  },
  ...overrides
});

const dbFor = (orderOverrides = {}) => createFakeDb({
  'storeOrders/mise-order-1': order(orderOverrides),
  'stores/store-1': { slug: 'test-store' }
});

const localPayment = {
  providerPaymentId: 'order_curlec_1', orderId: 'mise-order-1', amountMinor: 1590,
  currency: 'MYR', status: 'pending'
};
const capturedPayment = {
  ...localPayment, providerTransactionId: 'pay_curlec_1', status: 'paid',
  providerStatus: 'captured', paymentMethod: 'fpx', failureCode: ''
};

const adapterFor = ({ verifiedPayment = null, onLookup } = {}) => ({
  provider: 'curlec', requiresSellingWorkspace: true,
  retrievePayment: async () => localPayment,
  retrieveVerifiedCapturedPayment: async ({ order: authorizedOrder }) => {
    onLookup?.(authorizedOrder);
    return verifiedPayment;
  }
});

const getResult = ({ db, adapter, token = checkoutToken }) => getStorePaymentResult({
  db, adapter, sellingWorkspaceId: 'workspace-1', slug: 'test-store',
  providerPaymentId: 'order_curlec_1', checkoutAccessToken: token
});

test('authorized Curlec manual lookup promotes one verified captured payment through reconciliation', async () => {
  const db = dbFor();
  const result = await getResult({ db, adapter: adapterFor({ verifiedPayment: capturedPayment }) });
  assert.equal(result.paymentStatus, 'paid');
  assert.equal(result.status, 'Paid');
  assert.equal(db.documents.get('storeOrders/mise-order-1').payment.status, 'paid');
  assert.equal(db.documents.get('storeOrders/mise-order-1').payment.providerTransactionId, 'pay_curlec_1');
  assert.ok(db.writes.some(write => write.key === 'storeNotifications/new-paid-order_mise-order-1'));
});

test('non-captured Curlec states do not mutate the existing pending payment', async t => {
  for (const providerStatus of ['created', 'attempted', 'authorized', 'failed']) {
    await t.test(providerStatus, async () => {
      const db = dbFor();
      const result = await getResult({ db, adapter: adapterFor({ verifiedPayment: null }) });
      assert.equal(result.paymentStatus, 'pending');
      assert.equal(db.documents.get('storeOrders/mise-order-1').payment.status, 'pending');
      assert.equal(db.writes.length, 0);
    });
  }
});

test('manual Curlec lookup does not replace an existing non-pending payment state', async () => {
  const db = dbFor({ status: 'Payment Failed', payment: { ...order().payment, status: 'failed' } });
  let lookupCalls = 0;
  const result = await getResult({ db, adapter: adapterFor({
    verifiedPayment: capturedPayment,
    onLookup: () => { lookupCalls += 1; }
  }) });
  assert.equal(result.paymentStatus, 'failed');
  assert.equal(lookupCalls, 0);
  assert.equal(db.writes.length, 0);
});

test('invalid checkout access token prevents Curlec provider lookup', async () => {
  const db = dbFor();
  let lookupCalls = 0;
  await assert.rejects(getResult({
    db,
    token: 'invalid-token',
    adapter: adapterFor({ onLookup: () => { lookupCalls += 1; } })
  }), /checkout access token is invalid/);
  assert.equal(lookupCalls, 0);
  assert.equal(db.documents.get('storeOrders/mise-order-1').payment.status, 'pending');
  assert.equal(db.writes.length, 0);
});

test('Curlec lookup failure leaves the pending payment and recovery credential unchanged', async () => {
  const db = dbFor();
  const initialHash = db.documents.get('storeOrders/mise-order-1').payment.checkoutAccessTokenHash;
  const adapter = adapterFor({ onLookup: () => { throw new Error('Curlec unavailable'); } });
  await assert.rejects(getResult({ db, adapter }), /Curlec unavailable/);
  const persisted = db.documents.get('storeOrders/mise-order-1');
  assert.equal(persisted.payment.status, 'pending');
  assert.equal(persisted.payment.checkoutAccessTokenHash, initialHash);
  assert.equal(db.writes.length, 0);
});
