import assert from 'node:assert/strict';
import test from 'node:test';
import type { CostingInvoice } from '../costing/types';
import {
  formatPurchaseCostPercentage,
  getBusinessDateKey,
  getBusinessMonthDateKeys,
  getInvoiceKpiDate,
  getInvoiceKpiTotal,
  getPurchaseCostPercentage,
  isPurchaseKpiEligible,
  normalizeInvoiceDate
} from './purchaseKpi';

const createInvoice = (overrides: Partial<CostingInvoice> = {}): CostingInvoice => ({
  id: 'invoice-1',
  fileName: 'invoice.pdf',
  fileUrl: 'https://example.com/invoice.pdf',
  fileType: 'PDF',
  uploadDate: '2026-08-21T02:00:00.000Z',
  status: 'Imported',
  processingStatus: 'Imported',
  approvedAt: '2026-08-21T03:00:00.000Z',
  extractedData: null,
  errorMessage: null,
  createdBy: 'user-1',
  workspaceId: 'workspace-1',
  size: 1024,
  ...overrides
});

test('purchase KPIs count only approved Imported invoices', () => {
  assert.equal(isPurchaseKpiEligible(createInvoice()), true);
  assert.equal(isPurchaseKpiEligible(createInvoice({ processingStatus: 'Processed', status: 'Processed' })), false);
  assert.equal(isPurchaseKpiEligible(createInvoice({ approvedAt: null })), false);
  assert.equal(isPurchaseKpiEligible(createInvoice({ errorMessage: 'Import failed' })), false);
  assert.equal(isPurchaseKpiEligible(createInvoice({ processingStatus: 'Archived', status: 'Archived' })), false);
});

test('invoice dates normalize ISO and legacy day-first formats without persistence changes', () => {
  assert.equal(normalizeInvoiceDate('2026-08-21'), '2026-08-21');
  assert.equal(normalizeInvoiceDate('21/08/2026'), '2026-08-21');
  assert.equal(normalizeInvoiceDate('1/8/2026'), '2026-08-01');
  assert.equal(normalizeInvoiceDate('15-08-26'), '2026-08-15');
  assert.equal(normalizeInvoiceDate('5-8-26'), '2026-08-05');
  assert.equal(normalizeInvoiceDate('05/08/26'), '2026-08-05');
  assert.equal(normalizeInvoiceDate('5/8/26'), '2026-08-05');
  assert.equal(normalizeInvoiceDate('1/1/00'), '2000-01-01');
  assert.equal(normalizeInvoiceDate('31/02/2026'), '');
  assert.equal(normalizeInvoiceDate('31/02/26'), '');
  assert.equal(normalizeInvoiceDate('99-99-26'), '');

  const historicalInvoice = createInvoice({ invoiceDate: '21/08/2026', total: 128.5 });
  assert.equal(getInvoiceKpiDate(historicalInvoice, 'Asia/Kuala_Lumpur'), '2026-08-21');
  assert.equal(getInvoiceKpiTotal(historicalInvoice), 128.5);
  assert.equal(historicalInvoice.invoiceDate, '21/08/2026');
});

test('Malaysia and Singapore use the correct local current day at the UTC boundary', () => {
  const instant = new Date('2026-08-20T16:30:00.000Z');
  assert.equal(getBusinessDateKey(instant, 'Asia/Kuala_Lumpur'), '2026-08-21');
  assert.equal(getBusinessDateKey(instant, 'Asia/Singapore'), '2026-08-21');

  const malaysiaKeys = getBusinessMonthDateKeys(instant, 'Asia/Kuala_Lumpur');
  assert.equal(malaysiaKeys[0], '2026-08-01');
  assert.equal(malaysiaKeys.at(-1), '2026-08-21');
  assert.equal(malaysiaKeys.includes('2026-07-31'), false);
});

test('timestamp fallbacks are converted to the workspace business date', () => {
  const invoice = createInvoice({
    invoiceDate: '',
    processingCompletedAt: '2026-08-20T16:30:00.000Z'
  });
  assert.equal(getInvoiceKpiDate(invoice, 'Asia/Kuala_Lumpur'), '2026-08-21');
  assert.equal(getInvoiceKpiDate(invoice, 'Asia/Singapore'), '2026-08-21');
});

test('an invalid present invoice date is rejected instead of falling back to processing time', () => {
  const invoice = createInvoice({
    invoiceDate: '31/02/26',
    processingCompletedAt: '2026-08-20T16:30:00.000Z'
  });
  assert.equal(getInvoiceKpiDate(invoice, 'Asia/Kuala_Lumpur'), '');
});

test('purchase cost percentage is safe and clearly labelled when sales are zero', () => {
  assert.equal(getPurchaseCostPercentage(128.5, 0), null);
  assert.equal(formatPurchaseCostPercentage(getPurchaseCostPercentage(128.5, 0)), 'No sales yet');
  assert.equal(getPurchaseCostPercentage(128.5, 257), 50);
  assert.equal(formatPurchaseCostPercentage(50), '50.0%');
});
