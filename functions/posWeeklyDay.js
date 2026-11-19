import { datedWeeks, getWeeklyDates, hasRotationMenu, resolveHealthyLunchDay, validCalendarDate } from './storeWeeklyMealPlan.js';

const posStoreTimeZone = store => store.timeZone || (store.country === 'SG' ? 'Asia/Singapore' : 'Asia/Kuala_Lumpur');

export function posScheduleTime(store, date, time) {
  const wallClock = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wallClock)) return NaN;
  const formatter = new Intl.DateTimeFormat('en', { timeZone: posStoreTimeZone(store),
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const clockAt = value => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  };
  const estimate = wallClock + (wallClock - clockAt(wallClock));
  return clockAt(estimate) === wallClock ? estimate : NaN;
}

export function posStoreDate(store, now = new Date()) {
  const timeZone = posStoreTimeZone(store);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(entry => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function posStoreTime(store, now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: posStoreTimeZone(store),
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

export function posWeekMonday(date) {
  if (!validCalendarDate(date)) return '';
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}

export function resolvePosWeeklyDay(plan, products, date, today, { historical = date < today } = {}) {
  const monday = posWeekMonday(date);
  if (!monday) return { monday, error: 'Choose a valid service date.' };
  if (!getWeeklyDates(monday).includes(date)) return { monday, error: 'Weekly meals are served Monday through Friday.' };

  // A mutable rotation slot or a linked current product cannot establish a historical price.
  if (historical && (hasRotationMenu(plan) || plan.weeklyMenuVersion !== 2
    || !datedWeeks(plan).some(week => week.startMonday === monday))) {
    return { monday, error: 'No dated historical menu is configured for this week.' };
  }

  const meal = resolveHealthyLunchDay({ ...plan, healthyLunchBlockedDates: [] }, products, date);
  return meal ? { monday, meal } : { monday, error: 'No configured meal for this service date.' };
}

export function hasHistoricalWeeklyDay(selections, today, schedules = []) {
  return selections.some((selection, index) => {
    const date = schedules[index]?.date || selection?.healthyLunchDate;
    return selection?.healthyLunchDate && validCalendarDate(date) && date < today;
  });
}

// All Add Order products share this classification; a menu source date is not fulfilment.
export function hasHistoricalPosDate(input, today) {
  return (input.selections || []).some((selection, index) => {
    const date = input.lineSchedules?.[index]?.date || input.fulfilmentDate || selection?.healthyLunchDate;
    return validCalendarDate(date) && date < today;
  });
}

export function validateHistoricalPosCart(input, checkout, today) {
  if (!hasHistoricalPosDate(input, today)) throw new Error('Choose at least one past fulfilment date for historical audit.');
  for (const [index, selection] of input.selections.entries()) {
    const date = input.lineSchedules?.[index]?.date || input.fulfilmentDate || selection.healthyLunchDate;
    if (!validCalendarDate(date)) throw new Error('Choose a valid historical fulfilment date.');
    const product = checkout.products.find(product => product.id === selection.productId);
    if (!selection.healthyLunchDate) {
      if (product?.productType === 'weekly_meal_plan') throw new Error('Use Order by Day for historical meals; keep 5-Day Plans separate.');
      continue;
    }
    if (!validCalendarDate(selection.healthyLunchDate) || !selection.healthyLunchPlanId || selection.healthyLunchPlanId !== selection.productId)
      throw new Error('Choose a configured weekly menu source.');
    const plan = checkout.products.find(product => product.id === selection.healthyLunchPlanId
      && product.storeId === checkout.store.id && product.workspaceId === checkout.store.workspaceId);
    if (!plan || plan.productType !== 'weekly_meal_plan') throw new Error('This weekly menu is unavailable.');
    const { error } = resolvePosWeeklyDay(plan, checkout.products, selection.healthyLunchDate, today, { historical: true });
    if (error) throw new Error(error);
  }
}
