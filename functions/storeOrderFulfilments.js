import { productAllowsFulfilmentDate } from './storeProductAvailability.js';
import { isWeeklyMealPlan, WEEKLY_DAYS, getWeeklyDates, weeklyCartError, validateWeeklyMealPlan } from './storeWeeklyMealPlan.js';

// A schedule is server-canonical: exactly one fulfilment per calendar day.
// Quantities and financial lines are never duplicated into another order.
export const canonicalSchedule = draft => {
  if (draft.fulfilments === undefined) return null;
  if (!Array.isArray(draft.fulfilments) || !draft.fulfilments.length || draft.fulfilments.length > 50) throw new Error('Choose a valid fulfilment schedule.');
  const dates = new Set();
  return draft.fulfilments.map(entry => {
    if (!entry || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      || new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10) !== entry.date
      || typeof entry.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)
      || dates.has(entry.date) || !Array.isArray(entry.itemIndexes) || !entry.itemIndexes.length
      || entry.itemIndexes.some(index => !Number.isInteger(index) || index < 0)) throw new Error('Choose one valid date/time per fulfilment day.');
    dates.add(entry.date);
    return { date: entry.date, time: entry.time, itemIndexes: [...entry.itemIndexes].sort((a, b) => a - b) };
  }).sort((a, b) => a.date.localeCompare(b.date));
};

export const buildOrderFulfilments = ({ store, draft, products, groupOrder, getDates, getTimes, now = new Date() }) => {
  const schedule = canonicalSchedule(draft);
  if (!schedule) return null;
  if (groupOrder || draft.groupShareCode) throw new Error('Group Orders use their existing single-date schedule.');
  const selections = draft.selections || [];
  const error = weeklyCartError(selections, products);
  if (error) throw new Error(error);
  const plan = products.find(product => product.id === selections[0]?.productId);
  const weekly = isWeeklyMealPlan(plan);
  if (weekly) {
    const invalid = validateWeeklyMealPlan(plan, products, store.workspaceId || store.id);
    if (invalid) throw new Error(invalid);
    const dates = getWeeklyDates(schedule[0].date);
    if (schedule.length !== 5 || schedule.some((entry, index) => entry.date !== dates[index]
      || entry.itemIndexes.length !== 1 || entry.itemIndexes[0] !== 0)) throw new Error('Weekly Meal Plans require all five days starting Monday.');
  }
  const delivery = draft.fulfilmentMethod === 'delivery';
  if (!delivery && draft.deliverySnapshot) throw new Error('Pickup fulfilments cannot include a delivery snapshot.');
  if (delivery && draft.fulfilmentMode === 'instant') throw new Error('Multiple fulfilments require pre-order delivery.');
  const preOrder = store.delivery?.fulfilment?.preOrder;
  const dateStore = delivery ? { ...store, orderDays: preOrder?.orderDays ?? store.orderDays,
    earliestPickupDays: preOrder?.earliestDays ?? store.earliestPickupDays,
    maximumAdvanceDays: preOrder?.maximumAdvanceDays ?? store.maximumAdvanceDays,
    unavailableDates: preOrder?.unavailableDates ?? store.unavailableDates } : store;
  const dates = getDates(dateStore, now);
  const location = store.pickupLocations?.find(location => location.id === draft.pickupLocationId);
  if (!delivery && !location) throw new Error('Choose a valid pickup location.');
  const seen = new Set();
  const fulfilments = schedule.map((entry, dayIndex) => {
    if (!dates.includes(entry.date)) throw new Error('Choose an available fulfilment date.');
    if (delivery) {
      const hours = preOrder?.deliveryHours || { from: '00:00', to: '23:59' };
      if (preOrder?.enabled === false || entry.time < hours.from || entry.time > hours.to
        || Date.parse(`${entry.date}T${entry.time}:00+08:00`) <= now.getTime()) throw new Error('Choose a future delivery time within Store hours.');
    } else if (!getTimes(store, entry.date, now).includes(entry.time)) throw new Error('Choose an available pickup time for every day.');
    const allocations = entry.itemIndexes.map(itemIndex => {
      const selection = selections[itemIndex];
      if (!selection || (!weekly && seen.has(itemIndex))) throw new Error('Each cart line must belong to exactly one fulfilment.');
      seen.add(itemIndex);
      const product = products.find(product => product.id === (weekly ? plan.weeklyMeals[WEEKLY_DAYS[dayIndex]] : selection.productId));
      if (selection.setId) {
        if ((selection.selectedSetItems || []).some(item => !productAllowsFulfilmentDate(products.find(product => product.id === item.productId) || {}, entry.date))) throw new Error('A Set meal does not match its Available day.');
      } else if (!product || !productAllowsFulfilmentDate(product, entry.date)) throw new Error('A meal does not match its Available day.');
      if (!Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 20) throw new Error('Choose a valid quantity.');
      return { itemIndex, quantity: selection.quantity, ...(weekly ? { componentDay: WEEKLY_DAYS[dayIndex] } : {}) };
    });
    return { id: `day_${entry.date.replaceAll('-', '')}`, method: delivery ? 'delivery' : 'pickup', date: entry.date, time: entry.time,
      pickupLocationId: delivery ? '' : location.id, pickupLocationName: delivery ? (store.delivery?.pickup?.name || '') : location.name,
      pickupLocationAddress: delivery ? (store.delivery?.pickup?.address || '') : (location.address || ''), allocations };
  });
  if (seen.size !== selections.length) throw new Error('Schedule every cart line exactly once.');
  const meals = weekly ? WEEKLY_DAYS.map(day => {
    const meal = products.find(product => product.id === plan.weeklyMeals[day]);
    return { day, productId: meal.id, productName: meal.name, photoUrl: meal.photoUrl || '' };
  }) : null;
  return { fulfilments, ...(meals ? { weeklyPlanSnapshot: { meals } } : {}) };
};

// Safe customer projection: no product IDs, operator IDs, provider costs or tokens.
export const publicOrderFulfilments = order => Array.isArray(order.fulfilments) ? order.fulfilments.map(entry => ({
  id: entry.id, method: entry.method, date: entry.date, time: entry.time,
  pickupLocationName: entry.pickupLocationName,
  completed: Boolean(order.fulfilmentCompletion?.[entry.id]),
  meals: entry.allocations.map(allocation => {
    const item = order.items?.[allocation.itemIndex];
    const meal = allocation.componentDay ? item?.weeklyPlanSnapshot?.meals?.find(meal => meal.day === allocation.componentDay) : item;
    return { productName: meal?.productName || '', quantity: allocation.quantity };
  })
})) : undefined;
