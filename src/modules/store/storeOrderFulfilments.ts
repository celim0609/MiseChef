import { productAllowsFulfilmentDate } from '../../../functions/storeProductAvailability.js';
import type { CartSelection, StoreProduct } from './types';

export interface DraftFulfilment { date: string; time: string; itemIndexes: number[] }
export const groupFulfilmentSchedule = (entries: DraftFulfilment[]): DraftFulfilment[] => {
  const days = new Map<string, DraftFulfilment>();
  for (const entry of entries) {
    if (!entry.date || !entry.time) throw new Error('Choose a date and time for every fulfilment.');
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
