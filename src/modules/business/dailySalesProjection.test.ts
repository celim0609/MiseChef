import assert from 'node:assert/strict';
import test from 'node:test';
import { projectDailyDeliveries, projectDailySales, projectOrderSalesRecords, type DailySalesOrder } from './dailySalesProjection';

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

const scheduled = (): DailySalesOrder => ({
  id: 'scheduled',
  total: 29.01,
  items: [
    { productId: 'meal', quantity: 1, lineTotal: 20 },
    { productId: 'set', quantity: 1, lineTotal: 14.01 },
    { productId: 'gift', quantity: 2, lineTotal: 0 }
  ],
  totals: { discountedMerchandiseTotal: 24.01, deliveryFee: 5 },
  payment: { status: 'paid' },
  fulfilmentStatus: 'Completed',
  completedAt: '2026-11-13T09:00:00Z',
  fulfilments: [
    { id: 'first', date: '2026-11-09', method: 'delivery', allocations: [{ itemIndex: 0, quantity: 1 }] },
    { id: 'second', date: '2026-11-10', method: 'delivery', allocations: [{ itemIndex: 1, quantity: 1 }] },
    { id: 'third', date: '2026-11-11', method: 'pickup', allocations: [{ itemIndex: 2, quantity: 2 }] }
  ],
  fulfilmentCompletion: {
    first: { completedAt: '2026-11-09T06:00:00Z' },
    second: { completedAt: '2026-11-10T06:00:00Z' },
    third: { completedAt: '2026-11-11T06:00:00Z' }
  },
  promotionSnapshot: {
    version: 1,
    appliedPromotions: [],
    lineAdjustments: [
      { productId: 'meal', productName: 'Meal', quantity: 1, originalLineTotal: 20, discountAmount: 10, finalLineTotal: 10 },
      { productId: 'set', productName: 'Set', quantity: 1, originalLineTotal: 14.01, discountAmount: 0, finalLineTotal: 14.01 },
      { productId: 'gift', productName: 'Gift', quantity: 2, originalLineTotal: 0, discountAmount: 0, finalLineTotal: 0 }
    ]
  },
  delivery: {
    fulfilmentMethod: 'delivery',
    pricing: {
      customerDeliveryFee: 5,
      providerDeliveryFee: 8,
      days: [
        { date: '2026-11-09', customerDeliveryFee: 0, freeDeliveryApplied: true },
        { date: '2026-11-10', customerDeliveryFee: 5 }
      ]
    }
  },
  fulfilmentOperations: {
    first: { provider: 'grab', lifecycle: { state: 'completed' }, providerOrder: { orderId: 'grab-1', priceBreakdown: { total: '9.25' } } },
    second: { provider: 'private_driver', dispatch: { status: 'created' } }
  }
});

test('mixed products use their transaction discounts and free delivery stays on its scheduled day', () => {
  const order = scheduled();
  order.fulfilments!.push(order.fulfilments![0]);
  const entries = projectDailySales(order);
  assert.deepEqual(entries.map(entry => [entry.fulfilmentId, entry.itemQuantity, entry.merchandiseMinor, entry.deliveryMinor]), [
    ['first', 1, 1000, 0], ['second', 1, 1401, 500], ['third', 2, 0, 0]
  ]);
  assert.equal(new Set(entries.map(entry => entry.key)).size, 3);
  assert.equal(entries.reduce((sum, entry) => sum + entry.totalMinor, 0), 2901);
});

test('partial refunds reconcile to the sen and never allocate to free items or free delivery', () => {
  const order = scheduled();
  order.payment = { status: 'paid', refundStatus: 'partial', refundedAmountMinor: 701 };
  const entries = projectDailySales(order);
  assert.equal(entries.reduce((sum, entry) => sum + entry.refundMinor, 0), 701);
  assert.equal(entries.reduce((sum, entry) => sum + entry.totalMinor, 0), 2200);
  assert.equal(entries[0].deliveryMinor, 0);
  assert.equal(entries[2].refundMinor, 0);
  order.payment.refundStatus = 'refunded';
  assert.deepEqual(projectDailySales(order).map(entry => entry.totalMinor), [0, 0, 0]);
});

test('weekly meal options remain on their component day', () => {
  const order = weekly();
  order.total = 65;
  order.totals = undefined;
  order.items[0].lineTotal = 65;
  order.items[0].weeklyPlanSnapshot = { meals: [
    { day: 'tue', productId: 'meal', productName: 'Meal', photoUrl: '', optionSurchargeUnitMinor: 500 }
  ] };
  assert.deepEqual(projectDailySales(order).map(entry => entry.merchandiseMinor), [1200, 1700]);
});

test('historical records use charged totals and require a completion timestamp', () => {
  const order: DailySalesOrder = {
    id: 'legacy', total: 12.50, items: [], totals: { discountedMerchandiseTotal: 10 },
    payment: { status: 'paid' }, fulfilmentStatus: 'Completed', completedAt: '2026-11-12T00:30:00+08:00'
  };
  const [entry] = projectDailySales(order);
  assert.deepEqual([entry.merchandiseMinor, entry.deliveryMinor, entry.totalMinor], [1000, 250, 1250]);
  order.completedAt = '2026-11-12';
  assert.deepEqual(projectDailySales(order), []);
});

test('delivery operations preserve tracking, status and the difference between quoted and actual driver cost', () => {
  const order = scheduled();
  const [first, second] = projectDailyDeliveries(order);
  assert.deepEqual([first.provider, first.status, first.trackingReference, first.date], ['grab', 'completed', 'grab-1', '2026-11-09']);
  assert.deepEqual([first.customerFeeMinor, first.actualCostMinor, first.quotedCostMinor, first.subsidyMinor], [0, 925, 800, 925]);
  assert.deepEqual([second.provider, second.customerFeeMinor, second.actualCostMinor, second.quotedCostMinor], ['private_driver', 500, undefined, 800]);
});

test('external POS delivery uses the saved per-day fee and provider quote', () => {
  const order = scheduled();
  order.totals = undefined;
  order.posDeliveryPricing = {
    customerDeliveryFee: 5,
    providerDeliveryFee: 17,
    days: [
      { date: '2026-11-09', customerDeliveryFee: 0, providerDeliveryFee: 10 },
      { date: '2026-11-10', customerDeliveryFee: 5, providerDeliveryFee: 7 }
    ]
  };
  assert.deepEqual(projectDailySales(order).map(entry => entry.deliveryMinor), [0, 500, 0]);
  assert.deepEqual(projectDailyDeliveries(order).map(entry => entry.quotedCostMinor), [1000, 700]);
});

test('sales records preserve unrecognized rows and separate original charges from recognized amounts', () => {
  const order = scheduled();
  order.orderSource = 'pos';
  order.externalOrder = { source: 'walk_in' };
  order.paymentMethodId = 'cash_on_pickup';
  order.paymentMethodName = 'Cash';
  order.totals!.discountTotal = 10;
  order.payment = { status: 'paid', refundStatus: 'partial', refundedAmountMinor: 701 };
  const rows = projectOrderSalesRecords(order);
  assert.deepEqual(rows.map(row => [row.grossMinor, row.discountMinor, row.focQuantity]), [[2000, 1000, 0], [1901, 0, 0], [0, 0, 2]]);
  assert.equal(rows[0].scheduledDate, '2026-11-09');
  assert.equal(rows[0].completedAt, '2026-11-09T06:00:00Z');
  assert.equal(rows[0].source, 'Walk-in');
  assert.equal(rows[0].paymentMethod, 'Cash');
  assert.equal(rows.reduce((total, row) => total + row.totalMinor, 0), 2200);
  order.fulfilmentStatus = 'Cancelled';
  assert(projectOrderSalesRecords(order).every(row => row.fulfilmentStatus === 'Cancelled' && !row.recognized && row.totalMinor === 0));
  assert.deepEqual(projectDailySales(order), []);
});

test('late completion preserves its actual action timestamp and weekly meal snapshot name', () => {
  const order = weekly();
  order.weeklyFulfilments![0].date = '2026-11-09';
  order.weeklyCompletion!.mon!.completedAt = '2026-11-12T05:00:00Z';
  order.items[0].weeklyPlanSnapshot = { meals: [{ day: 'mon', productId: 'meal', productName: 'Monday set', photoUrl: '' }] };
  const rows = projectOrderSalesRecords(order);
  assert.deepEqual([rows[0].scheduledDate, rows[0].completedAt, rows[0].items[0].name, rows[0].totalMinor],
    ['2026-11-09', '2026-11-12T05:00:00Z', 'Monday set', 1200]);
  assert.equal(rows[2].recognized, false);
  assert.equal(rows[2].grossMinor, 1200);
});

test('FOC promotion quantity comes from saved terms and excludes paid add-ons', () => {
  const order = scheduled();
  order.items[0] = { productId: 'meal', productName: 'Meal', quantity: 3, lineTotal: 30, basePrice: 10 };
  order.fulfilments![0].allocations[0].quantity = 3;
  const promotion = order.promotionSnapshot!;
  promotion.lineAdjustments[0] = { ...promotion.lineAdjustments[0], quantity: 3, originalLineTotal: 30,
    discountAmount: 10, finalLineTotal: 20, promotionId: 'buy2' };
  promotion.appliedPromotions = [{ promotionId: 'buy2', name: 'Buy two get one', type: 'buy_x_get_y',
    terms: { buyQuantity: 2, getQuantity: 1 }, savings: 10 }];
  assert.equal(projectOrderSalesRecords(order)[0].focQuantity, 1);
  order.items[0].basePrice = 8;
  assert.equal(projectOrderSalesRecords(order)[0].focQuantity, 0);
});

test('delivery records use the saved time slot for same-date POS quotes and charges', () => {
  const date = '2026-11-13';
  const order: DailySalesOrder = {
    id: 'same-date-deliveries', total: 36, totals: { deliveryFee: 16 },
    items: [{ quantity: 1, lineTotal: 10 }, { quantity: 1, lineTotal: 10 }],
    payment: { status: 'paid' }, fulfilmentStatus: 'New', fulfilmentMethod: 'delivery',
    fulfilments: ['10:00', '12:00'].map((time, itemIndex) => ({
      id: `trip-${itemIndex}`, date, time, method: 'delivery', allocations: [{ itemIndex, quantity: 1 }],
    })),
    posDeliveryPricing: { days: [
      { date, time: '10:00', providerDeliveryFee: 6, customerDeliveryFee: 9 },
      { date, time: '12:00', providerDeliveryFee: 4, customerDeliveryFee: 7 },
    ] },
  };
  assert.deepEqual(projectDailyDeliveries(order).map(record => [record.customerFeeMinor, record.quotedCostMinor]),
    [[900, 600], [700, 400]]);
});
