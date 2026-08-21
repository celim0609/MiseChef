import type { CostingInvoice } from '../costing/types';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const padDatePart = (value: number) => String(value).padStart(2, '0');

const toValidatedDateKey = (year: number, month: number, day: number) => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return '';

  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
};

export const getBusinessDateKey = (date: Date, timeZone: string) => {
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const normalizeInvoiceDate = (value?: string | null, timeZone = 'UTC') => {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  const isoDate = trimmed.match(ISO_DATE_PATTERN);
  if (isoDate) return toValidatedDateKey(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));

  const dayFirstDate = trimmed.match(DAY_FIRST_DATE_PATTERN);
  if (dayFirstDate) return toValidatedDateKey(Number(dayFirstDate[3]), Number(dayFirstDate[2]), Number(dayFirstDate[1]));

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : getBusinessDateKey(parsed, timeZone);
};

export const isPurchaseKpiEligible = (invoice: CostingInvoice) => (
  invoice.processingStatus === 'Imported'
  && Boolean(invoice.approvedAt)
  && !invoice.errorMessage
);

export const getInvoiceKpiDate = (invoice: CostingInvoice, timeZone: string) => (
  normalizeInvoiceDate(invoice.invoiceDate, timeZone)
  || normalizeInvoiceDate(invoice.extractedData?.invoiceDate, timeZone)
  || normalizeInvoiceDate(invoice.processingCompletedAt, timeZone)
  || normalizeInvoiceDate(invoice.uploadDate, timeZone)
);

export const getInvoiceKpiTotal = (invoice: CostingInvoice) => {
  const total = Number(invoice.total ?? invoice.extractedData?.total ?? 0);
  return Number.isFinite(total) ? total : 0;
};

export const isSameBusinessDay = (value: string | null | undefined, target: Date, timeZone: string) => (
  normalizeInvoiceDate(value, timeZone) === getBusinessDateKey(target, timeZone)
);

export const isSameBusinessMonth = (value: string | null | undefined, target: Date, timeZone: string) => {
  const dateKey = normalizeInvoiceDate(value, timeZone);
  return Boolean(dateKey) && dateKey.slice(0, 7) === getBusinessDateKey(target, timeZone).slice(0, 7);
};

export const getBusinessMonthDateKeys = (today: Date, timeZone: string) => {
  const todayKey = getBusinessDateKey(today, timeZone);
  const [year, month, day] = todayKey.split('-').map(Number);
  if (!year || !month || !day) return [];

  return Array.from({ length: day }, (_, index) => `${year}-${padDatePart(month)}-${padDatePart(index + 1)}`);
};

export const getPurchaseCostPercentage = (purchases: number, sales: number) => (
  sales > 0 ? (purchases / sales) * 100 : null
);

export const formatPurchaseCostPercentage = (value: number | null) => (
  value === null ? 'No sales yet' : `${value.toFixed(1)}%`
);
