import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CostingInvoice } from '../types';
import { formatInvoiceDate, getInvoiceDisplayName, getInvoiceSecondaryLabel } from './invoiceDisplay';

const invoice = (updates: Partial<CostingInvoice> = {}): CostingInvoice => ({
  id: 'invoice-1',
  fileName: 'image.jpg',
  fileUrl: 'https://example.test/image.jpg',
  fileType: 'Image',
  uploadDate: '2026-08-24T00:00:00.000Z',
  status: 'Pending',
  processingStatus: 'Pending',
  extractedData: null,
  errorMessage: null,
  createdBy: 'owner-1',
  workspaceId: 'workspace-1',
  size: 100,
  ...updates
});

describe('invoice display identity', () => {
  it('uses the uploaded filename while a Pending invoice has no OCR supplier', () => {
    assert.equal(getInvoiceDisplayName(invoice()), 'image.jpg');
    assert.equal(getInvoiceSecondaryLabel(invoice()), '');
  });

  it('uses the OCR supplier with invoice number and formatted invoice date', () => {
    const processed = invoice({
      processingStatus: 'Processed',
      status: 'Processed',
      supplier: 'Bake With Yen',
      invoiceNumber: 'INV-260824-0182',
      invoiceDate: '2026-08-24'
    });

    assert.equal(getInvoiceDisplayName(processed), 'Bake With Yen');
    assert.equal(getInvoiceSecondaryLabel(processed), 'INV-260824-0182 · 24 Aug 2026');
  });

  it('shows Supplier and date when the invoice number is unavailable', () => {
    const processed = invoice({ supplier: 'Bake With Yen', invoiceDate: '2026-08-24' });
    assert.equal(getInvoiceDisplayName(processed), 'Bake With Yen');
    assert.equal(getInvoiceSecondaryLabel(processed), '24 Aug 2026');
  });

  it('prefers a manually edited display name without changing OCR supplier metadata', () => {
    const processed = invoice({ displayName: 'BWY Ipoh', supplier: 'Bake With Yen' });
    assert.equal(getInvoiceDisplayName(processed), 'BWY Ipoh');
    assert.equal(processed.supplier, 'Bake With Yen');
    assert.equal(processed.fileName, 'image.jpg');
  });

  it('falls back to extracted OCR fields for legacy processed invoices', () => {
    const processed = invoice({
      extractedData: {
        supplier: 'Legacy Supplier',
        invoiceNumber: 'LEG-01',
        invoiceDate: '2026-01-09',
        currency: 'MYR',
        subtotal: 10,
        gst: 0,
        total: 10,
        items: []
      }
    });

    assert.equal(getInvoiceDisplayName(processed), 'Legacy Supplier');
    assert.equal(getInvoiceSecondaryLabel(processed), 'LEG-01 · 09 Jan 2026');
  });

  it('preserves an unparseable supplier date instead of hiding it', () => {
    assert.equal(formatInvoiceDate('date unavailable'), 'date unavailable');
  });

  it('normalizes common day-first OCR date formats', () => {
    assert.equal(formatInvoiceDate('14/08/2026'), '14 Aug 2026');
    assert.equal(formatInvoiceDate('15-08-26'), '15 Aug 2026');
  });
});
