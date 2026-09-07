import assert from 'node:assert/strict';
import test from 'node:test';
import type { CostingInvoice } from '../costing/types';
import type { StoreOrder } from '../store/types';
import type { BusinessSale } from './types';
import { calculateBusinessAccounting, getStoreOrderNetSale } from './accounting';

const invoice = (overrides: Partial<CostingInvoice> = {}): CostingInvoice => ({ id: 'invoice', fileName: 'a.pdf', fileUrl: '', fileType: 'PDF', uploadDate: '2026-09-05T00:00:00Z', status: 'Imported', processingStatus: 'Imported', approvedAt: '2026-09-05T00:00:00Z', invoiceDate: '2026-08-12', total: 40, extractedData: null, errorMessage: null, createdBy: 'u', workspaceId: 'w', size: 1, ...overrides });
const manual = (date: string, amount: number): BusinessSale => ({ id: date, date, amount, notes: '', createdAt: '', updatedAt: '', createdBy: 'u', workspaceId: 'w' });
const order = (overrides: Partial<StoreOrder> = {}): StoreOrder => ({ id: 'order', orderNumber: '1', storeId: 'w', workspaceId: 'w', orderSource: 'online', storeName: 'Store', currency: 'MYR', paymentMethodId: '', paymentMethodName: '', customerName: '', phone: '', pickupDate: '', pickupSession: '', pickupLocationId: '', pickupLocationName: '', pickupLocationAddress: '', pickupLocationNotes: '', notes: '', items: [], itemCount: 0, total: 100, fulfilmentStatus: 'Completed', fulfilmentUpdatedAt: '', fulfilmentUpdatedBy: '', completedAt: '2026-08-15T10:00:00Z', cancelledAt: '', cancelledBy: '', cancellationReason: '', status: 'Paid', payment: { provider: '', providerMode: 'manual', status: 'paid', amountMinor: 10000, currency: 'MYR', providerPaymentId: '', providerTransactionId: '', providerPaymentMethod: '', checkoutAccessTokenHash: '', failureCode: '', refundStatus: 'none', refundedAmountMinor: 0, refundFailureCode: '', receiptPath: '', receiptFileName: '', receiptUploadedAt: '', reviewedAt: '', reviewedBy: '', createdAt: '', updatedAt: '' }, createdAt: '', updatedAt: '', ...overrides });

test('uses invoice business dates for ranges, rather than upload dates', () => {
  const result = calculateBusinessAccounting({ from: '2026-08-01', to: '2026-08-31', invoices: [invoice()], manualSales: [], storeOrders: [], timeZone: 'Asia/Kuala_Lumpur' });
  assert.equal(result.totalPurchases, 40);
  assert.equal(result.purchaseRecordCount, 1);
});

test('unifies manual and completed Store sales without creating finance documents', () => {
  const result = calculateBusinessAccounting({ from: '2026-08-01', to: '2026-08-31', invoices: [], manualSales: [manual('2026-08-15', 25)], storeOrders: [order()], timeZone: 'Asia/Kuala_Lumpur' });
  assert.equal(result.totalSales, 125);
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
