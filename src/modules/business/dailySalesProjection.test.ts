import assert from 'node:assert/strict';
import test from 'node:test';
import { projectDailySales, type DailySalesOrder } from './dailySalesProjection';

const weekly = (): DailySalesOrder => ({
  id: 'weekly-1', total: 60,
  items: [{ quantity: 1, lineTotal: 60 }],
  totals: { discountedMerchandiseTotal: 60, deliveryFee: 0 },
  payment: { status: 'paid', refundedAmountMinor: 0 },
  fulfilmentStatus: 'New',
  weeklyFulfilments: ['mon', 'tue', 'wed', 'thu', 'fri'].map(day => ({ day, quantity: 1 })),
  weeklyCompletion: { mon: { completedAt: '2026-11-09T10:00:00Z' }, tue: { completedAt: '2026-11-10T10:00:00Z' } }
});
test('weekly RM60 counts RM12 per completed day, not the full order', () => {
  const entries = projectDailySales(weekly());
  assert.deepEqual(entries.map(entry => entry.merchandiseMinor), [1200, 1200]);
  assert.equal(entries.reduce((sum, entry) => sum + entry.totalMinor, 0), 2400);
});
test('all five completed days sum to the order exactly once', () => {
  const order = weekly();
  order.weeklyCompletion = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map(day => [day, { completedAt: '2026-11-13T10:00:00Z' }]));
  assert.equal(projectDailySales(order).reduce((sum, entry) => sum + entry.totalMinor, 0), 6000);
});
test('paid but incomplete, unpaid and cancelled orders do not contribute', () => {
  const order = weekly();
  order.weeklyCompletion = {};
  assert.equal(projectDailySales(order).length, 0);
  order.payment.status = 'pending';
  assert.equal(projectDailySales(order).length, 0);
  order.payment.status = 'paid';
  order.fulfilmentStatus = 'Cancelled';
  assert.equal(projectDailySales(order).length, 0);
});
test('delivery revenue stays separate from merchandise', () => {
  const order = weekly();
  order.total = 70;
  order.totals = { discountedMerchandiseTotal: 60, deliveryFee: 10 };
  const entries = projectDailySales(order);
  assert.equal(entries[0].merchandiseMinor, 1200);
  assert.equal(entries[0].deliveryMinor, 200);
});
test('single completed walk-in records quantities and sale', () => {
  const order: DailySalesOrder = { id: 'walkin', total: 28.8, items: [{ quantity: 1, lineTotal: 13.9 }, { quantity: 1, lineTotal: 14.9 }], payment: { status: 'paid' }, fulfilmentStatus: 'Completed', completedAt: '2026-11-12T06:00:00Z' };
  assert.deepEqual(projectDailySales(order).map(entry => [entry.itemQuantity, entry.totalMinor]), [[2, 2880]]);
});
test('discounted multi-day allocations reconcile to the cent', () => {
  const order = weekly();
  order.total = 59.99;
  order.totals = { discountedMerchandiseTotal: 59.99, deliveryFee: 0 };
  order.weeklyCompletion = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map(day => [day, { completedAt: '2026-11-13T10:00:00Z' }]));
  assert.equal(projectDailySales(order).reduce((sum, entry) => sum + entry.totalMinor, 0), 5999);
});
