import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateRewardContribution,
  getPublicGroupOrder,
  listHostGroupOrders,
  listHostGroupOrdersDetail,
  revalidateCheckoutGroupInTransaction,
  transitionGroupOrder
} from './groupOrders.js';
import { buildPendingOrder } from './storePaymentsCore.js';

const paidGroupOrder = (overrides = {}) => ({
  orderSource: 'online',
  total: 168,
  fulfilmentStatus: 'Preparing',
  groupOrder: { id: 'group-1', rewardPercent: 5 },
  payment: { status: 'paid', refundStatus: 'none', refundedAmountMinor: 0 },
  ...overrides
});

const nestedValue = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
const snapshot = (id, value) => ({ id, exists: value !== undefined, data: () => value });
const createFakeDb = initialDocuments => {
  const documents = structuredClone(initialDocuments);
  const writes = [];
  const reference = (collectionName, id) => ({
    collectionName,
    id,
    key: `${collectionName}/${id}`,
    get: async () => snapshot(id, documents[`${collectionName}/${id}`])
  });
  return {
    documents,
    writes,
    collection(collectionName) {
      return {
        doc: id => reference(collectionName, id),
        where(field, operator, expected) {
          assert.equal(operator, '==');
          return {
            limit() { return this; },
            async get() {
              const prefix = `${collectionName}/`;
              const docs = Object.entries(documents)
                .filter(([key, value]) => key.startsWith(prefix) && nestedValue(value, field) === expected)
                .map(([key, value]) => snapshot(key.slice(prefix.length), value));
              return { docs };
            }
          };
        }
      };
    },
    runTransaction: handler => handler({
      get: ref => ref.get(),
      update: (ref, data) => {
        writes.push({ ref, data });
        documents[ref.key] = { ...documents[ref.key], ...data };
      }
    })
  };
};

const openGroup = (overrides = {}) => ({
  shareCode: 'share-a',
  storeId: 'store-a',
  storeSlug: 'store-a',
  storeName: 'Store A',
  hostId: 'host-a',
  hostName: 'Host A',
  name: 'Office Lunch',
  pickupDate: '2026-09-01',
  pickupSession: '12:00 PM',
  pickupLocationId: 'counter',
  pickupLocationName: 'Counter',
  pickupLocationAddress: '1 Test Road',
  closesAt: '2026-09-01T03:00:00.000Z',
  status: 'open',
  rewardPercent: 5,
  minimumQualifyingSales: 20,
  orderCount: 1,
  eligibleSales: 100,
  estimatedReward: 5,
  ...overrides
});

test('eligible paid Group Sales produce the expected reward contribution', () => {
  assert.deepEqual(calculateRewardContribution(paidGroupOrder()), {
    eligible: true,
    eligibleSales: 168,
    rewardAmount: 8.4
  });
});

test('unpaid, cancelled, fully refunded, POS, and normal orders are excluded', () => {
  const variants = [
    paidGroupOrder({ payment: { status: 'pending', refundStatus: 'none', refundedAmountMinor: 0 } }),
    paidGroupOrder({ fulfilmentStatus: 'Cancelled' }),
    paidGroupOrder({ payment: { status: 'paid', refundStatus: 'refunded', refundedAmountMinor: 16800 } }),
    paidGroupOrder({ orderSource: 'pos' }),
    paidGroupOrder({ groupOrder: undefined })
  ];
  for (const order of variants) {
    assert.deepEqual(calculateRewardContribution(order), {
      eligible: false,
      eligibleSales: 0,
      rewardAmount: 0
    });
  }
});

test('partial refunds reduce eligible sales and reward to the net paid amount', () => {
  assert.deepEqual(calculateRewardContribution(paidGroupOrder({
    payment: { status: 'paid', refundStatus: 'partial', refundedAmountMinor: 1800 }
  })), {
    eligible: true,
    eligibleSales: 150,
    rewardAmount: 7.5
  });
});

test('existing order builder stores only server-resolved Group context', () => {
  const order = buildPendingOrder({
    id: 'order-1',
    orderNumber: 'MC-0823-ABCD',
    store: {
      id: 'store-1', workspaceId: 'workspace-1', name: 'Beta Store', country: 'MY', currency: 'MYR',
      pickupEnabled: true, pickupSessions: ['9:00 AM'], pickupLocations: [{ id: 'counter', name: 'Counter', address: '1 Test Road', notes: '' }],
      orderDays: ['sunday'], earliestPickupDays: 0, maximumAdvanceDays: 7, unavailableDates: []
    },
    products: [{ id: 'meal', name: 'Meal', photoUrl: '', price: 10, available: true, optionGroupIds: [] }],
    optionGroups: [],
    paymentProvider: 'manual',
    paymentProviderMode: 'manual',
    paymentMethod: { id: 'cash_on_pickup', name: 'Cash on Pickup' },
    groupOrder: { id: 'group-1', shareCode: 'secure-code', name: 'Office', hostId: 'host-1', hostName: 'Host', rewardPercent: 5 },
    draft: { customerName: 'Guest', phone: '+60123456789', pickupDate: '2026-08-23', pickupSession: '9:00 AM', pickupLocationId: 'counter', notes: '', selections: [{ productId: 'meal', quantity: 1, selectedOptions: [] }] },
    now: new Date('2026-08-23T01:00:00.000Z')
  });
  assert.equal(order.groupOrder.id, 'group-1');
  assert.equal(order.groupOrder.hostId, 'host-1');
  assert.equal(order.groupOrder.rewardPercent, 5);
  assert.equal(order.total, 10);
});

test('persisted closed and cancelled Group states override a future closing time', async () => {
  for (const status of ['closed', 'cancelled']) {
    const db = createFakeDb({ 'groupOrders/group-a': openGroup({ status }) });
    const result = await getPublicGroupOrder({
      db,
      shareCode: 'share-a',
      now: new Date('2026-08-28T00:00:00.000Z')
    });
    assert.equal(result.status, status);
  }
});

test('Host listing excludes Groups the authenticated Host only participated in as a customer', async () => {
  const db = createFakeDb({
    'stores/store-a': {
      slug: 'store-a',
      name: 'Store A',
      workspaceId: 'workspace-a',
      hostProgram: { enabled: true }
    },
    'hostProfiles/host-a': { userId: 'host-a', status: 'active' },
    'hostProfiles/host-b': { userId: 'host-b', status: 'active' },
    'groupOrders/group-a': openGroup({ hostId: 'host-a', hostName: 'Host A' }),
    'groupOrders/group-b': openGroup({
      shareCode: 'share-b',
      hostId: 'host-b',
      hostName: 'Host B',
      name: 'Host B Team Lunch'
    }),
    'storeOrders/host-b-order': {
      customerName: 'Host B',
      groupOrder: { id: 'group-a', hostId: 'host-a' }
    }
  });

  const hostA = await listHostGroupOrders({ db, uid: 'host-a', slug: 'store-a' });
  const hostB = await listHostGroupOrders({ db, uid: 'host-b', slug: 'store-a' });

  assert.equal(hostA.hostActive, true);
  assert.deepEqual(hostA.groups.map(group => group.id), ['group-a']);
  assert.equal(hostB.hostActive, true);
  assert.deepEqual(hostB.groups.map(group => group.id), ['group-b']);
});

test('Host can close only their own open Group and repeated close is idempotent', async () => {
  const paidOrder = {
    payment: { status: 'paid', refundStatus: 'none', providerPaymentId: 'secret-provider-id' },
    fulfilmentStatus: 'Preparing'
  };
  const ledger = { groupId: 'group-a', eligibleSales: 100, status: 'pending' };
  const db = createFakeDb({
    'groupOrders/group-a': openGroup(),
    'storeOrders/order-a': paidOrder,
    'hostRewardLedger/order-a': ledger
  });
  await assert.rejects(
    transitionGroupOrder({ db, uid: 'other-host', groupId: 'group-a', nextStatus: 'closed' }),
    error => error.code === 'permission-denied'
  );
  const result = await transitionGroupOrder({ db, uid: 'host-a', groupId: 'group-a', nextStatus: 'closed' });
  assert.equal(result.status, 'closed');
  assert.equal(db.documents['groupOrders/group-a'].status, 'closed');
  assert.deepEqual(db.documents['storeOrders/order-a'], paidOrder);
  assert.deepEqual(db.documents['hostRewardLedger/order-a'], ledger);
  const writesAfterClose = db.writes.length;
  await transitionGroupOrder({ db, uid: 'host-a', groupId: 'group-a', nextStatus: 'closed' });
  assert.equal(db.writes.length, writesAfterClose);
  await assert.rejects(
    transitionGroupOrder({ db, uid: 'host-a', groupId: 'group-a', nextStatus: 'cancelled' }),
    error => error.code === 'failed-precondition'
  );
});

test('Group cancellation is owner-only and leaves existing paid orders and reward ledger untouched', async () => {
  const order = {
    groupOrder: { id: 'group-a' },
    payment: { status: 'paid', refundStatus: 'partial', refundedAmountMinor: 500 },
    fulfilmentStatus: 'Ready'
  };
  const ledger = { groupId: 'group-a', eligibleSales: 95, rewardAmount: 4.75, status: 'pending' };
  const db = createFakeDb({
    'groupOrders/group-a': openGroup(),
    'storeOrders/order-a': order,
    'hostRewardLedger/order-a': ledger
  });
  await transitionGroupOrder({ db, uid: 'host-a', groupId: 'group-a', nextStatus: 'cancelled' });
  assert.equal(db.documents['groupOrders/group-a'].status, 'cancelled');
  assert.deepEqual(db.documents['storeOrders/order-a'], order);
  assert.deepEqual(db.documents['hostRewardLedger/order-a'], ledger);
});

test('Host order detail is owner-scoped and exposes only the sanitized order projection', async () => {
  const db = createFakeDb({
    'groupOrders/group-a': openGroup(),
    'storeOrders/order-a': {
      groupOrder: { id: 'group-a' },
      orderNumber: 'MC-0901-ABCD',
      customerName: 'Customer A',
      phone: '+60123456789',
      itemCount: 2,
      total: 42,
      currency: 'MYR',
      payment: { status: 'paid', providerPaymentId: 'private-payment-id', refundStatus: 'none' },
      fulfilmentStatus: 'Preparing',
      items: [{ productName: 'Private order detail' }],
      createdAt: '2026-08-28T01:00:00.000Z'
    }
  });
  await assert.rejects(
    listHostGroupOrdersDetail({ db, uid: 'other-host', groupId: 'group-a' }),
    error => error.code === 'permission-denied'
  );
  const result = await listHostGroupOrdersDetail({ db, uid: 'host-a', groupId: 'group-a' });
  assert.deepEqual(Object.keys(result.orders[0]).sort(), [
    'createdAt', 'currency', 'customerName', 'fulfilmentStatus', 'id', 'itemCount',
    'orderNumber', 'paymentStatus', 'total'
  ]);
  assert.equal(result.orders[0].paymentStatus, 'paid');
  assert.equal(JSON.stringify(result.orders).includes('private-payment-id'), false);
  assert.equal(JSON.stringify(result.orders).includes('+60123456789'), false);
});

test('checkout transaction revalidation rejects a Group closed after initial resolution', async () => {
  const db = createFakeDb({ 'groupOrders/group-a': openGroup({ status: 'closed' }) });
  const transaction = { get: ref => ref.get() };
  await assert.rejects(
    revalidateCheckoutGroupInTransaction({
      db,
      transaction,
      groupOrder: { id: 'group-a' },
      store: { id: 'store-a' },
      draft: { pickupDate: '2026-09-01', pickupSession: '12:00 PM', pickupLocationId: 'counter' },
      now: new Date('2026-08-28T00:00:00.000Z')
    }),
    /This Group Order is closed/
  );
});
