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

  const isoParts = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dayFirstParts = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  const dateParts = isoParts
    ? { year: Number(isoParts[1]), month: Number(isoParts[2]), day: Number(isoParts[3]) }
    : dayFirstParts
      ? {
        year: dayFirstParts[3].length === 2 ? 2000 + Number(dayFirstParts[3]) : Number(dayFirstParts[3]),
        month: Number(dayFirstParts[2]),
        day: Number(dayFirstParts[1])
      }
      : null;
  const parsedDate = dateParts
    ? new Date(dateParts.year, dateParts.month - 1, dateParts.day)
    : new Date(normalized);
  if (dateParts && (
    parsedDate.getFullYear() !== dateParts.year
    || parsedDate.getMonth() !== dateParts.month - 1
    || parsedDate.getDate() !== dateParts.day
  )) return normalized;
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
