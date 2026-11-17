import { datedWeeks, getWeeklyDates, hasRotationMenu, resolveHealthyLunchDay, validCalendarDate } from './storeWeeklyMealPlan.js';

export function posStoreDate(store, now = new Date()) {
  const timeZone = store.timeZone || (store.country === 'SG' ? 'Asia/Singapore' : 'Asia/Kuala_Lumpur');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(entry => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function posWeekMonday(date) {
  if (!validCalendarDate(date)) return '';
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}

export function resolvePosWeeklyDay(plan, products, date, today) {
  const monday = posWeekMonday(date);
  if (!monday) return { monday, error: 'Choose a valid service date.' };
  if (!getWeeklyDates(monday).includes(date)) return { monday, error: 'Weekly meals are served Monday through Friday.' };

  // A mutable rotation slot or a linked current product cannot establish a historical price.
  if (date < today && (hasRotationMenu(plan) || plan.weeklyMenuVersion !== 2
    || !datedWeeks(plan).some(week => week.startMonday === monday))) {
    return { monday, error: 'No dated historical menu is configured for this week.' };
  }

  const meal = resolveHealthyLunchDay({ ...plan, healthyLunchBlockedDates: [] }, products, date);
  return meal ? { monday, meal } : { monday, error: 'No configured meal for this service date.' };
}

export function hasHistoricalWeeklyDay(selections, today) {
  return selections.some(selection => validCalendarDate(selection?.healthyLunchDate)
    && selection.healthyLunchDate < today);
}

export function validateHistoricalWeeklyCart(input, checkout, today) {
  for (const selection of input.selections) {
    if (!validCalendarDate(selection.healthyLunchDate) || selection.healthyLunchDate >= today
      || !selection.healthyLunchPlanId || selection.healthyLunchPlanId !== selection.productId) {
      throw new Error('Use a separate cart for historical Order by Day meals.');
    }
    const plan = checkout.products.find(product => product.id === selection.healthyLunchPlanId
      && product.storeId === checkout.store.id && product.workspaceId === checkout.store.workspaceId);
    if (!plan || plan.productType !== 'weekly_meal_plan') throw new Error('This weekly menu is unavailable.');
    const { error } = resolvePosWeeklyDay(plan, checkout.products, selection.healthyLunchDate, today);
    if (error) throw new Error(error);
  }
}
