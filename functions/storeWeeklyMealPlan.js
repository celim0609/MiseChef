export const WEEKLY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const isWeeklyMealPlan = product => product?.productType === 'weekly_meal_plan';

export const getWeeklyDates = monday => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return [];
  const start = new Date(`${monday}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== monday || start.getUTCDay() !== 1) return [];
  return WEEKLY_DAYS.map((_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
};

// Weekly assignments define the meal's weekday within this plan. Standalone
// Available Day restrictions are still enforced for standalone cart lines.
export const buildWeeklyDeliverySchedule = (monday, time) => {
  const dates = getWeeklyDates(monday);
  if (dates.length !== 5 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a Monday and one delivery time for the whole weekly plan.');
  return dates.map(date => ({ date, time, itemIndexes: [0] }));
};

// The catalogue and checkout both enforce references; purchased meals are later
// read exclusively from the order snapshot, never from this mutable catalogue.
export const validateWeeklyMealPlan = (product, products, storeId) => {
  if (!isWeeklyMealPlan(product)) return '';
  if ((product.optionGroupIds || []).length || (product.availableDay ?? 'all') !== 'all') return 'Weekly plans cannot have options or an Available day restriction.';
  const meals = product.weeklyMeals;
  if (!meals || typeof meals !== 'object' || Array.isArray(meals) || Object.keys(meals).length !== 5
    || WEEKLY_DAYS.some(day => typeof meals[day] !== 'string' || !meals[day].trim())) return 'Choose one Single Product for each day, Monday to Friday.';
  for (const day of WEEKLY_DAYS) {
    const meal = products.find(candidate => candidate.id === meals[day]);
    if (!meal || meal.id === product.id || meal.storeId !== storeId || meal.workspaceId !== storeId
      || (meal.productType ?? 'single') !== 'single' || meal.available !== true || (meal.optionGroupIds || []).length) return `Choose an available ${day} Single Product from this Store with no options.`;
  }
  return '';
};

export const weeklyCartError = (selections, products) => {
  const plans = selections.filter(selection => isWeeklyMealPlan(products.find(product => product.id === selection.productId)));
  if (!plans.length) return '';
  if (plans.length !== 1 || selections.length !== 1 || plans[0].setId || (plans[0].selectedOptions || []).length
    || (plans[0].selectedSetItems || []).length) return 'A Weekly Meal Plan must be purchased alone, without Sets or options.';
  return '';
};

// Reuse the existing Store date window, blocked dates and pickup time slots.
export const getWeeklyPickupTimes = (store, monday, getDates, getTimes, now = new Date()) => {
  const dates = getWeeklyDates(monday);
  const validDates = getDates(store, now);
  if (dates.length !== 5 || dates.some(date => !validDates.includes(date))) return [];
  return getTimes(store, monday, now).filter(time => dates.every(date => getTimes(store, date, now).includes(time)));
};

export const buildWeeklyOrderDetails = ({ store, draft, products, groupOrder, now, getDates, getTimes }) => {
  const error = weeklyCartError(draft.selections, products);
  if (error) throw new Error(error);
  const selection = draft.selections[0];
  const plan = products.find(product => product.id === selection?.productId);
  if (!isWeeklyMealPlan(plan)) return null;
  if (draft.fulfilmentMethod === 'delivery' || draft.deliverySnapshot || groupOrder || draft.groupShareCode) throw new Error('Weekly Meal Plans are pickup-only and cannot join a Group Order.');
  const storeId = store.workspaceId || store.id;
  if (plan.storeId !== storeId || plan.workspaceId !== storeId) throw new Error('This Weekly Meal Plan belongs to another Store.');
  const invalid = validateWeeklyMealPlan(plan, products, storeId);
  if (invalid) throw new Error(invalid);
  if (!getWeeklyPickupTimes(store, draft.pickupDate, getDates, getTimes, now).includes(draft.pickupTime)) throw new Error('Choose a Monday and pickup time available for all five days.');
  const dates = getWeeklyDates(draft.pickupDate);
  const location = store.pickupLocations.find(candidate => candidate.id === draft.pickupLocationId);
  if (!location) throw new Error('Choose a valid pickup location.');
  const meals = WEEKLY_DAYS.map(day => {
    const meal = products.find(product => product.id === plan.weeklyMeals[day]);
    return { day, productId: meal.id, productName: meal.name, photoUrl: meal.photoUrl || '' };
  });
  return {
    weeklyPlanSnapshot: { meals },
    weeklyFulfilments: meals.map((meal, index) => ({
      ...meal, date: dates[index], pickupTime: draft.pickupTime,
      pickupLocationId: location.id, pickupLocationName: location.name,
      pickupLocationAddress: location.address || '', quantity: selection.quantity
    })),
    weeklyCompletion: {}
  };
};

// Public projections explicitly omit product IDs, operator IDs and payment data.
export const publicWeeklyFulfilments = order => Array.isArray(order.weeklyFulfilments)
  ? order.weeklyFulfilments.map(day => ({
    day: day.day, date: day.date, productName: day.productName, photoUrl: day.photoUrl,
    pickupTime: day.pickupTime, pickupLocationName: day.pickupLocationName,
    quantity: day.quantity, completed: Boolean(order.weeklyCompletion?.[day.day])
  })) : undefined;
