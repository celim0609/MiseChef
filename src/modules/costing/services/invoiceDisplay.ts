import type { CostingInvoice } from '../types';

const readInvoiceValue = (value?: string | null) => value?.trim() || '';

export const getInvoiceSupplierName = (invoice: CostingInvoice) => (
  readInvoiceValue(invoice.supplier) || readInvoiceValue(invoice.extractedData?.supplier)
);

export const getInvoiceDisplayName = (invoice: CostingInvoice) => (
  readInvoiceValue(invoice.displayName)
  || getInvoiceSupplierName(invoice)
  || invoice.fileName
);

export const formatInvoiceDate = (value?: string) => {
  const normalized = readInvoiceValue(value);
  if (!normalized) return '';

  const dateParts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(normalized);
  if (!Number.isFinite(parsedDate.getTime())) return normalized;

  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(parsedDate);
};

export const getInvoiceSecondaryLabel = (invoice: CostingInvoice) => {
  const invoiceNumber = readInvoiceValue(invoice.invoiceNumber) || readInvoiceValue(invoice.extractedData?.invoiceNumber);
  const invoiceDate = formatInvoiceDate(invoice.invoiceDate || invoice.extractedData?.invoiceDate);
  return [invoiceNumber, invoiceDate].filter(Boolean).join(' · ');
};
