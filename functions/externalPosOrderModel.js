import { productAllowsFulfilmentDate } from './storeProductAvailability.js';
import { buildOrderItems, getValidPickupDates, getPickupTimeSlots } from './storePaymentsCore.js';
import { buildOrderFulfilments } from './storeOrderFulfilments.js';
import { isFullWeekSelection, isWeeklyMealPlan, getWeeklyDates } from './storeWeeklyMealPlan.js';
import { mergeMealOptionSnapshots, resolveSelectionMealOptions } from './healthyLunchOptions.js';

// Prices and daily meal snapshots always come from the Store catalog, not POS inputs.
export function buildExternalOrderItems(input, checkout, now = new Date(), { owner = false } = {}) {
  const method = input.fulfilmentMethod || 'pickup';
  if (input.selections?.some(selection => !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > (owner ? 10000 : 20))) throw new Error('Choose a valid quantity.');
  if (owner) {
    const selectedIds = new Set(input.selections.flatMap(selection => [selection.productId, ...(selection.selectedSetItems || []).map(item => item.productId)].filter(Boolean)));
    if (checkout.products.some(product => selectedIds.has(product.id) && (product.storeId !== checkout.store.id || product.workspaceId !== checkout.store.workspaceId))) throw new Error('A selected product belongs to another Store.');
    if (checkout.products.some(product => selectedIds.has(product.id) && (!String(product.name || '').trim() || !Number.isFinite(product.price) || product.price < 0 || Math.round(product.price * 100) / 100 !== product.price))) throw new Error('This product configuration is invalid.');
  }
  if (!['pickup', 'delivery'].includes(method)) throw new Error('Choose Delivery or Pickup.');
  const address = typeof input.deliveryAddress === 'string' ? input.deliveryAddress.trim() : '';
  if (method === 'delivery' && (!address || address.length > 1000)) throw new Error('Enter a delivery address (up to 1000 characters).');
  const exactTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const schedules = input.lineSchedules;
  if (schedules !== undefined && (!Array.isArray(schedules) || schedules.length !== input.selections.length || schedules.some(line=>!line || typeof line.date!=='string' || typeof line.time!=='string'))) throw new Error('Schedule every cart line.');
  const items = [], days = new Map();
  const immediateDate = new Date(now.getTime() + 28800000).toISOString().slice(0,10);
  const immediateTime = new Date(now.getTime() + 28800000).toISOString().slice(11,16);
  let scheduled = Boolean(input.fulfilmentMethod);
  for (const [index, selection] of input.selections.entries()) {
    const product = checkout.products.find(product => product.id === selection.productId);
    const weekly = isFullWeekSelection(selection, checkout.products);
    const line = schedules?.[index];
    // A meal's selected day always wins over the order-level default.
    if (selection.healthyLunchDate && line?.date && selection.healthyLunchDate !== line.date) throw new Error('Keep the selected weekly meal fulfilment date.');
    const date = selection.healthyLunchDate || line?.date || input.fulfilmentDate;
    const time = line?.time || input.fulfilmentTime;
    if (method === 'delivery' && (!date || !time)) throw new Error('Choose a delivery date and exact time.');
    if (time && !exactTime(time)) throw new Error('Choose a valid exact fulfilment time.');
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
      // Reuse catalog/day validation without requiring online delivery quotes or slots.
      daily = buildOrderFulfilments({ store: method === 'delivery' ? {...checkout.store,pickupLocations:[{id:'external',name:'',address:''}]} : checkout.store, products: checkout.products,
        draft: { selections: [selection], fulfilmentMethod:'pickup', pickupLocationId: method === 'delivery' ? 'external' : input.pickupLocationId || checkout.store.pickupLocations?.[0]?.id,
          fulfilments: dates.map(date => ({date,time,itemIndexes:[0]})) },
        getDates:getValidPickupDates, getTimes: input.fulfilmentMethod ? () => [time] : getPickupTimeSlots, now, owner });
    }
    const [item] = buildOrderItems([selection], checkout.products, checkout.optionGroups, checkout.sets, date, { owner, storeId: checkout.store.id, workspaceId: checkout.store.workspaceId });
    if (!Number.isSafeInteger(Math.round(item.lineTotal * 100)) || item.lineTotal < 0) throw new Error('Order amount is unsafe.');
    if (daily?.weeklyPlanSnapshot) item.weeklyPlanSnapshot = mergeMealOptionSnapshots(daily.weeklyPlanSnapshot, resolveSelectionMealOptions(selection, checkout.products, date));
    items.push(item);
    const entries = daily?.fulfilments || [{date:immediateDate,time:immediateTime,method:'pickup',pickupLocationId:checkout.store.pickupLocations?.[0]?.id || '',pickupLocationName:checkout.store.pickupLocations?.[0]?.name || '',pickupLocationAddress:checkout.store.pickupLocations?.[0]?.address || '',allocations:[{itemIndex:0,quantity:selection.quantity}]}];
    for (const original of entries) {
      const entry = method === 'delivery' ? {...original, method, pickupLocationId:'', pickupLocationName:'', pickupLocationAddress:'', destination:{formattedAddress:address}} : original;
      const key = `${entry.date.replaceAll('-','')}_${entry.time.replace(':','')}`;
      const day = days.get(key) || {...entry,id:`external_${key}`,allocations:[]};
      day.allocations.push(...entry.allocations.map(allocation => ({...allocation,itemIndex:index})));
      days.set(key,day);
    }
  }
  const fulfilments = [...days.values()].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return { items,
    ...(input.fulfilmentMethod ? {fulfilmentMethod:method, pickupDate:fulfilments[0].date, pickupTime:fulfilments[0].time,
      ...(method === 'delivery' ? {delivery:{arrangedExternally:true,fulfilmentMethod:'delivery',fulfilmentMode:'preorder',schedule:{date:fulfilments[0].date,time:fulfilments[0].time},recipient:{address}}} : {})} : {}), ...(scheduled ? {fulfilments,fulfilmentOperations:{},fulfilmentCompletion:{}} : {}) };
}
