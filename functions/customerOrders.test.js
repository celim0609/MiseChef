import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { listCustomerOrders } from './customerOrders.js';
import { buildPendingOrder, toPublicOrderResult } from './storePaymentsCore.js';

const functionsIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

const buildOrder = ({ customerUid = '', groupOrder = null, spoofedUid = '' } = {}) => buildPendingOrder({
  id: 'order-1',
  orderNumber: 'MC-0829-ABCD',
  store: {
    id: 'store-1', workspaceId: 'workspace-1', name: 'Beta Store', country: 'MY', currency: 'MYR',
    pickupEnabled: true, pickupSessions: ['9:00 AM'], pickupLocations: [{ id: 'counter', name: 'Counter', address: '', notes: '' }],
    orderDays: ['saturday'], earliestPickupDays: 0, maximumAdvanceDays: 7, unavailableDates: []
  },
  products: [{ id: 'meal', name: 'Meal', photoUrl: '', price: 10, available: true, optionGroupIds: [] }],
  optionGroups: [],
  paymentProvider: 'manual',
  paymentProviderMode: 'manual',
  paymentMethod: { id: 'cash_on_pickup', name: 'Cash on Pickup' },
  customerUid,
  groupOrder,
  draft: {
    customerName: 'Customer', phone: '+60123456789', pickupDate: '2026-08-29', pickupSession: '9:00 AM',
    pickupLocationId: 'counter', notes: '', selections: [{ productId: 'meal', quantity: 1, selectedOptions: [] }],
    customerUid: spoofedUid
  },
  now: new Date('2026-08-29T01:00:00.000Z')
});

const snapshot = (id, data) => ({ id, data: () => data });
const createListDb = documents => ({
  collection(collectionName) {
    assert.equal(collectionName, 'storeOrders');
    return {
      where(field, operator, value) {
        assert.equal(field, 'customerUid');
        assert.equal(operator, '==');
        const matches = documents.filter(document => document.data.customerUid === value);
        return {
          orderBy(orderField, direction) {
            assert.equal(orderField, 'createdAt');
            assert.equal(direction, 'desc');
            matches.sort((a, b) => String(b.data.createdAt).localeCompare(String(a.data.createdAt)));
            return this;
          },
          limit(value) {
            assert.equal(value, 50);
            return this;
          },
          async get() {
            return { docs: matches.map(document => snapshot(document.id, document.data)) };
          }
        };
      }
    };
  }
});

test('authenticated normal and Group checkout store only the server-supplied customer UID', () => {
  const normal = buildOrder({ customerUid: 'customer-a', spoofedUid: 'attacker' });
  const grouped = buildOrder({
    customerUid: 'customer-a',
    spoofedUid: 'attacker',
    groupOrder: { id: 'group-a', shareCode: 'share-a', name: 'Office Lunch', hostId: 'host-a', hostName: 'Host A', rewardPercent: 5 }
  });

  assert.equal(normal.customerUid, 'customer-a');
  assert.equal(grouped.customerUid, 'customer-a');
  assert.equal(grouped.groupOrder.hostId, 'host-a');
  assert.notEqual(grouped.customerUid, grouped.groupOrder.hostId);
  assert.equal(JSON.stringify(normal).includes('attacker'), false);
  assert.match(functionsIndex, /customerUid: request\.auth\?\.uid \|\| ''/);
  assert.doesNotMatch(functionsIndex, /customerUid: request\.data/);
});

test('Guest checkout omits customer ownership even when the client payload spoofs it', () => {
  const guest = buildOrder({ spoofedUid: 'attacker' });
  assert.equal(Object.hasOwn(guest, 'customerUid'), false);
  assert.equal(JSON.stringify(guest).includes('attacker'), false);
});

test('public payment result carries only the exact persisted Group context for continuity', () => {
  const grouped = toPublicOrderResult({
    orderNumber: 'MC-GROUP-A', pickupCode: '1234', paymentMethodName: 'DuitNow QR',
    pickupDate: '2026-08-30', pickupSession: '9:00 AM', pickupLocationName: 'Counter',
    total: 12, status: 'Pending Verification', payment: { status: 'pending_verification' },
    groupOrder: { id: 'full-group-a-id', name: 'Office Breakfast', hostName: 'Host A', hostId: 'private-host-uid', shareCode: 'private-share-code' }
  });
  const normal = toPublicOrderResult({
    orderNumber: 'MC-NORMAL', pickupDate: '2026-08-30', pickupSession: '9:00 AM',
    pickupLocationName: 'Counter', payment: { status: 'paid' }
  });

  assert.deepEqual(grouped.groupOrder, {
    id: 'full-group-a-id',
    name: 'Office Breakfast',
    hostName: 'Host A',
    pickupDate: '2026-08-30',
    pickupSession: '9:00 AM',
    pickupLocationName: 'Counter'
  });
  assert.equal('groupOrder' in normal, false);
  assert.equal(JSON.stringify(grouped).includes('private-host-uid'), false);
  assert.equal(JSON.stringify(grouped).includes('private-share-code'), false);
});

test('customer listing is authenticated, owner-scoped, newest-first and sanitized', async () => {
  const db = createListDb([
    { id: 'order-a-old', data: {
      customerUid: 'customer-a', orderNumber: 'MC-A-OLD', createdAt: '2026-08-28T01:00:00.000Z',
      storeName: 'Store A', itemCount: 1, total: 10, currency: 'MYR', status: 'Paid', fulfilmentStatus: 'Preparing',
      payment: { status: 'paid', providerPaymentId: 'private-provider-id', checkoutAccessTokenHash: 'private-hash' },
      phone: '+60111111111', items: [{ productName: 'Private item snapshot' }]
    } },
    { id: 'order-a-new', data: {
      customerUid: 'customer-a', orderNumber: 'MC-A-NEW', createdAt: '2026-08-29T01:00:00.000Z',
      storeName: 'Store A', itemCount: 2, total: 20, currency: 'MYR', status: 'Pending Verification', fulfilmentStatus: 'New',
      payment: { status: 'pending_verification' }, groupOrder: { id: 'group-a', name: 'Office Lunch', hostId: 'host-a' }
    } },
    { id: 'order-b', data: { customerUid: 'customer-b', orderNumber: 'MC-B', createdAt: '2026-08-30T01:00:00.000Z' } },
    { id: 'historical', data: { orderNumber: 'MC-HISTORICAL', createdAt: '2026-08-31T01:00:00.000Z', phone: '+60111111111' } }
  ]);

  await assert.rejects(listCustomerOrders({ db, uid: '' }), error => error.code === 'unauthenticated');
  const result = await listCustomerOrders({ db, uid: 'customer-a' });
  assert.deepEqual(result.orders.map(order => order.orderNumber), ['MC-A-NEW', 'MC-A-OLD']);
  assert.equal(result.orders[0].groupName, 'Office Lunch');
  assert.deepEqual(Object.keys(result.orders[0]).sort(), [
    'currency', 'fulfilmentStatus', 'groupName', 'itemCount', 'orderDate', 'orderNumber',
    'orderStatus', 'paymentStatus', 'storeName', 'total'
  ]);
  const serialized = JSON.stringify(result);
  for (const privateValue of ['customerUid', 'host-a', 'private-provider-id', 'private-hash', '+60111111111', 'Private item snapshot', 'MC-B', 'MC-HISTORICAL']) {
    assert.equal(serialized.includes(privateValue), false);
  }
});
