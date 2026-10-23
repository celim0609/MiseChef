import { WEEK_SLOTS, WEEKLY_DAYS, getWeeklyDates, rotationWeekForMonday } from './storeWeeklyMealPlan.js';

// Share stable catalogue slots; resolve service dates using current availability.
export function readWeeklyShare(product, search) {
  const params = new URLSearchParams(search);
  const slot = params.get('week');
  const week = WEEK_SLOTS.includes(slot) && (product?.rotationWeeks || product?.weeklyWeeks)?.[slot];
  if (product?.productType !== 'weekly_meal_plan' || !week) return null;
  const day = params.get('day');
  if (day !== null && !WEEKLY_DAYS.includes(day)) return null;
  return { slot, week, day, mode: day ? 'day' : 'week' };
}
export function weeklyShareUrl(baseUrl, slot, day) {
  const url = new URL(baseUrl);
  url.searchParams.set('week', slot);
  if (day) url.searchParams.set('day', day); else url.searchParams.delete('day');
  return url.toString();
}
export function weeklyShareChoice(product, share, weeks, dayDates) {
  if (!share) return null;
  const matches = monday => product.weeklyMenuVersion === 3
    ? rotationWeekForMonday(product, monday) === share.week : share.week.startMonday === monday;
  if (!share.day) return { mode: 'week', date: weeks.find(matches) || '' };
  const date = dayDates.find(date => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (WEEKLY_DAYS[weekday - 1] !== share.day) return false;
    const monday = new Date(Date.parse(`${date}T00:00:00Z`) - (weekday - 1) * 86400000).toISOString().slice(0, 10);
    return getWeeklyDates(monday).length === 5 && matches(monday);
  });
  return { mode: 'day', date: date || '' };
}
export function weeklySharePhoto(product, share) {
  if (!share) return '';
  // Preserve the uploaded source URL. Never generate a collage or crop.
  return share.day ? share.week.meals?.[share.day]?.photoUrl || ''
    : share.week.coverPhotoUrl || product.photoUrl || '';
}
