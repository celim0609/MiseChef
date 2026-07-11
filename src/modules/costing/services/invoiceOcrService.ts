import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { CostingInvoice, CostingInvoiceExtractedData } from '../types';

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const readNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getCallableErrorMessage = (err: unknown, fallbackMessage: string) => {
  const source = err && typeof err === 'object' ? err as Record<string, unknown> : {};
  const details = source.details && typeof source.details === 'object'
    ? source.details as Record<string, unknown>
    : {};
  const diagnostics = details.diagnostics && typeof details.diagnostics === 'object'
    ? details.diagnostics as Record<string, unknown>
    : {};
  const devMessage = [
    typeof source.message === 'string' ? source.message : '',
    typeof details.reason === 'string' ? `Reason: ${details.reason}` : '',
    typeof diagnostics.message === 'string' ? `Backend: ${diagnostics.message}` : '',
    typeof source.code === 'string' ? `Code: ${source.code}` : ''
  ].filter(Boolean).join(' | ');

  return import.meta.env.DEV && devMessage ? devMessage : fallbackMessage;
};

const normalizeExtractedData = (value: unknown): CostingInvoiceExtractedData => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawItems = Array.isArray(source.items) ? source.items : [];

  return {
    supplier: readString(source.supplier),
    invoiceNumber: readString(source.invoiceNumber),
    invoiceDate: readString(source.invoiceDate),
    currency: readString(source.currency),
    subtotal: readNumber(source.subtotal),
    gst: readNumber(source.gst),
    total: readNumber(source.total),
    items: rawItems.map(item => {
      const sourceItem = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        name: readString(sourceItem.name),
        quantity: readNumber(sourceItem.quantity),
        unit: readString(sourceItem.unit),
        unitPrice: readNumber(sourceItem.unitPrice),
        total: readNumber(sourceItem.total)
      };
    }).filter(item => item.name || item.quantity || item.unit || item.unitPrice || item.total)
  };
};

export const invoiceOcrService = {
  async extractInvoice(invoice: CostingInvoice): Promise<CostingInvoiceExtractedData> {
    if (!functions) {
      throw new Error('AI is temporarily unavailable. Please try again shortly.');
    }

    const parseInvoice = httpsCallable<
      { invoiceId: string; debug?: boolean },
      { invoice: CostingInvoiceExtractedData }
    >(functions, 'parseInvoiceToJson');

    try {
      const result = await parseInvoice({
        invoiceId: invoice.id,
        debug: import.meta.env.DEV
      });

      return normalizeExtractedData(result.data?.invoice);
    } catch (err) {
      throw new Error(getCallableErrorMessage(err, 'We could not read this invoice. Please try again.'));
    }
  }
};
