import { getWeeklyDates, validCalendarDate, resolveHealthyLunchDay } from './storeWeeklyMealPlan.js';

const storeZone = store => store.timeZone || (store.country === 'SG' ? 'Asia/Singapore' : 'Asia/Kuala_Lumpur');
export function posStoreDate(store, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: storeZone(store), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function posWeekMonday(date) {
  if (!validCalendarDate(date)) return '';
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}
// Only authenticated Owner/Manager Add Order callers may use this resolver.
// A retained source selects configured identity/price, never a past fulfilment price.
export function resolvePosAddOrderMeal(plan, products, sourceDate, fulfilmentDate, today) {
  const monday = posWeekMonday(sourceDate);
  if (!monday || !validCalendarDate(fulfilmentDate)) return { monday, error: 'Choose valid menu and fulfilment dates.' };
  if (fulfilmentDate < today) return { monday, error: 'Past fulfilment requires a separately approved historical workflow.' };
  if (!getWeeklyDates(monday).includes(sourceDate)) return { monday, error: 'Choose a configured Monday–Friday menu meal; fulfilment may be on another day.' };
  const meal = resolveHealthyLunchDay({ ...plan, healthyLunchBlockedDates: [] }, products, sourceDate);
  return meal ? { monday, meal } : { monday, error: 'No retained meal is configured for this menu source date.' };
}
