export const WEEKLY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const isWeeklyMealPlan = product => product?.productType === 'weekly_meal_plan';

export const getWeeklyDates = monday => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return [];
  const start = new Date(`${monday}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== monday || start.getUTCDay() !== 1) return [];
  return WEEKLY_DAYS.map((_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
};

export const WEEK_SLOTS = ['week1', 'week2', 'week3', 'week4'];
export const hasRotationMenu = plan => plan?.weeklyMenuVersion === 3;
export const hasDatedMenu = plan => plan?.weeklyWeeks !== undefined || hasRotationMenu(plan);
export const rotationWeeks = plan => WEEK_SLOTS.filter(slot => plan?.rotationWeeks?.[slot]).map(slot => plan.rotationWeeks[slot]);
export const validCalendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const isHealthyLunchBlocked = (plan, date) => hasRotationMenu(plan) && plan.healthyLunchBlockedDates?.includes(date);
export const isHealthyLunchWeekBlocked = (plan, monday) => hasRotationMenu(plan) && getWeeklyDates(monday).some(date => isHealthyLunchBlocked(plan, date));
export const rotationWeekForMonday = (plan, monday) => {
  if (!hasRotationMenu(plan) || getWeeklyDates(monday).length !== 5 || getWeeklyDates(plan.rotationStartMonday).length !== 5) return undefined;
  const elapsed = (Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${plan.rotationStartMonday}T00:00:00Z`)) / 604800000;
  const weeks = rotationWeeks(plan);
  return elapsed >= 0 && Number.isInteger(elapsed) && weeks.length ? weeks[elapsed % weeks.length] : undefined;
};
export const datedWeeks = plan => Object.values(plan?.weeklyWeeks || {}).sort((a, b) => a.startMonday.localeCompare(b.startMonday));
export const resolveWeeklyMeals = (plan, monday) => hasRotationMenu(plan)
  ? rotationWeekForMonday(plan, monday)?.meals
  : plan.weeklyWeeks !== undefined ? datedWeeks(plan).find(week => week.startMonday === monday)?.meals : plan.weeklyMeals;

const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
export const validMealOptionGroups = groups => groups === undefined || (Array.isArray(groups)
  && groups.length <= 20 && new Set(groups.map(group => group?.id)).size === groups.length
  && groups.every(group => group && Object.keys(group).every(key => ['id', 'name', 'type', 'required', 'selection', 'options'].includes(key))
    && text(group.id) && text(group.name) && ['choose', 'add_side', 'exchange'].includes(group.type)
    && typeof group.required === 'boolean' && ['single', 'multi'].includes(group.selection)
    && Array.isArray(group.options) && group.options.length <= 50
    && new Set(group.options.map(option => option?.id)).size === group.options.length
    && (!group.required || group.options.some(option => option?.active !== false))
    && group.options.every(option => option && Object.keys(option).every(key => ['id', 'name', 'priceAdjustmentMinor', 'active'].includes(key))
      && text(option.id) && text(option.name) && Number.isSafeInteger(option.priceAdjustmentMinor)
      && option.priceAdjustmentMinor >= 0 && option.priceAdjustmentMinor <= 10000000
      && (option.active === undefined || typeof option.active === 'boolean'))));


// Embedded meals are catalogue values, never separate Product documents.
export const hasEmbeddedMenu = plan => plan?.weeklyMenuVersion === 2 || hasRotationMenu(plan);
export const validEmbeddedMeal = meal => meal && typeof meal === 'object' && !Array.isArray(meal)
  && Object.keys(meal).every(key => ['photoUrl', 'name', 'price', 'calories', 'description', 'recipeId', 'optionGroups'].includes(key))
  && (meal.recipeId === undefined && !Object.hasOwn(meal, 'recipeId') || (typeof meal.recipeId === 'string' && Boolean(meal.recipeId.trim())))
  && typeof meal.photoUrl === 'string' && Boolean(meal.photoUrl.trim())
  && typeof meal.name === 'string' && Boolean(meal.name.trim()) && meal.name.length <= 160
  && Number.isFinite(meal.price) && meal.price >= 0
  && validMealOptionGroups(meal.optionGroups)
  && (meal.calories === undefined || (Number.isInteger(meal.calories) && meal.calories >= 0))
  && (meal.description === undefined || (typeof meal.description === 'string' && meal.description.length <= 1200));

export const resolvePlanMeal = (plan, products, monday, day) => {
  const value = resolveWeeklyMeals(plan, monday)?.[day];
  if (!hasEmbeddedMenu(plan)) return products.find(product => product.id === value);
  if (!validEmbeddedMeal(value)) return undefined;
  return { ...value, id: plan.id, storeId: plan.storeId, workspaceId: plan.workspaceId,
    productType: 'single', available: plan.available, availableDay: day, optionGroupIds: [] };
};
export const resolveHealthyLunchDay = (plan, products, date) => {
  if (hasRotationMenu(plan)) {
    if (!validCalendarDate(date) || isHealthyLunchBlocked(plan, date)) return undefined;
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day < 1 || day > 5) return undefined;
    const monday = new Date(Date.parse(`${date}T00:00:00Z`) - (day - 1) * 86400000).toISOString().slice(0, 10);
    return resolvePlanMeal(plan, products, monday, WEEKLY_DAYS[day - 1]);
  }
  const week = datedWeeks(plan).find(week => getWeeklyDates(week.startMonday).includes(date));
  if (!week) return undefined;
  return resolvePlanMeal(plan, products, week.startMonday, WEEKLY_DAYS[getWeeklyDates(week.startMonday).indexOf(date)]);
};
export const isFullWeekSelection = (selection, products) => {
  const plan = products.find(product => product.id === selection?.productId);
  return isWeeklyMealPlan(plan) && !(hasEmbeddedMenu(plan) && selection.healthyLunchDate !== undefined);
};
export const weeklyMealSnapshot = (meal, day, embedded = false) => ({
  day, productId: meal.id, productName: meal.name, photoUrl: meal.photoUrl || '',
  ...(embedded ? { price: meal.price, ...(meal.calories !== undefined ? { calories: meal.calories } : {}),
    ...(meal.description !== undefined ? { description: meal.description } : {}) } : {})
});

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
export const fullWeekDateStore = (store, plan) => hasDatedMenu(plan)
  ? { ...store, earliestPickupDays: 0, orderCutoffTime: null, ...(store.delivery ? { delivery: { ...store.delivery, fulfilment: { ...store.delivery.fulfilment, preOrder: { ...store.delivery.fulfilment?.preOrder, earliestDays: 0 } } } } : {}) } : store;
export const fullWeekServiceDatesAvailable = (store, monday, getDates, now = new Date()) => {
  const dates = getWeeklyDates(monday);
  const orderDays = new Set(store.orderDays || []);
  const unavailableDates = new Set(store.unavailableDates || []);
  return dates.length === 5 && getDates(store, now).includes(monday)
    && dates.every((date, index) => orderDays.has(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'][index]) && !unavailableDates.has(date));
};
export const weekRangeLabel = monday => {
  const dates = getWeeklyDates(monday);
  if (!dates.length) return '';
  const format = date => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return dates[0].slice(0, 7) === dates[4].slice(0, 7)
    ? `${Number(dates[0].slice(8))}–${format(dates[4])}` : `${format(dates[0])}–${format(dates[4])}`;
};

export const validateWeeklyStructure = product => {
  if (hasEmbeddedMenu(product) && Object.values(product.rotationWeeks || product.weeklyWeeks || {}).some(week => Object.values(week?.meals || {}).some(meal => meal?.optionGroups !== undefined && !validMealOptionGroups(meal.optionGroups)))) return 'Each meal option group needs a name, valid choices and prices, and an active option when required.';
  if (product.weeklyMenuVersion !== undefined && ![2, 3].includes(product.weeklyMenuVersion)) return 'Choose a supported Healthy Lunch menu format.';
  if (hasRotationMenu(product)) {
    if (product.weeklyWeeks !== undefined || product.weeklyMeals !== undefined || getWeeklyDates(product.rotationStartMonday).length !== 5) return 'Choose a valid rotation start Monday.';
    const weeks = product.rotationWeeks;
    if (!weeks || typeof weeks !== 'object' || Array.isArray(weeks) || !Object.keys(weeks).length || Object.keys(weeks).some(key => !WEEK_SLOTS.includes(key))) return 'Configure at least one rotation week.';
    if (Object.values(weeks).some(week => !week || Object.keys(week).length !== 1 || !Object.hasOwn(week, 'meals') || !week.meals || Object.keys(week.meals).length !== 5 || !WEEKLY_DAYS.every(day => validEmbeddedMeal(week.meals[day])))) return 'Each rotation week needs five meals.';
    const blocked = product.healthyLunchBlockedDates || [];
    if (!Array.isArray(blocked) || blocked.length > 120 || blocked.some(date => !validCalendarDate(date)) || new Set(blocked).size !== blocked.length || blocked.some((date, index) => index && blocked[index - 1] >= date)) return 'Choose unique, sorted Healthy Lunch blocked dates.';
    return '';
  }
  if (hasEmbeddedMenu(product) && product.weeklyWeeks === undefined) return 'Configure at least one dated week.';
  const validMeals = meals => meals && typeof meals === 'object' && !Array.isArray(meals)
    && Object.keys(meals).length === 5 && WEEKLY_DAYS.every(day => hasEmbeddedMenu(product) ? validEmbeddedMeal(meals[day]) : typeof meals[day] === 'string' && meals[day].trim());
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
  const meal = resolveHealthyLunchDay(plan, products, date);
  if (!meal || meal.id !== selection.productId) throw new Error('This meal does not match the Healthy Lunch date.');
  if (meal.storeId !== storeId || meal.workspaceId !== storeId || !meal.available || isWeeklyMealPlan(meal) || meal.optionGroupIds?.length) throw new Error('Choose an available Healthy Lunch meal.');
  return meal;
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
  if (monday && isHealthyLunchWeekBlocked(product, monday)) return 'This 5-Day Plan includes a blocked Healthy Lunch date.';
  const menus = monday ? [resolveWeeklyMeals(product, monday)] : hasRotationMenu(product) ? rotationWeeks(product).map(week => week.meals) : product.weeklyWeeks !== undefined ? datedWeeks(product).map(week => week.meals) : [product.weeklyMeals];
  if (menus.some(meals => !meals)) return 'Choose an available dated week.';
  for (const meals of menus) for (const day of WEEKLY_DAYS) {
    if (hasEmbeddedMenu(product)) continue;
    const meal = products.find(candidate => candidate.id === meals[day]);
    if (!meal || meal.id === product.id || meal.storeId !== storeId || meal.workspaceId !== storeId
      || (meal.productType ?? 'single') !== 'single' || meal.available !== true || (meal.optionGroupIds || []).length) return `Choose an available ${day} Single Product from this Store with no options.`;
  }
  return '';
};

export const weeklyCartError = (selections, products) => {
  const plans = selections.filter(selection => isFullWeekSelection(selection, products));
  if (!plans.length) return '';
  if (plans.length !== 1 || selections.length !== 1 || plans[0].setId || (plans[0].selectedOptions || []).length
    || (plans[0].selectedSetItems || []).length) return 'A Weekly Meal Plan must be purchased alone, without Sets or options.';
  return '';
};

// Reuse the existing Store date window, blocked dates and pickup time slots.
export const getWeeklyPickupTimes = (store, monday, getDates, getTimes, now = new Date(), plan) => {
  const dates = getWeeklyDates(monday);
  const validDates = getDates(store, now);
  if (hasDatedMenu(plan) ? !fullWeekServiceDatesAvailable(store, monday, getDates, now)
    : dates.length !== 5 || dates.some(date => !validDates.includes(date))) return [];
  return getTimes(store, monday, now).filter(time => dates.every(date => getTimes(store, date, now).includes(time)));
};

export const buildWeeklyOrderDetails = ({ store, draft, products, groupOrder, now, getDates, getTimes }) => {
  const error = weeklyCartError(draft.selections, products);
  if (error) throw new Error(error);
  const selection = draft.selections[0];
  const plan = products.find(product => product.id === selection?.productId);
  if (!isFullWeekSelection(selection, products)) return null;
  if (hasDatedMenu(plan)) throw new Error('Choose the complete dated 5-Day Plan schedule.');
  if (draft.fulfilmentMethod === 'delivery' || draft.deliverySnapshot || groupOrder || draft.groupShareCode) throw new Error('Weekly Meal Plans are pickup-only and cannot join a Group Order.');
  const storeId = store.workspaceId || store.id;
  if (plan.storeId !== storeId || plan.workspaceId !== storeId) throw new Error('This Weekly Meal Plan belongs to another Store.');
  const invalid = validateWeeklyMealPlan(plan, products, storeId);
  if (invalid) throw new Error(invalid);
  const selectedMeals = resolveWeeklyMeals(plan, draft.pickupDate);
  if (!selectedMeals || (hasDatedMenu(plan) && (!isDatedWeekOpen(store, draft.pickupDate, now) || isHealthyLunchWeekBlocked(plan, draft.pickupDate)))) throw new Error('This 5-Day Plan is closed or unavailable.');
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
