import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRewardContribution } from './groupOrders.js';
import { buildPendingOrder } from './storePaymentsCore.js';

const paidGroupOrder = (overrides = {}) => ({
  orderSource: 'online',
  total: 168,
  fulfilmentStatus: 'Preparing',
  groupOrder: { id: 'group-1', rewardPercent: 5 },
  payment: { status: 'paid', refundStatus: 'none', refundedAmountMinor: 0 },
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
