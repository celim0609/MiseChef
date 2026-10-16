import { hasEmbeddedMenu, isFullWeekSelection, getWeeklyDates, resolveHealthyLunchDay, validMealOptionGroups } from './storeWeeklyMealPlan.js';

export { validMealOptionGroups };

export const snapshotMealOptions = (meal, serviceDate, choices = []) => {
  if (!validMealOptionGroups(meal.optionGroups) || !Array.isArray(choices)) throw new Error('Invalid meal options.');
  const groups = meal.optionGroups || [];
  if (choices.some(choice => !choice || choice.serviceDate !== serviceDate || !groups.some(group => group.id === choice.optionGroupId))) throw new Error('Choose options for the correct meal/date.');
  const selectedMealOptions = groups.flatMap(group => {
    const selected = choices.filter(choice => choice.optionGroupId === group.id);
    if (new Set(selected.map(choice => choice.optionId)).size !== selected.length) throw new Error('Duplicate meal option selection.');
    if ((group.required && selected.length === 0) || (group.selection === 'single' && selected.length > 1)) throw new Error(`Complete ${group.name} for ${serviceDate}.`);
    return selected.map(choice => {
      if (Object.hasOwn(choice, 'quantity')) throw new Error('Meal options do not support quantities.');
      const option = group.options.find(option => option.id === choice.optionId && option.active !== false);
      if (!option) throw new Error(`Choose an available ${group.name} option.`);
      return { optionGroupId: group.id, optionGroupName: group.name, optionGroupType: group.type,
        optionId: option.id, optionName: option.name, priceAdjustmentMinor: option.priceAdjustmentMinor, serviceDate };
    });
  });
  const optionSurchargeUnitMinor = selectedMealOptions.reduce((sum, option) => sum + option.priceAdjustmentMinor, 0);
  if (!Number.isSafeInteger(optionSurchargeUnitMinor)) throw new Error('Invalid option total.');
  return groups.length || choices.length ? { serviceDate, selectedMealOptions, optionSurchargeUnitMinor } : {};
};

// The caller supplies the authoritative scheduled Monday, never a client price.
export const resolveSelectionMealOptions = (selection, products, monday) => {
  const plan = products.find(product => product.id === (selection.healthyLunchPlanId || selection.productId));
  const choices = selection.selectedMealOptions === undefined ? [] : selection.selectedMealOptions;
  if (!Array.isArray(choices) || choices.length > 5000) throw new Error('Invalid meal option selections.');
  if (!hasEmbeddedMenu(plan)) {
    if (choices.length) throw new Error('Meal options require Healthy Lunch.');
    return [];
  }
  const dates = isFullWeekSelection(selection, products) ? getWeeklyDates(monday) : [selection.healthyLunchDate];
  if (!dates.length) {
    const meals = Object.values(plan.rotationWeeks || plan.weeklyWeeks || {}).flatMap(week => Object.values(week.meals || {}));
    if (choices.length || meals.some(meal => meal.optionGroups?.length)) throw new Error('Choose the service week for meal options.');
    return [];
  }
  if (choices.some(choice => !choice || !dates.includes(choice.serviceDate))) throw new Error('Meal option date does not match the service schedule.');
  return dates.map(serviceDate => {
    const meal = resolveHealthyLunchDay(plan, products, serviceDate);
    if (!meal) throw new Error('This meal does not match the Healthy Lunch date.');
    return snapshotMealOptions(meal, serviceDate, choices.filter(choice => choice.serviceDate === serviceDate));
  });
};

export const mealOptionSurcharge = snapshots => snapshots.reduce((sum, day) => sum + (day.optionSurchargeUnitMinor || 0), 0);
export const mergeMealOptionSnapshots = (snapshot, days) => ({ ...snapshot, meals: snapshot.meals.map((meal, index) => ({ ...meal, ...days[index] })) });

export const publicMealOptionSnapshot = day => day?.selectedMealOptions ? {
  serviceDate: day.serviceDate,
  optionSurchargeUnitMinor: day.optionSurchargeUnitMinor,
  selectedMealOptions: day.selectedMealOptions.map(option => ({
    optionGroupId: option.optionGroupId, optionGroupName: option.optionGroupName, optionGroupType: option.optionGroupType,
    optionId: option.optionId, optionName: option.optionName, priceAdjustmentMinor: option.priceAdjustmentMinor, serviceDate: option.serviceDate
  }))
} : {};

export const parseMealOptionPrice = value => {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return NaN;
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= 10000000 ? minor : NaN;
};
