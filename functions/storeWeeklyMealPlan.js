export const WEEKLY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const isWeeklyMealPlan = product => product?.productType === 'weekly_meal_plan';

export const getWeeklyDates = monday => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return [];
  const start = new Date(`${monday}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== monday || start.getUTCDay() !== 1) return [];
  return WEEKLY_DAYS.map((_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
};

export const WEEK_SLOTS = ['week1', 'week2', 'week3', 'week4'];
export const datedWeeks = plan => Object.values(plan?.weeklyWeeks || {}).sort((a, b) => a.startMonday.localeCompare(b.startMonday));
export const resolveWeeklyMeals = (plan, monday) => plan.weeklyWeeks !== undefined
  ? datedWeeks(plan).find(week => week.startMonday === monday)?.meals : plan.weeklyMeals;

// Compare Store-local calendar values, including seconds: equality is allowed
// with a configured cutoff; without one Monday 00:00 is already closed.
export const isDatedWeekOpen = (store, monday, now = new Date()) => {
  if (getWeeklyDates(monday).length !== 5) return false;
  const zone = store.timeZone || (store.country === 'SG' ? 'Asia/Singapore' : 'Asia/Kuala_Lumpur');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(now.getUTCMilliseconds()).padStart(3, '0')}`;
  const cutoff = store.orderCutoffTime;
  if (!cutoff) return local < `${monday}T00:00:00.000`;
  const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return local <= `${sunday}T${cutoff}:00.000`;
};

// Dated full weeks have their own closing rule. Keep blocked dates, Store days
// and maximum advance window, but never derive closing from earliest days.
export const fullWeekDateStore = (store, plan) => plan?.weeklyWeeks !== undefined
  ? { ...store, earliestPickupDays: 0, orderCutoffTime: null, ...(store.delivery ? { delivery: { ...store.delivery, fulfilment: { ...store.delivery.fulfilment, preOrder: { ...store.delivery.fulfilment?.preOrder, earliestDays: 0 } } } } : {}) } : store;
export const weekRangeLabel = monday => {
  const dates = getWeeklyDates(monday);
  if (!dates.length) return '';
  const format = date => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return dates[0].slice(0, 7) === dates[4].slice(0, 7)
    ? `${Number(dates[0].slice(8))}–${format(dates[4])}` : `${format(dates[0])}–${format(dates[4])}`;
};

export const validateWeeklyStructure = product => {
  const validMeals = meals => meals && typeof meals === 'object' && !Array.isArray(meals)
    && Object.keys(meals).length === 5 && WEEKLY_DAYS.every(day => typeof meals[day] === 'string' && meals[day].trim());
  if (product.weeklyWeeks === undefined) return validMeals(product.weeklyMeals) ? '' : 'Choose one Single Product for each day, Monday to Friday.';
  const weeks = product.weeklyWeeks;
  if (!weeks || typeof weeks !== 'object' || Array.isArray(weeks) || !Object.keys(weeks).length
    || Object.keys(weeks).some(key => !WEEK_SLOTS.includes(key))) return 'Configure at least one of the four weeks.';
  const starts = new Set();
  for (const week of Object.values(weeks)) {
    if (!week || Object.keys(week).some(key => !['startMonday', 'meals'].includes(key))
      || getWeeklyDates(week.startMonday).length !== 5 || starts.has(week.startMonday) || !validMeals(week.meals)) return 'Each week needs a distinct Monday and five meals.';
    starts.add(week.startMonday);
  }
  return '';
};

export const validateHealthyLunchDay = (selection, products, date, storeId) => {
  if (selection.healthyLunchPlanId === undefined && selection.healthyLunchDate === undefined) return;
  const plan = products.find(product => product.id === selection.healthyLunchPlanId);
  if (!isWeeklyMealPlan(plan) || !plan.available || plan.storeId !== storeId || plan.workspaceId !== storeId
    || selection.setId || selection.selectedOptions?.length || selection.selectedSetItems?.length
    || selection.healthyLunchDate !== date) throw new Error('Choose a valid Healthy Lunch date.');
  const meal = products.find(product => product.id === selection.productId);
  if (!meal || meal.storeId !== storeId || meal.workspaceId !== storeId || !meal.available || isWeeklyMealPlan(meal) || meal.optionGroupIds?.length) throw new Error('Choose an available Healthy Lunch meal.');
  const week = datedWeeks(plan).find(week => getWeeklyDates(week.startMonday).includes(date));
  const dayIndex = week ? getWeeklyDates(week.startMonday).indexOf(date) : -1;
  if (!week || week.meals[WEEKLY_DAYS[dayIndex]] !== selection.productId) throw new Error('This meal does not match the Healthy Lunch date.');
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
export const validateWeeklyMealPlan = (product, products, storeId, monday) => {
  if (!isWeeklyMealPlan(product)) return '';
  if ((product.optionGroupIds || []).length || (product.availableDay ?? 'all') !== 'all') return 'Weekly plans cannot have options or an Available day restriction.';
  const structureError = validateWeeklyStructure(product);
  if (structureError) return structureError;
  const menus = monday ? [resolveWeeklyMeals(product, monday)] : product.weeklyWeeks !== undefined ? datedWeeks(product).map(week => week.meals) : [product.weeklyMeals];
  if (menus.some(meals => !meals)) return 'Choose an available dated week.';
  for (const meals of menus) for (const day of WEEKLY_DAYS) {
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
  if (plan.weeklyWeeks !== undefined) throw new Error('Choose the complete dated 5-Day Plan schedule.');
  if (draft.fulfilmentMethod === 'delivery' || draft.deliverySnapshot || groupOrder || draft.groupShareCode) throw new Error('Weekly Meal Plans are pickup-only and cannot join a Group Order.');
  const storeId = store.workspaceId || store.id;
  if (plan.storeId !== storeId || plan.workspaceId !== storeId) throw new Error('This Weekly Meal Plan belongs to another Store.');
  const invalid = validateWeeklyMealPlan(plan, products, storeId);
  if (invalid) throw new Error(invalid);
  const selectedMeals = resolveWeeklyMeals(plan, draft.pickupDate);
  if (!selectedMeals || (plan.weeklyWeeks !== undefined && !isDatedWeekOpen(store, draft.pickupDate, now))) throw new Error('This 5-Day Plan is closed or unavailable.');
  if (!getWeeklyPickupTimes(fullWeekDateStore(store, plan), draft.pickupDate, getDates, getTimes, now).includes(draft.pickupTime)) throw new Error('Choose a Monday and pickup time available for all five days.');
  const dates = getWeeklyDates(draft.pickupDate);
  const location = store.pickupLocations.find(candidate => candidate.id === draft.pickupLocationId);
  if (!location) throw new Error('Choose a valid pickup location.');
  const meals = WEEKLY_DAYS.map(day => {
    const meal = products.find(product => product.id === selectedMeals[day]);
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
