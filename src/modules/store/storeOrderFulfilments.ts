import { productAllowsFulfilmentDate } from '../../../functions/storeProductAvailability.js';
import type { CartSelection, StoreProduct } from './types';

export interface DraftFulfilment { date: string; time: string; itemIndexes: number[] }
export const groupFulfilmentSchedule = (entries: DraftFulfilment[]): DraftFulfilment[] => {
  const days = new Map<string, DraftFulfilment>();
  for (const entry of entries) {
    if (!entry.date || !entry.time) throw new Error('Choose a date and time for every scheduled day.');
    const existing = days.get(entry.date);
    if (existing && existing.time !== entry.time) throw new Error('Choose the same time for meals scheduled on the same day.');
    if (existing) existing.itemIndexes.push(...entry.itemIndexes);
    else days.set(entry.date, { ...entry, itemIndexes: [...entry.itemIndexes] });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
};
export const selectionAllowsDate = (selection: CartSelection, products: StoreProduct[], date: string) => selection.setId
  ? (selection.selectedSetItems || []).every(item => productAllowsFulfilmentDate(products.find(product => product.id === item.productId) || {}, date))
  : productAllowsFulfilmentDate(products.find(product => product.id === selection.productId) || {}, date);

export const usesScheduledCheckout = (lineCount: number, weekly: boolean, group: boolean, instant: boolean) =>
  !group && (weekly || lineCount > 1) && !instant;

export const commonPickupTimes = (dates: string[], getTimes: (date: string) => string[]) =>
  dates.length ? getTimes(dates[0]).filter(time => dates.every(date => getTimes(date).includes(time))) : [];

export const applySharedTime = (entries: DraftFulfilment[], time: string): DraftFulfilment[] =>
  entries.map(entry => ({ ...entry, time, itemIndexes: [...entry.itemIndexes] }));

export interface CheckoutScheduleRow { key: string; label: string; date: string; dates: string[] }
export const checkoutDayGroups = (rows: CheckoutScheduleRow[]) => {
  const groups = new Map<string, { date: string; rows: CheckoutScheduleRow[]; dates: string[] }>();
  for (const row of rows) {
    const group = groups.get(row.date);
    if (group) { group.rows.push(row); group.dates = group.dates.filter(date => row.dates.includes(date)); }
    else groups.set(row.date, { date: row.date, rows: [row], dates: [...row.dates] });
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const scheduleDateLabel = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).replace(',', '')
  : 'Choose an available day';
export const deliveryFeeLabel = (dayCount: number) => dayCount > 1 ? `Delivery fee for ${dayCount} days` : 'Delivery fee';
