import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countActiveOnlineOrders,
  filterHistoryOrders,
  getMalaysiaDateRange,
  getOrderCompletionTimestamp,
  isOrderOperationallyEligible,
  isAdvancePreorderDate,
  isOrderCompletedOnMalaysiaDate,
  shiftDateKey,
  toActivePosStatus,
  toMalaysiaDateKey
} from './posOrderModel';
import type { StoreOrder } from './types';

const order = (
  id: string,
  fulfilmentStatus: StoreOrder['fulfilmentStatus'],
  paymentStatus: StoreOrder['payment']['status'] = 'paid',
  orderSource: StoreOrder['orderSource'] = 'online'
) => ({
  id,
  orderNumber: `MC-${id}`,
  fulfilmentStatus,
  orderSource,
  payment: { status: paymentStatus }
}) as StoreOrder;

test('active POS statuses preserve the existing kitchen transitions and legacy entry states', () => {
  assert.equal(toActivePosStatus('New'), 'New');
  assert.equal(toActivePosStatus('Paid'), 'New');
  assert.equal(toActivePosStatus('Confirmed'), 'New');
  assert.equal(toActivePosStatus('Preparing'), 'Preparing');
  assert.equal(toActivePosStatus('Ready'), 'Ready');
  assert.equal(toActivePosStatus('Completed'), null);
  assert.equal(toActivePosStatus('Cancelled'), null);
});

test('Active Online Orders counts only online orders visible in the active queue', () => {
  assert.equal(countActiveOnlineOrders([
    order('new', 'New'),
    order('ready', 'Ready'),
    order('completed', 'Completed'),
    order('pos', 'Preparing', 'paid', 'pos')
  ]), 2);
});

test('payment state coexists with every operational fulfilment state', () => {
  const states: Array<[StoreOrder['fulfilmentStatus'], StoreOrder['payment']['status']]> = [
    ['New', 'pending_verification'],
    ['New', 'paid'],
    ['Preparing', 'paid'],
    ['Ready', 'paid'],
    ['Completed', 'paid'],
    ['Cancelled', 'paid']
  ];
  const orders = states.map(([fulfilment, payment], index) => order(String(index), fulfilment, payment));
  assert.deepEqual(orders.map(value => [value.fulfilmentStatus, value.payment.status]), states);
  assert.deepEqual(orders.map(value => toActivePosStatus(value.fulfilmentStatus)), [
    'New', 'New', 'Preparing', 'Ready', null, null
  ]);
  assert.equal(countActiveOnlineOrders(orders), 3);
});

test('pending manual payments stay out of the active queue until confirmation', () => {
  const pending = {
    ...order('manual', 'New', 'pending_verification'),
    paymentMethodId: 'duitnow_qr'
  } as StoreOrder;
  const paid = {
    ...pending,
    payment: { ...pending.payment, status: 'paid' as const }
  };
  assert.equal(countActiveOnlineOrders([pending]), 0);
  assert.equal(countActiveOnlineOrders([paid]), 1);
});

test('Malaysia business dates do not follow UTC midnight', () => {
  assert.equal(toMalaysiaDateKey('2026-08-21T16:30:00.000Z'), '2026-08-22');
  assert.equal(shiftDateKey('2026-08-22', -1), '2026-08-21');
  const range = getMalaysiaDateRange('2026-08-22');
  assert.equal(range.start.toISOString(), '2026-08-21T16:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-08-22T16:00:00.000Z');
});

test('Completed today uses completion time with a legacy fulfilment clock fallback', () => {
  const canonical = {
    ...order('canonical', 'Completed'),
    createdAt: '2026-08-21T10:00:00.000Z',
    completedAt: '2026-08-22T05:00:00.000Z',
    fulfilmentUpdatedAt: '2026-08-22T04:59:59.000Z'
  } as StoreOrder;
  const legacy = {
    ...order('legacy', 'Completed'),
    createdAt: '2026-08-21T10:00:00.000Z',
    completedAt: '',
    fulfilmentUpdatedAt: '2026-08-22T06:00:00.000Z'
  } as StoreOrder;

  assert.equal(getOrderCompletionTimestamp(canonical), canonical.completedAt);
  assert.equal(getOrderCompletionTimestamp(legacy), legacy.fulfilmentUpdatedAt);
  assert.equal(isOrderCompletedOnMalaysiaDate(canonical, '2026-08-22'), true);
  assert.equal(isOrderCompletedOnMalaysiaDate(legacy, '2026-08-22'), true);
  assert.equal(isOrderCompletedOnMalaysiaDate(canonical, '2026-08-21'), false);
});

test('history filters status and order ID within the already date-scoped result', () => {
  const orders = [
    order('completed', 'Completed'),
    order('cancelled', 'Cancelled'),
    order('pending', 'New', 'pending')
  ];
  assert.deepEqual(filterHistoryOrders(orders, 'completed', '').map(value => value.id), ['completed']);
  assert.deepEqual(filterHistoryOrders(orders, 'cancelled', '').map(value => value.id), ['cancelled']);
  assert.deepEqual(filterHistoryOrders(orders, 'paid', '').map(value => value.id), ['completed', 'cancelled']);
  assert.deepEqual(filterHistoryOrders(orders, 'pending', '').map(value => value.id), ['pending']);
  assert.deepEqual(filterHistoryOrders(orders, 'all', 'MC-CANCEL').map(value => value.id), ['cancelled']);
});

test('POS orders require recorded payment before entering the kitchen', () => {
 const pending = { ...order('manual', 'New', 'pending', 'pos'), paymentMethodId: 'other_paid' } as StoreOrder;
 assert.equal(isOrderOperationallyEligible(pending), false);
 assert.equal(isOrderOperationallyEligible({ ...pending, payment: { ...pending.payment, status: 'paid' } }), true);
 assert.equal(isOrderOperationallyEligible({ ...pending, paymentMethodId: 'cash_on_pickup' }), false);
});

test('legacy online cash-on-pickup remains eligible', () => {
 const onlineCash = { ...order('online-cash', 'New', 'pending', 'online'), paymentMethodId: 'cash_on_pickup' } as StoreOrder;
 assert.equal(isOrderOperationallyEligible(onlineCash), true);
});

test('one-day advance preorder follows Malaysia calendar at UTC boundary', () => {
 const now = '2026-10-18T16:30:00.000Z'; // Already 19 October in Malaysia
 assert.equal(isAdvancePreorderDate('2026-10-19',now),false);
 assert.equal(isAdvancePreorderDate('2026-10-20',now),true);
 assert.equal(isAdvancePreorderDate('2026-10-21',now),true);
 assert.equal(isAdvancePreorderDate('2026-10-18',now),false);
 assert.equal(isAdvancePreorderDate('not-a-date',now),false);
 assert.equal(isAdvancePreorderDate('2026-02-30',now),false);
 assert.equal(isAdvancePreorderDate('2026-13-01',now),false);
});
