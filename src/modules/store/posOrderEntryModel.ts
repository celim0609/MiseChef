import { getWeeklyDates } from '../../../functions/storeWeeklyMealPlan.js';
import type { DeliveryDestination } from './services/deliveryService';
export type PosDestination = DeliveryDestination & { placeId?: string };
export type PosQuote = { id: string; expiresAt: string; customerDeliveryFee: number; providerDeliveryFee: number; currency: string; days: Array<{date:string;time:string;customerDeliveryFee:number;freeDeliveryApplied:boolean}> };
export function claimPosAdd(recent: Map<string, number>, key: string, now: number) {
  if (now - (recent.get(key) ?? -Infinity) < 350) return false;
  recent.set(key, now);
  return true;
}
export function posDeliveryDates(lines: Array<{date?:string;selection:{productId?:string;healthyLunchDate?:string}}>, products: Array<{id:string;productType?:string}>, defaultDate:string) {
  return [...new Set(lines.flatMap(line => products.find(p=>p.id===line.selection.productId)?.productType==='weekly_meal_plan' && !line.selection.healthyLunchDate ? getWeeklyDates(line.date || defaultDate) : [line.date || defaultDate]).filter(Boolean))].sort();
}
export const currentPosQuote = (quote: PosQuote | null, quoteKey:string, currentKey:string, now:number) => quoteKey === currentKey && quote && Date.parse(quote.expiresAt) > now + 5000 ? quote : null;

export function posInitialItemDate(product: {productType?: string} | undefined, date: string, selectedMealDate?: string) {
  if (selectedMealDate) return selectedMealDate;
  return product?.productType === 'weekly_meal_plan' && getWeeklyDates(date).length !== 5 ? '' : date;
}
