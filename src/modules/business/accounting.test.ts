import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CostingInvoice } from '../costing/types';
import type { StoreOrder } from '../store/types';
import type { BusinessSale } from './types';
import {
  calculateBusinessAccounting,
  createBusinessDashboardSummary,
  getBusinessDashboardPeriodRange,
  getStoreOrderNetSale
} from './accounting';

const invoice = (overrides: Partial<CostingInvoice> = {}): CostingInvoice => ({ id: 'invoice', fileName: 'a.pdf', fileUrl: '', fileType: 'PDF', uploadDate: '2026-09-05T00:00:00Z', status: 'Imported', processingStatus: 'Imported', approvedAt: '2026-09-05T00:00:00Z', invoiceDate: '2026-08-12', total: 40, extractedData: null, errorMessage: null, createdBy: 'u', workspaceId: 'w', size: 1, ...overrides });
const manual = (date: string, amount: number): BusinessSale => ({ id: date, date, amount, notes: '', createdAt: '', updatedAt: '', createdBy: 'u', workspaceId: 'w' });
const order = (overrides: Partial<StoreOrder> = {}): StoreOrder => ({ id: 'order', orderNumber: '1', storeId: 'store-7', workspaceId: 'workspace-42', orderSource: 'online', storeName: 'Store', currency: 'MYR', paymentMethodId: '', paymentMethodName: '', customerName: '', phone: '', pickupDate: '', pickupSession: '', pickupLocationId: '', pickupLocationName: '', pickupLocationAddress: '', pickupLocationNotes: '', notes: '', items: [], itemCount: 0, total: 100, fulfilmentStatus: 'Completed', fulfilmentUpdatedAt: '', fulfilmentUpdatedBy: '', completedAt: '2026-08-15T10:00:00Z', cancelledAt: '', cancelledBy: '', cancellationReason: '', status: 'Paid', payment: { provider: '', providerMode: 'manual', status: 'paid', amountMinor: 10000, currency: 'MYR', providerPaymentId: '', providerTransactionId: '', providerPaymentMethod: '', checkoutAccessTokenHash: '', failureCode: '', refundStatus: 'none', refundedAmountMinor: 0, refundFailureCode: '', receiptPath: '', receiptFileName: '', receiptUploadedAt: '', reviewedAt: '', reviewedBy: '', createdAt: '', updatedAt: '' }, createdAt: '', updatedAt: '', ...overrides });

test('uses invoice business dates for ranges, rather than upload dates', () => {
  const result = calculateBusinessAccounting({ from: '2026-08-01', to: '2026-08-31', invoices: [invoice()], manualSales: [], storeOrders: [], timeZone: 'Asia/Kuala_Lumpur' });
  assert.equal(result.totalPurchases, 40);
  assert.equal(result.purchaseRecordCount, 1);
});

test('unifies manual and completed Store sales without creating finance documents', () => {
  const result = calculateBusinessAccounting({ from: '2026-08-01', to: '2026-08-31', invoices: [], manualSales: [manual('2026-08-15', 25)], storeOrders: [order()], timeZone: 'Asia/Kuala_Lumpur' });
  assert.equal(result.totalSales, 125);
});

test('workspace-level Store accounting accepts a completed order whose Store id differs from its Workspace id', () => {
  const completedOrder = order();
  assert.notEqual(completedOrder.storeId, completedOrder.workspaceId);
  const result = calculateBusinessAccounting({ from: '2026-08-01', to: '2026-08-31', invoices: [], manualSales: [], storeOrders: [completedOrder], timeZone: 'Asia/Kuala_Lumpur' });
  assert.equal(result.totalSales, 100);
  const serviceSource = readFileSync(new URL('../store/services/storeOrderService.ts', import.meta.url), 'utf8');
  const businessQuery = serviceSource.split('async listWorkspaceOrdersForBusiness(')[1].split('subscribeTimeline(')[0];
  assert.match(businessQuery, /where\('workspaceId', '==', workspaceId\)/);
  assert.doesNotMatch(businessQuery, /completedAt|limit\(/);
});

test('subtracts partial and full refunds and excludes cancelled orders', () => {
  assert.equal(getStoreOrderNetSale(order({ payment: { ...order().payment, refundedAmountMinor: 2500, refundStatus: 'partial' } })), 75);
  assert.equal(getStoreOrderNetSale(order({ payment: { ...order().payment, refundedAmountMinor: 10000, refundStatus: 'refunded' } })), 0);
  assert.equal(getStoreOrderNetSale(order({ fulfilmentStatus: 'Cancelled', completedAt: '2026-08-15T10:00:00Z' })), 0);
});

test('report ranges include only sources within the selected dates', () => {
  const result = calculateBusinessAccounting({ from: '2026-08-10', to: '2026-08-15', invoices: [invoice(), invoice({ id: 'outside', invoiceDate: '2026-08-16', total: 99 })], manualSales: [manual('2026-08-15', 25), manual('2026-08-16', 99)], storeOrders: [order()], timeZone: 'Asia/Kuala_Lumpur' });
  assert.equal(result.totalSales, 125);
  assert.equal(result.totalPurchases, 40);
  assert.equal(result.netResult, 85);
});

test('Dashboard Today period resolves to the current workspace business date', () => {
  assert.deepEqual(getBusinessDashboardPeriodRange({ period: 'today', now: new Date('2026-08-19T12:00:00Z'), timeZone: 'Asia/Kuala_Lumpur' }), {
    from: '2026-08-19',
    to: '2026-08-19'
  });
});

test('Dashboard This Week period resolves from Monday through today', () => {
  assert.deepEqual(getBusinessDashboardPeriodRange({ period: 'this-week', now: new Date('2026-08-19T12:00:00Z'), timeZone: 'Asia/Kuala_Lumpur' }), {
    from: '2026-08-17',
    to: '2026-08-19'
  });
});

test('Dashboard This Month period resolves from month start through today', () => {
  assert.deepEqual(getBusinessDashboardPeriodRange({ period: 'this-month', now: new Date('2026-08-19T12:00:00Z'), timeZone: 'Asia/Kuala_Lumpur' }), {
    from: '2026-08-01',
    to: '2026-08-19'
  });
});

test('Dashboard Last Month period resolves to the complete previous calendar month', () => {
  assert.deepEqual(getBusinessDashboardPeriodRange({ period: 'last-month', now: new Date('2026-08-19T12:00:00Z'), timeZone: 'Asia/Kuala_Lumpur' }), {
    from: '2026-07-01',
    to: '2026-07-31'
  });
});

test('Dashboard Custom period uses the selected inclusive date range', () => {
  assert.deepEqual(getBusinessDashboardPeriodRange({
    period: 'custom',
    now: new Date('2026-08-19T12:00:00Z'),
    timeZone: 'Asia/Kuala_Lumpur',
    customFrom: '2026-08-01',
    customTo: '2026-08-31'
  }), { from: '2026-08-01', to: '2026-08-31' });
});

test('one selected period drives every Dashboard metric consistently', () => {
  const accounting = calculateBusinessAccounting({
    from: '2026-08-10',
    to: '2026-08-15',
    invoices: [
      invoice({ supplier: 'Range Supplier' }),
      invoice({ id: 'outside-invoice', invoiceDate: '2026-08-16', total: 99, supplier: 'Outside Supplier' })
    ],
    manualSales: [manual('2026-08-15', 25), manual('2026-08-16', 99)],
    storeOrders: [order(), order({ id: 'outside-order', completedAt: '2026-08-16T10:00:00Z', total: 99 })],
    timeZone: 'Asia/Kuala_Lumpur'
  });
  const summary = createBusinessDashboardSummary(accounting);

  assert.equal(summary.sales, 125);
  assert.equal(summary.purchases, 40);
  assert.equal(summary.netResult, 85);
  assert.equal(summary.purchaseCostPercentage, 32);
  assert.equal(summary.trend.length, 6);
  assert.equal(summary.trend.reduce((sum, day) => sum + day.sales, 0), summary.sales);
  assert.equal(summary.trend.reduce((sum, day) => sum + day.purchases, 0), summary.purchases);
  assert.deepEqual(summary.topSuppliers, [{ supplier: 'Range Supplier', totalSpend: 40, invoiceCount: 1 }]);
  assert.deepEqual(summary.alerts.map(alert => alert.id), ['purchase-cost-watch']);
  assert.deepEqual(summary.availability, { sales: true, purchases: true });
});

test('Dashboard exposes all period controls and passes one range to the shared accounting report', () => {
  const dashboardSource = readFileSync(new URL('./pages/Dashboard/index.tsx', import.meta.url), 'utf8');
  const serviceSource = readFileSync(new URL('./services/businessService.ts', import.meta.url), 'utf8');
  for (const label of ['Today', 'Yesterday', 'This Week', 'This Month', 'Last Month', 'Custom']) {
    assert.match(dashboardSource, new RegExp(`label: '${label}'`));
  }
  assert.match(dashboardSource, /type="date" value=\{customFrom\}/);
  assert.match(dashboardSource, /type="date" value=\{customTo\}/);
  assert.match(serviceSource, /this\.getAccountingReport\(userId, workspaceId, range\.from, range\.to, timeZone\)/);
});

test('soft-deleted completed orders retain net revenue and original refund accounting',()=>{
 const deleted=order({deletedAt:'2026-11-04T08:00:00Z'});
 assert.equal(getStoreOrderNetSale(deleted),100);
 assert.equal(getStoreOrderNetSale({...deleted,payment:{...deleted.payment,refundStatus:'partial',refundedAmountMinor:2500}}),75);
});

test('daily accounting uses local completion time, deduplicates orders and counts same-day fulfilments separately', () => {
  const partiallyCompleted = order({
    total: 60,
    fulfilmentStatus: 'Preparing',
    fulfilments: ['mon', 'tue', 'wed'].map(id => ({
      id, method: 'pickup', date: '', time: '', pickupLocationId: '', pickupLocationName: '',
      pickupLocationAddress: '', allocations: [{ itemIndex: 0, quantity: 1 }]
    })),
    fulfilmentCompletion: {
      mon: { completedAt: '2026-08-14T16:00:00Z', completedBy: 'owner' },
      tue: { completedAt: '2026-08-15T08:00:00Z', completedBy: 'owner' }
    }
  });
  const parameters = {
    from: '2026-08-15', to: '2026-08-15', invoices: [], manualSales: [],
    storeOrders: [partiallyCompleted, partiallyCompleted], timeZone: 'Asia/Kuala_Lumpur'
  };
  const before = calculateBusinessAccounting(parameters);
  assert.equal(before.totalSales, 40);
  assert.equal(before.salesRecordCount, 1);
  assert.equal(before.salesTrend[0].orderCount, 1);
  assert.equal(before.salesTrend[0].fulfilmentCount, 2);
  assert.equal(before.salesTrend[0].itemQuantity, 2);
  assert.deepEqual(before.salesEntries.map(entry => entry.fulfilmentId), ['mon', 'tue']);
  partiallyCompleted.fulfilmentStatus = 'Completed';
  partiallyCompleted.completedAt = '2026-08-16T08:00:00Z';
  partiallyCompleted.fulfilmentCompletion!.wed = { completedAt: partiallyCompleted.completedAt, completedBy: 'owner' };
  assert.deepEqual(calculateBusinessAccounting(parameters), before);
  assert.equal(calculateBusinessAccounting({ ...parameters, to: '2026-08-16' }).totalSales, 60);
});

test('Dashboard Yesterday uses the previous workspace date across a month boundary', () => {
  assert.deepEqual(getBusinessDashboardPeriodRange({ period: 'yesterday', now: new Date('2026-08-31T16:15:00Z'), timeZone: 'Asia/Kuala_Lumpur' }),
    { from: '2026-08-31', to: '2026-08-31' });
});

test('Dashboard reconciles to recognized records plus distinct legacy entries', () => {
  const dated = { from: '2026-08-15', to: '2026-08-15', timeZone: 'Asia/Kuala_Lumpur' };
  const sale = manual(dated.from, 1.23);
  const deliveryOrder = order({ fulfilmentMethod: 'delivery', pickupDate: dated.from, totals: {
    merchandiseSubtotal: 95, discountTotal: 0, discountedMerchandiseTotal: 95, deliveryFee: 5, grandTotal: 100, currency: 'MYR'
  } });
  const cancelled = order({ id: 'cancelled', fulfilmentStatus: 'Cancelled', pickupDate: dated.from });
  const report = calculateBusinessAccounting({ ...dated, invoices: [], manualSales: [sale, sale],
    storeOrders: [deliveryOrder, deliveryOrder, cancelled] });
  assert.equal(report.salesRecords.length, 2);
  assert.equal(report.salesEntries.length, 1);
  assert.equal(report.legacySales.length, 1);
  assert.equal(report.salesTrend[0].deliveryCount, 1);
  assert.equal(report.salesTrend[0].legacySales, 1.23);
  assert.equal(report.totalSales, 101.23);
  assert.equal(report.totalSales, (report.salesRecords.reduce((total, row) => total + row.totalMinor, 0) + 123) / 100);
});

test('Home monthly metrics use the same scoped period and accounting as Sales Records', () => {
  const home = readFileSync(new URL('../../components/HomeTab.tsx', import.meta.url), 'utf8');
  const ownerService = readFileSync(new URL('../../services/dashboardService.ts', import.meta.url), 'utf8');
  const salesPage = readFileSync(new URL('./pages/Sales/index.tsx', import.meta.url), 'utf8');
  const businessService = readFileSync(new URL('./services/businessService.ts', import.meta.url), 'utf8');

  assert.match(home, /loadOwnerDashboard\(userId, activeWorkspaceId, region\.timeZone\)/);
  assert.match(home, /monthSales = monthlySummary\?\.sales/);
  assert.match(home, /purchaseRatio = monthlySummary\?\.purchaseCostPercentage/);
  assert.match(home, /monthlySummary\.availability\.purchases \|\| monthSales <= 0/);
  assert.match(home, /purchaseRatio === null\s*\? \{ value: 'No sales yet'/);
  assert.match(ownerService, /getBusinessDashboardPeriodRange\(\{ period: 'this-month', now: new Date\(\), timeZone \}\)/);
  assert.match(ownerService, /getDashboardSummary\(userId, workspaceId, timeZone, range\)/);
  assert.match(salesPage, /period: 'this-month', now: new Date\(\), timeZone: region\.timeZone/);
  assert.match(salesPage, /getSalesReport\(workspace, validRange, region\.timeZone\)/);
  assert.match(businessService, /calculateBusinessAccounting\(\{ from, to, invoices: \[\], manualSales, storeOrders, timeZone \}\)/);
  assert.match(businessService, /calculateBusinessAccounting\(\{ from, to, invoices, manualSales, storeOrders, timeZone \}\)/);
});

test('month-to-date purchase ratio reconciles to recognized sales and legacy sales', () => {
  const timeZone = 'Asia/Kuala_Lumpur';
  const range = getBusinessDashboardPeriodRange({ period: 'this-month', now: new Date('2026-11-14T16:15:00Z'), timeZone })!;
  assert.deepEqual(range, { from: '2026-11-01', to: '2026-11-15' });
  const completedAt = '2026-11-14T16:00:00Z';
  const store = order({ id: 'store', total: 232.12, completedAt,
    totals: { merchandiseSubtotal: 246.10, discountTotal: 13.98, discountedMerchandiseTotal: 232.12, deliveryFee: 0, grandTotal: 232.12, currency: 'MYR' }
  });
  store.payment.refundStatus = 'partial';
  store.payment.refundedAmountMinor = 1000;
  const pos = order({ id: 'pos', orderSource: 'pos', total: 732.60, completedAt });
  const walkIn = order({ id: 'walk-in', orderSource: 'pos', externalOrder: { source: 'walk_in' }, total: 45, completedAt });
  const weekly = order({
    id: 'weekly', total: 100,
    weeklyFulfilments: (['mon', 'tue'] as const).map(day => ({
      day, date: '2026-11-15', productId: 'meal', productName: 'Meal', photoUrl: '',
      pickupTime: '', pickupLocationId: '', pickupLocationName: '', pickupLocationAddress: '', quantity: 1
    })),
    weeklyCompletion: {
      mon: { completedAt, completedBy: 'owner' },
      tue: { completedAt: '2026-11-15T16:00:00Z', completedBy: 'owner' }
    }
  });
  const inputs = { ...range, timeZone,
    manualSales: [manual('2026-11-04', 86), manual('2026-11-16', 100)],
    storeOrders: [store, pos, walkIn, weekly, order({ id: 'future', completedAt: '2026-11-15T16:00:00Z' })]
  };
  const invoices = [
    invoice({ invoiceDate: '2026-11-11', total: 462.15 }),
    invoice({ id: 'old-date', invoiceDate: '2020-11-09', total: 48.05 }),
    invoice({ id: 'future', invoiceDate: '2026-11-16', total: 50 }),
    invoice({ id: 'pending', invoiceDate: '2026-11-11', processingStatus: 'Processed', total: 100 })
  ];

  const salesRecords = calculateBusinessAccounting({ ...inputs, invoices: [] });
  const home = createBusinessDashboardSummary(calculateBusinessAccounting({ ...inputs, invoices }));
  assert.deepEqual(salesRecords.salesEntries.map(entry => entry.source).sort(), ['POS', 'Store', 'Store', 'Walk-in']);
  assert.deepEqual(salesRecords.salesEntries.filter(entry => entry.orderId === 'weekly').map(entry => entry.fulfilmentId), ['mon']);
  assert.equal(salesRecords.totalSales, 1135.72);
  assert.equal(home.sales, salesRecords.totalSales);
  assert.equal(home.purchases, 462.15);
  assert.equal(home.purchaseCostPercentage?.toFixed(1), '40.7');

  const noSales = createBusinessDashboardSummary(calculateBusinessAccounting({ ...inputs, invoices, manualSales: [], storeOrders: [] }));
  assert.equal(noSales.purchases, 462.15);
  assert.equal(noSales.sales, 0);
  assert.equal(noSales.purchaseCostPercentage, null);

  const empty = createBusinessDashboardSummary(calculateBusinessAccounting({
    ...range, timeZone, invoices: [], manualSales: [], storeOrders: []
  }));
  assert.equal(empty.sales, 0);
  assert.equal(empty.purchaseCostPercentage, null);
});
