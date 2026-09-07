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
  assert.match(serviceSource, /getCompletedWorkspaceOrdersForBusinessDate/);
  assert.match(serviceSource, /where\('workspaceId', '==', workspaceId\)/);
  assert.match(serviceSource, /where\('fulfilmentStatus', '==', 'Completed'\)/);
  assert.match(serviceSource, /where\('completedAt', '>=', Timestamp\.fromDate\(start\)\)/);
  assert.match(serviceSource, /limit\(STORE_ORDER_DATE_QUERY_LIMIT\)/);
  const indexes = JSON.parse(readFileSync(new URL('../../../firestore.indexes.json', import.meta.url), 'utf8')) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }> };
  assert.equal(indexes.indexes.some(index => (
    index.collectionGroup === 'storeOrders'
    && index.fields.map(field => field.fieldPath).join(',') === 'workspaceId,fulfilmentStatus,completedAt'
  )), true);
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
  for (const label of ['Today', 'This Week', 'This Month', 'Last Month', 'Custom']) {
    assert.match(dashboardSource, new RegExp(`label: '${label}'`));
  }
  assert.match(dashboardSource, /type="date" value=\{customFrom\}/);
  assert.match(dashboardSource, /type="date" value=\{customTo\}/);
  assert.match(serviceSource, /this\.getAccountingReport\(userId, workspaceId, range\.from, range\.to, timeZone\)/);
});
