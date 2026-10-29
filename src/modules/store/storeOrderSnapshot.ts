import type { MealOptionSnapshot, SelectedMealOption } from './types';
import type {
  StoreOrderItem,
  WeeklyFulfilment,
  WeeklyMealSnapshot,
  StoreOrderItemOption,
  StoreOrderSetSelection,
  StoreOrderSetSnapshot
} from './types';

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const readNumber = (value: unknown) => (
  Number.isFinite(Number(value)) ? Number(value) : 0
);

export const normalizeMealOptionSnapshot = (value: unknown): MealOptionSnapshot => {
  if (!value || typeof value !== 'object') return {};
  const day = value as Record<string, unknown>;
  if (!Array.isArray(day.selectedMealOptions)) return {};
  return { serviceDate: readString(day.serviceDate), optionSurchargeUnitMinor: readNumber(day.optionSurchargeUnitMinor),
    selectedMealOptions: day.selectedMealOptions.map((option): SelectedMealOption => ({
      optionGroupId: readString(option.optionGroupId), optionGroupName: readString(option.optionGroupName),
      optionGroupType: option.optionGroupType, optionId: readString(option.optionId), optionName: readString(option.optionName),
      priceAdjustmentMinor: readNumber(option.priceAdjustmentMinor), serviceDate: readString(option.serviceDate)
    })) };
};

const normalizeSelectedOption = (value: unknown): StoreOrderItemOption => {
  const option = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    groupId: readString(option.groupId),
    groupName: readString(option.groupName, 'Options'),
    optionId: readString(option.optionId),
    optionName: readString(option.optionName, 'Option'),
    priceAdjustment: readNumber(option.priceAdjustment),
    ...(Number.isInteger(option.quantity) && Number(option.quantity) > 1 ? { quantity: Number(option.quantity) } : {})
  };
};

const normalizeSetSelection = (value: unknown): StoreOrderSetSelection => {
  const selection = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const estimatedCost = Number(selection.estimatedCost);
  return {
    groupId: readString(selection.groupId),
    groupName: readString(selection.groupName, 'Selection'),
    productId: readString(selection.productId),
    productName: readString(selection.productName, 'Product'),
    standalonePrice: readNumber(selection.standalonePrice),
    ...(Number.isFinite(estimatedCost) ? { estimatedCost } : {}),
    priceAdjustment: readNumber(selection.priceAdjustment)
  };
};

const normalizeSetSnapshot = (value: unknown): StoreOrderSetSnapshot | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const snapshot = value as Record<string, unknown>;
  return {
    setId: readString(snapshot.setId),
    setName: readString(snapshot.setName, 'Set'),
    category: readString(snapshot.category),
    baseSetPrice: readNumber(snapshot.baseSetPrice),
    regularValue: readNumber(snapshot.regularValue),
    customerSaving: readNumber(snapshot.customerSaving),
    selectedGroups: Array.isArray(snapshot.selectedGroups)
      ? snapshot.selectedGroups.map(normalizeSetSelection)
      : []
  };
};

export const normalizeStoreOrderItem = (value: unknown): StoreOrderItem => {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const setSnapshot = normalizeSetSnapshot(item.setSnapshot);
  return {
    ...(readString(item.notes) ? { notes: readString(item.notes) } : {}),
    ...(item.itemType === 'custom' ? { itemType: 'custom' as const } : {}),
    productId: readString(item.productId),
    productName: readString(item.productName, 'Product'),
    photoUrl: readString(item.photoUrl),
    ...(item.calories !== undefined ? { calories: readNumber(item.calories) } : {}),
    ...(item.description !== undefined ? { description: readString(item.description) } : {}),
    quantity: Math.max(1, Math.round(readNumber(item.quantity))),
    basePrice: readNumber(item.basePrice),
    unitPrice: readNumber(item.unitPrice),
    lineTotal: readNumber(item.lineTotal),
    selectedOptions: Array.isArray(item.selectedOptions)
      ? item.selectedOptions.map(normalizeSelectedOption)
      : [],
    ...(setSnapshot ? { setSnapshot } : {}),
    ...(item.healthyLunchSnapshot && typeof item.healthyLunchSnapshot === 'object' ? { healthyLunchSnapshot: { planId: readString((item.healthyLunchSnapshot as { planId?: string }).planId), date: readString((item.healthyLunchSnapshot as { date?: string }).date), ...normalizeMealOptionSnapshot(item.healthyLunchSnapshot) } } : {}),
    ...(item.weeklyPriceSnapshot && typeof item.weeklyPriceSnapshot === 'object' ? { weeklyPriceSnapshot: structuredClone(item.weeklyPriceSnapshot) as StoreOrderItem['weeklyPriceSnapshot'] } : {}),
    ...(item.weeklyPlanSnapshot && typeof item.weeklyPlanSnapshot === 'object' && Array.isArray((item.weeklyPlanSnapshot as { meals?: unknown }).meals) ? { weeklyPlanSnapshot: { ...((item.weeklyPlanSnapshot as { startMonday?: string }).startMonday ? { startMonday: readString((item.weeklyPlanSnapshot as { startMonday?: string }).startMonday) } : {}), meals: ((item.weeklyPlanSnapshot as { meals: unknown[] }).meals).map(normalizeWeeklyMeal) } } : {})
  };
};

export const formatStoreOrderSetSelection = (
  selection: StoreOrderSetSelection,
  currency: string
) => `${selection.groupName}: ${selection.productName}${
  selection.priceAdjustment > 0
    ? ` (+${currency} ${selection.priceAdjustment.toFixed(2)})`
    : ''
}`;

const normalizeWeeklyMeal = (value: unknown): WeeklyMealSnapshot => {
  const meal = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { ...normalizeMealOptionSnapshot(meal), day: readString(meal.day) as WeeklyMealSnapshot['day'], productId: readString(meal.productId), productName: readString(meal.productName), photoUrl: readString(meal.photoUrl), ...(meal.price !== undefined ? { price: readNumber(meal.price) } : {}), ...(meal.calories !== undefined ? { calories: readNumber(meal.calories) } : {}), ...(meal.description !== undefined ? { description: readString(meal.description) } : {}) };
};

export const normalizeWeeklyFulfilments = (value: unknown): WeeklyFulfilment[] | undefined => Array.isArray(value) ? value.map(entry => ({
  ...normalizeWeeklyMeal(entry), date: readString(entry.date), pickupTime: readString(entry.pickupTime),
  pickupLocationId: readString(entry.pickupLocationId), pickupLocationName: readString(entry.pickupLocationName),
  pickupLocationAddress: readString(entry.pickupLocationAddress), quantity: Math.max(1, readNumber(entry.quantity))
})) : undefined;


export const normalizeOrderFulfilments = (value: unknown): import('./types').OrderFulfilment[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.filter(entry => entry && typeof entry.id === 'string' && Array.isArray(entry.allocations)).map(entry => ({
    ...(readString(entry.notes) ? {notes: readString(entry.notes)} : {}),
    ...(entry.destination ? { destination: { formattedAddress: readString(entry.destination.formattedAddress), latitude: readString(entry.destination.latitude), longitude: readString(entry.destination.longitude), deliveryInstructions: readString(entry.destination.deliveryInstructions) } } : {}),
    id: readString(entry.id), method: entry.method === 'delivery' ? 'delivery' : 'pickup', date: readString(entry.date), time: readString(entry.time),
    pickupLocationId: readString(entry.pickupLocationId), pickupLocationName: readString(entry.pickupLocationName), pickupLocationAddress: readString(entry.pickupLocationAddress),
    allocations: entry.allocations.map(allocation => ({ itemIndex: readNumber(allocation.itemIndex), quantity: readNumber(allocation.quantity), ...(allocation.componentDay ? { componentDay: allocation.componentDay } : {}) }))
  }));
};
