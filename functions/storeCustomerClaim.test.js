import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { claimPublicStoreGuestOrderOperation } from './storePayments.js';
import { listCustomerOrders } from './customerOrders.js';

const token = 'checkout-access-token';
const order = () => ({
  orderNumber: 'MC-CLAIM-1', storeId: 'store-1', total: 14, currency: 'MYR',
  createdAt: '2026-09-25T00:00:00.000Z', itemCount: 1, storeName: 'Claim Store',
  items: [{ productName: 'Meal', quantity: 1 }], payment: {
    provider: 'stripe', providerPaymentId: 'payment-1', checkoutAccessTokenHash: createHash('sha256').update(token).digest('hex'), status: 'paid'
  }
});

const createDb = data => ({
  collection(name) {
    if (name === 'storeOrders') return {
      doc: id => ({ collection: name, id, get: async () => ({ exists: id === 'order-1', data: () => data }) }),
      where: (_field, _operator, value) => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: data.customerUid === value ? [{ id: 'order-1', data: () => data }] : [] }) }) }) })
    };
    if (name === 'stores') return { doc: id => ({ collection: name, id, get: async () => ({ exists: id === 'store-1', data: () => ({ slug: 'claim-store' }) }) }) };
    throw new Error(`Unexpected collection ${name}`);
  },
  async runTransaction(run) {
    return run({
      get: async ref => ref.collection === 'storeOrders'
        ? { exists: true, data: () => data }
        : { exists: ref.id === 'store-1', data: () => ({ slug: 'claim-store' }) },
      update: (_ref, update) => Object.assign(data, update)
    });
  }
});

const adapter = { provider: 'stripe', retrievePayment: async () => ({ orderId: 'order-1', providerPaymentId: 'payment-1' }) };
const claim = (db, authUid, checkoutAccessToken = token, slug = 'claim-store', adapterOverride = adapter, providerPaymentId = 'payment-1') => claimPublicStoreGuestOrderOperation({
  db, adapter: adapterOverride, authUid, slug, providerPaymentId, checkoutAccessToken
});

test('a valid authenticated claim adds only ownership fields and immediately appears in My Orders', async () => {
  const data = order();
  const before = structuredClone(data);
  const db = createDb(data);
  assert.deepEqual(await claim(db, 'customer-a'), { orderNumber: 'MC-CLAIM-1', claimed: true });
  assert.equal(data.customerUid, 'customer-a');
  assert.ok(Object.hasOwn(data, 'claimedAt'));
  delete data.customerUid;
  delete data.claimedAt;
  assert.deepEqual(data, before);
  data.customerUid = 'customer-a';
  assert.deepEqual((await listCustomerOrders({ db, uid: 'customer-a' })).orders.map(value => value.orderNumber), ['MC-CLAIM-1']);
});

test('same owner replay is a no-op while a different owner, invalid credential, or wrong Store is denied', async () => {
  const data = order();
  const db = createDb(data);
  await claim(db, 'customer-a');
  const claimedAt = data.claimedAt;
  assert.deepEqual(await claim(db, 'customer-a'), { orderNumber: 'MC-CLAIM-1', claimed: false });
  assert.equal(data.claimedAt, claimedAt);
  await assert.rejects(claim(db, 'customer-b'), error => error.code === 'permission-denied');
  await assert.rejects(claim(createDb(order()), 'customer-a', 'wrong-token'), /checkout access token is invalid/i);
  await assert.rejects(claim(createDb(order()), 'customer-a', token, 'other-store'), /does not belong to this Store/i);
  await assert.rejects(claim(createDb(order()), 'customer-a', token, 'claim-store', adapter, 'wrong-payment-session'), /does not match this MiseChef order/i);
  await assert.rejects(claim(createDb(order()), 'customer-a', token, 'claim-store', { provider: 'curlec', retrievePayment: adapter.retrievePayment }), /different payment provider/i);
});

test('the Store claim operation accepts no customer identifier or email/phone lookup input', () => {
  const source = String(claimPublicStoreGuestOrderOperation);
  assert.match(source, /authUid/);
  assert.doesNotMatch(source, /customerEmail|phone/);
});
