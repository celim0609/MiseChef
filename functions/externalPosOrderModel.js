import { productAllowsFulfilmentDate } from './storeProductAvailability.js';
import { buildOrderItems, getValidPickupDates, getPickupTimeSlots } from './storePaymentsCore.js';
import { buildOrderFulfilments } from './storeOrderFulfilments.js';
import { isFullWeekSelection, isWeeklyMealPlan, getWeeklyDates } from './storeWeeklyMealPlan.js';
import { mergeMealOptionSnapshots, resolveSelectionMealOptions } from './healthyLunchOptions.js';

// Prices and daily meal snapshots always come from the Store catalog, not POS inputs.
export function buildExternalOrderItems(input, checkout, now = new Date()) {
  const schedules = input.lineSchedules;
  if (schedules !== undefined && (!Array.isArray(schedules) || schedules.length !== input.selections.length || schedules.some(line=>!line || typeof line.date!=='string' || typeof line.time!=='string'))) throw new Error('Schedule every cart line.');
  const items = [], days = new Map();
  const immediateDate = new Date(now.getTime() + 28800000).toISOString().slice(0,10);
  const immediateTime = new Date(now.getTime() + 28800000).toISOString().slice(11,16);
  let scheduled = false;
  for (const [index, selection] of input.selections.entries()) {
    const product = checkout.products.find(product => product.id === selection.productId);
    const weekly = isFullWeekSelection(selection, checkout.products);
    const line = schedules?.[index];
    const date = line?.date || selection.healthyLunchDate;
    const time = line?.time;
    if (isWeeklyMealPlan(product) && !date) throw new Error('Choose a fulfilment date for this weekly menu.');
    if ((date && !time) || (!date && time)) throw new Error('Choose both a fulfilment date and time.');
    if (!date) {
      const selectedProducts = selection.setId ? (selection.selectedSetItems || []).map(choice=>checkout.products.find(product=>product.id===choice.productId)) : [product];
      if (selectedProducts.some(product=>product && !productAllowsFulfilmentDate(product,immediateDate))) throw new Error('Choose a fulfilment date matching the selected dish’s Available day.');
    }
    let daily;
    if (date) {
      scheduled = true;
      const dates = weekly ? getWeeklyDates(date) : [date];
      if (!dates.length) throw new Error('Weekly plans must start on Monday.');
      daily = buildOrderFulfilments({ store: checkout.store, products: checkout.products,
        draft: { selections: [selection], fulfilmentMethod:'pickup', pickupLocationId: input.pickupLocationId || checkout.store.pickupLocations?.[0]?.id,
          fulfilments: dates.map(date => ({date,time,itemIndexes:[0]})) },
        getDates:getValidPickupDates, getTimes:getPickupTimeSlots, now });
    }
    const [item] = buildOrderItems([selection], checkout.products, checkout.optionGroups, checkout.sets, date);
    if (daily?.weeklyPlanSnapshot) item.weeklyPlanSnapshot = mergeMealOptionSnapshots(daily.weeklyPlanSnapshot, resolveSelectionMealOptions(selection, checkout.products, date));
    items.push(item);
    const entries = daily?.fulfilments || [{date:immediateDate,time:immediateTime,method:'pickup',pickupLocationId:checkout.store.pickupLocations?.[0]?.id || '',pickupLocationName:checkout.store.pickupLocations?.[0]?.name || '',pickupLocationAddress:checkout.store.pickupLocations?.[0]?.address || '',allocations:[{itemIndex:0,quantity:selection.quantity}]}];
    for (const entry of entries) {
      const key = `${entry.date.replaceAll('-','')}_${entry.time.replace(':','')}`;
      const day = days.get(key) || {...entry,id:`external_${key}`,allocations:[]};
      day.allocations.push(...entry.allocations.map(allocation => ({...allocation,itemIndex:index})));
      days.set(key,day);
    }
  }
  return { items, ...(scheduled ? {fulfilments:[...days.values()].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),fulfilmentOperations:{},fulfilmentCompletion:{}} : {}) };
}
