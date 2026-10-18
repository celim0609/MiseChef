import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderFulfilments, canonicalSchedule, publicOrderFulfilments } from './storeOrderFulfilments.js';
import { buildPendingOrder, getValidPickupDates, getPickupTimeSlots } from './storePaymentsCore.js';

const now = new Date('2026-07-26T04:00:00Z');
const store = { id: 's', workspaceId: 's', name: 'Kitchen', country: 'MY', currency: 'MYR', pickupEnabled: true,
  orderDays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], maximumAdvanceDays: 14,
  pickupOperatingHours: { start: '10:00', end: '18:00' }, pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Kitchen' }],
  delivery: { fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 14, deliveryHours: { from: '09:00', to: '18:00' } } } } };
const products = ['mon','tue','wed','thu','fri'].map(day => ({ id: day, name: `${day} meal`, storeId: 's', workspaceId: 's', price: 10, available: true, availableDay: day, optionGroupIds: [] }));
const schedule = [{ date: '2026-07-27', time: '10:00', itemIndexes: [0] }, { date: '2026-07-31', time: '11:00', itemIndexes: [1] }];
const draft = { customerName: 'Guest', phone: '+60123456789', pickupDate: '2026-07-27', pickupTime: '10:00', pickupLocationId: 'counter', selections: [{ productId: 'mon', quantity: 2 }, { productId: 'fri', quantity: 3 }], fulfilments: schedule };
const build = changes => buildOrderFulfilments({ store, draft, products, now, getDates: getValidPickupDates, getTimes: getPickupTimeSlots, ...changes });
const financial = changes => buildPendingOrder({ id: 'order', orderNumber: 'MC-1', store, draft, products, optionGroups: [], now, paymentProvider: 'stripe', paymentProviderMode: 'single_merchant', ...changes });

test('Monday and Friday remain one financial order with exactly two immutable allocations', () => {
  const order = financial();
  assert.equal(order.total, 50); assert.equal(order.items.length, 2); assert.equal(order.itemCount, 5);
  assert.equal(order.payment.amountMinor, 5000); assert.equal(order.fulfilments.length, 2);
  assert.equal(order.fulfilments[0].date, schedule[0].date); assert.equal(order.fulfilments[1].time, '11:00');
  assert.deepEqual(order.fulfilments.map(day => day.allocations[0].quantity), [2,3]);
  assert.deepEqual(draft.fulfilments, schedule);
});

test('server rejects wrong weekday, omitted/duplicate/unknown allocations, duplicate dates and invalid slots', () => {
  const invalid = [
    [{ ...schedule[0], date: '2026-07-28' }, schedule[1]], [schedule[0]],
    [schedule[0], { ...schedule[1], itemIndexes: [0,1] }],
    [schedule[0], { ...schedule[1], itemIndexes: [2] }],
    [schedule[0], { ...schedule[1], date: schedule[0].date }],
    [{ ...schedule[0], time: '07:00' }, schedule[1]],
    [{ ...schedule[0], date: '2026-02-30' }, schedule[1]],
    [{ ...schedule[0], itemIndexes: [0,0] }, schedule[1]]
  ];
  for (const fulfilments of invalid) assert.throws(() => financial({ draft: { ...draft, fulfilments } }));
  assert.throws(() => build({ store: { ...store, unavailableDates: ['2026-07-31'] } }), /available/);
  assert.throws(() => build({ groupOrder: { id: 'group' } }), /Group/);
  assert.throws(() => financial({ draft: { ...draft, deliverySnapshot: { quote: { fee: 0 } } } }), /Pickup fulfilments/);
  assert.throws(() => build({ draft: { ...draft, pickupLocationId: 'foreign' } }), /location/);
});

test('delivery counts scheduled days, never meals or quantities, and ignores client fees/counts', () => {
  const deliveryDraft = { ...draft, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 7.25, quotationId: 'first' }, schedule: { date: schedule[0].date }, fulfilmentMode: 'preorder' }, fulfilmentCount: 99, deliveryFee: 0 };
  const order = financial({ draft: deliveryDraft });
  assert.equal(order.totals.deliveryFee, 14.5); assert.equal(order.total, 64.5);
  assert.equal(order.deliveryPricingSnapshot.firstDayFee, 7.25);
  assert.equal(order.deliveryPricingSnapshot.fulfilmentCount, 2);
  assert.equal(order.deliveryPricingSnapshot.finalDeliveryTotal, 14.5);
  assert.equal(order.payment.amountMinor, 6450);
  const subsidisedStore = { ...store, delivery: { ...store.delivery, subsidy: { enabled: true, minimumMerchandiseSpend: 1, maximumCustomerDeliveryCharge: 2 } } };
  const fixedRule = financial({ store: subsidisedStore, draft: deliveryDraft });
  assert.equal(fixedRule.totals.deliveryFee, 14.5);
  assert.equal(fixedRule.delivery.pricing.subsidyApplied, false);
  assert.throws(() => financial({ draft: { ...deliveryDraft, fulfilmentMode: 'instant' } }), /pre-order/);
});

test('three fulfilments multiply first quote by three even when quantities differ', () => {
  const selections = [{ productId: 'mon', quantity: 20 }, { productId: 'wed', quantity: 1 }, { productId: 'fri', quantity: 4 }];
  const fulfilments = [schedule[0], { date: '2026-07-29', time: '12:00', itemIndexes: [1] }, { ...schedule[1], itemIndexes: [2] }];
  const order = financial({ draft: { ...draft, selections, fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 8 }, schedule: { date: schedule[0].date } } } });
  assert.equal(order.totals.deliveryFee, 24); assert.equal(order.deliveryPricingSnapshot.fulfilmentCount, 3);
});

test('Weekly Plan references one paid line five times with five immutable meal components', () => {
  const days = ['mon','tue','wed','thu','fri'];
  const plan = { id: 'plan', name: 'Week', price: 45, available: true, storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', optionGroupIds: [], weeklyMeals: Object.fromEntries(days.map(day => [day,day])) };
  const fulfilments = days.map((day, index) => ({ date: `2026-07-${27 + index}`, time: '10:00', itemIndexes: [0] }));
  const order = financial({ products: [...products.map(product => product.id === 'thu' ? { ...product, availableDay: 'tue' } : product), plan], draft: { ...draft, selections: [{ productId: 'plan', quantity: 2 }], fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 6 }, schedule: { date: '2026-07-27' } } } });
  assert.equal(order.items.length, 1); assert.equal(order.totals.merchandiseSubtotal, 90);
  assert.equal(order.totals.deliveryFee, 30); assert.equal(order.deliveryPricingSnapshot.fulfilmentCount, 5);
  assert.deepEqual(order.items[0].weeklyPlanSnapshot.meals.map(meal => meal.productName), days.map(day => `${day} meal`));
  assert.deepEqual(order.fulfilments.map(day => day.allocations[0].quantity), [2,2,2,2,2]);
  assert.equal(order.weeklyFulfilments, undefined);
  assert.equal(publicOrderFulfilments(order)[4].meals[0].productName, 'fri meal');
});

test('legacy drafts do not gain a fulfilment schema; missing Available Day remains all', () => {
  assert.equal(canonicalSchedule({}), null);
  assert.equal(build({ draft: { ...draft, fulfilments: undefined } }), null);
  assert.doesNotThrow(() => build({ products: products.map(product => ({ ...product, availableDay: undefined })), draft: { ...draft, fulfilments: [{ ...schedule[0], date: '2026-07-28' }, schedule[1]] } }));
  const order = financial({ draft: { ...draft, fulfilments: undefined, selections: [draft.selections[0]] } });
  assert.equal(order.fulfilments, undefined); assert.equal(order.total, 20);
});

test('customer projection includes meals/schedules but omits IDs, costs and operators', () => {
  const order = financial(); order.fulfilmentCompletion = { [order.fulfilments[0].id]: { completedBy: 'private', completedAt: 'now' } };
  const projection = publicOrderFulfilments(order);
  assert.equal(projection[0].completed, true); assert.equal(projection[1].completed, false);
  assert.equal(JSON.stringify(projection).includes('private'), false);
  assert.equal(JSON.stringify(projection).includes('itemIndex'), false);
});

test('weekly delivery rejects different daily times and shifted weekdays while standalone locks remain', () => {
  const days = ['mon','tue','wed','thu','fri'];
  const plan = { id: 'plan', name: 'Week', price: 45, available: true, storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', optionGroupIds: [], weeklyMeals: Object.fromEntries(days.map(day => [day,day])) };
  const fulfilments = days.map((day, index) => ({ date: `2026-07-${27 + index}`, time: '13:30', itemIndexes: [0] }));
  const weeklyDraft = { ...draft, selections: [{ productId: 'plan', quantity: 2 }], fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder' };
  const overrides = { products: [...products, plan], draft: weeklyDraft };
  assert.ok(build(overrides).fulfilments.every(entry => entry.time === '13:30'));
  const cutoffStore = { ...store, orderCutoffTime: '18:00', delivery: { ...store.delivery, fulfilment: { ...store.delivery.fulfilment, preOrder: { ...store.delivery.fulfilment.preOrder, earliestDays: 1 } } } };
  assert.ok(build({ ...overrides, store: cutoffStore, now: new Date('2026-07-26T10:00:00Z') }));
  assert.throws(() => build({ ...overrides, store: cutoffStore, now: new Date('2026-07-26T10:00:01Z') }), /available fulfilment date/);
  assert.throws(() => build({ ...overrides, draft: { ...weeklyDraft, fulfilments: fulfilments.map((entry, i) => i === 3 ? { ...entry, time: '14:00' } : entry) } }), /one delivery time/);
  assert.throws(() => build({ ...overrides, draft: { ...weeklyDraft, fulfilments: fulfilments.map((entry, i) => ({ ...entry, date: ['2026-07-28','2026-07-29','2026-07-30','2026-07-31','2026-08-01'][i] })) } }), /starting Monday/);
  assert.throws(() => build({ draft: { ...draft, fulfilments: [{ ...schedule[0], date: '2026-07-28' }, schedule[1]] } }), /Available day/);
});


test('scheduled pickup and delivery both enforce the shared cut-off', () => {
  const cutoffStore = { ...store, earliestPickupDays: 1, orderCutoffTime: '18:00' };
  const after = new Date('2026-07-26T10:00:01Z');
  assert.throws(() => build({ store: cutoffStore, now: after }), /available fulfilment date/);
  assert.throws(() => financial({ store: cutoffStore, now: after }), /available fulfilment date/);
  const deliveryDraft = { ...draft, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', fulfilments: schedule.map(entry => ({ ...entry, time: '10:00' })) };
  const deliveryStore = { ...cutoffStore, delivery: { ...cutoffStore.delivery, fulfilment: { ...cutoffStore.delivery.fulfilment, preOrder: { ...cutoffStore.delivery.fulfilment.preOrder, earliestDays: 1 } } } };
  assert.throws(() => build({ store: deliveryStore, draft: deliveryDraft, now: after }), /available fulfilment date/);
  assert.ok(build({ store: { ...deliveryStore, orderCutoffTime: null }, draft: deliveryDraft, now: after }));
});

test('server charges only non-qualifying days and ignores forged free fees and subtotals', () => {
  const deliveryStore = { ...store, delivery: { ...store.delivery, freeDelivery: { enabled: true, distanceThresholdKm: 8, minimumSubtotalWithin: 25, minimumSubtotalBeyond: 120 } } };
  const deliveryDraft = { ...draft, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 7.25 }, pickup: { latitude: '3', longitude: '101' }, recipient: { latitude: '3.01', longitude: '101' }, schedule: { date: schedule[0].date }, pricing: { days: [{ merchandiseSubtotal: 999, customerDeliveryFee: 0 }] } }, deliveryFee: 0, distanceKm: 0 };
  const order = financial({ store: deliveryStore, draft: deliveryDraft });
  assert.deepEqual(order.deliveryPricingSnapshot.days.map(day => day.merchandiseSubtotal), [20,30]);
  assert.deepEqual(order.deliveryPricingSnapshot.days.map(day => day.customerDeliveryFee), [7.25,0]);
  assert.equal(order.totals.deliveryFee, 7.25);
  assert.equal(order.total, 57.25);
  assert.equal(order.payment.amountMinor, 5725);
  assert.equal(order.deliveryPricingSnapshot.firstQuote.fee, 7.25);
});


test('weekly delivery submission evaluates each fifth of merchandise, not the full weekly price', () => {
  const days = ['mon','tue','wed','thu','fri'];
  const plan = { id: 'plan', name: 'Week', price: 300.02, available: true, storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', optionGroupIds: [], weeklyMeals: Object.fromEntries(days.map(day => [day,day])) };
  const fulfilments = days.map((day, index) => ({ date: `2026-07-${27 + index}`, time: '10:00', itemIndexes: [0] }));
  const deliveryStore = { ...store, delivery: { ...store.delivery, freeDelivery: { enabled: true, distanceThresholdKm: 8, minimumSubtotalWithin: 60.01, minimumSubtotalBeyond: 120 } } };
  const order = financial({ store: deliveryStore, products: [...products, plan], draft: { ...draft, selections: [{ productId: 'plan', quantity: 1 }], fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 6 }, pickup: { latitude: '3', longitude: '101' }, recipient: { latitude: '3.01', longitude: '101' }, schedule: { date: '2026-07-27' } } } });
  assert.deepEqual(order.deliveryPricingSnapshot.days.map(day => day.customerDeliveryFee), [0,0,6,6,6]);
  assert.equal(order.totals.deliveryFee, 18);
  assert.equal(order.payment.amountMinor, 31802);
  const discounted = financial({ store: deliveryStore, products: [...products, plan], promotions: [{ id: 'weekly-discount', storeId: 's', workspaceId: 's', name: 'Weekly discount', active: true, type: 'fixed_amount', eligibleProductIds: ['plan'], fixedAmountOff: 30, minimumOrderAmount: 0, startsAt: '2020-01-01T00:00:00Z' }], draft: { ...draft, selections: [{ productId: 'plan', quantity: 1 }], fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 6 }, pickup: { latitude: '3', longitude: '101' }, recipient: { latitude: '3.01', longitude: '101' }, schedule: { date: '2026-07-27' } } } });
  assert.equal(discounted.totals.discountedMerchandiseTotal, 270.02);
  assert.deepEqual(discounted.deliveryPricingSnapshot.days.map(day => day.merchandiseSubtotal), [54.01,54.01,54,54,54]);
  assert.deepEqual(discounted.deliveryPricingSnapshot.days.map(day => day.freeDeliveryApplied), [false,false,false,false,false]);
  assert.equal(discounted.totals.deliveryFee, 30);

});


test('submission uses discounted daily merchandise for free delivery and retains weekly-alone validation', () => {
  const freeDelivery = { enabled: true, distanceThresholdKm: 8, minimumSubtotalWithin: 60, minimumSubtotalBeyond: 120 };
  const deliverySnapshot = { quote: { fee: 7.25 }, pickup: { latitude: '3', longitude: '101' }, recipient: { latitude: '3.01', longitude: '101' }, schedule: { date: schedule[0].date } };
  const order = financial({ store: { ...store, delivery: { ...store.delivery, freeDelivery } }, products: products.map(product => product.id === 'mon' ? { ...product, price: 30 } : product), promotions: [{ id: 'discount', storeId: 's', workspaceId: 's', name: 'Discount', active: true, type: 'fixed_amount', eligibleProductIds: ['mon'], fixedAmountOff: 5, minimumOrderAmount: 0, startsAt: '2020-01-01T00:00:00Z' }], draft: { ...draft, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot } });
  assert.equal(order.totals.discountedMerchandiseTotal, 80);
  assert.deepEqual(order.deliveryPricingSnapshot.days.map(day => day.merchandiseSubtotal), [50,30]);
  assert.deepEqual(order.deliveryPricingSnapshot.days.map(day => day.freeDeliveryApplied), [false,false]);
  assert.equal(order.totals.deliveryFee, 14.5);
  assert.equal(order.payment.amountMinor, 9450);
  const plan = { id: 'plan', productType: 'weekly_meal_plan' };
  assert.throws(() => financial({ products: [...products, plan], draft: { ...draft, selections: [{ productId: 'plan', quantity: 1 }, { productId: 'mon', quantity: 1 }] } }), /purchased alone/);
});

test('dated full week enforces explicit cutoff at checkout and snapshots the selected dated menu', () => {
  const weeklyWeeks = { week1: { startMonday: '2026-07-27', meals: Object.fromEntries(products.map(meal => [meal.id, meal.id])) }, week2: { startMonday: '2026-08-03', meals: { mon: 'fri', tue: 'thu', wed: 'wed', thu: 'tue', fri: 'mon' } } };
  const plan = { id: 'healthy', storeId: 's', workspaceId: 's', name: 'Healthy Lunch', price: 45, available: true, optionGroupIds: [], productType: 'weekly_meal_plan', weeklyWeeks };
  const fulfilments = ['27','28','29','30','31'].map(day => ({ date: `2026-07-${day}`, time: '10:00', itemIndexes: [0] }));
  const weeklyDraft = { ...draft, selections: [{ productId: plan.id, quantity: 2 }], fulfilments };
  const weeklyStore = { ...store, earliestPickupDays: 1, orderCutoffTime: '18:00' };
  const options = { store: weeklyStore, draft: weeklyDraft, products: [...products, plan], now: new Date('2026-07-26T10:00:00.000Z') };
  const order = financial(options);
  assert.equal(order.total, 90);
  assert.equal(order.fulfilments.length, 5);
  assert.equal(order.items[0].weeklyPlanSnapshot.startMonday, '2026-07-27');
  assert.throws(() => financial({ ...options, now: new Date('2026-07-26T10:00:00.001Z') }), /closed/);
  assert.throws(() => financial({ ...options, draft: { ...weeklyDraft, fulfilments: undefined } }), /schedule|dated/);
  for (const method of ['pickup','delivery']) {
    const next = financial({ ...options, draft: { ...weeklyDraft, fulfilmentMethod: method, ...(method === 'delivery' ? { fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 7 }, schedule: { date: '2026-07-27' }, fulfilmentMode: 'preorder' } } : {}), fulfilments: ['03','04','05','06','07'].map(day => ({ date: `2026-08-${day}`, time: '10:00', itemIndexes: [0] })) } });
    assert.equal(next.items[0].weeklyPlanSnapshot.meals[0].productId, 'fri');
    assert.equal(next.totals.deliveryFee, method === 'delivery' ? 35 : 0);
  }
  assert.throws(() => financial({ ...options, store: { ...weeklyStore, unavailableDates: ['2026-07-29'] } }), /available/);
  assert.throws(() => financial({ ...options, draft: { ...weeklyDraft, fulfilments: fulfilments.map((entry, index) => index === 2 ? { ...entry, time: '11:00' } : entry) } }), /whole weekly/);
});

test('future Healthy Lunch days stay orderable after full-week closure using normal cutoff rules', () => {
  const plan = { id: 'healthy', storeId: 's', workspaceId: 's', available: true, productType: 'weekly_meal_plan', weeklyWeeks: { week1: { startMonday: '2026-07-27', meals: Object.fromEntries(products.map(meal => [meal.id, meal.id])) } } };
  const selection = { productId: 'wed', quantity: 2, healthyLunchPlanId: 'healthy', healthyLunchDate: '2026-07-29' };
  const dayDraft = { ...draft, selections: [selection], fulfilments: [{ date: '2026-07-29', time: '10:00', itemIndexes: [0] }] };
  const options = { products: [...products, plan], draft: dayDraft, store: { ...store, earliestPickupDays: 1, orderCutoffTime: '18:00' }, now: new Date('2026-07-27T10:01:00Z') };
  assert.equal(financial(options).total, 20);
  assert.throws(() => financial({ ...options, now: new Date('2026-07-28T10:01:00Z') }), /available/);
  assert.throws(() => financial({ ...options, draft: { ...dayDraft, selections: [{ ...selection, productId: 'mon' }] } }), /does not match/);
  assert.throws(() => financial({ ...options, draft: { ...dayDraft, selections: [{ ...selection, healthyLunchDate: '2026-07-30' }] } }), /valid Healthy Lunch date/);
  assert.throws(() => financial({ ...options, products: [...products, { ...plan, available: false }] }), /Healthy Lunch/);
});

test('an unavailable meal in a different week does not close a valid selected week or day', () => {
  const weeklyWeeks = { week1: { startMonday: '2026-07-27', meals: { mon: 'old-mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri' } }, week2: { startMonday: '2026-08-03', meals: Object.fromEntries(products.map(meal => [meal.id, meal.id])) } };
  const plan = { id: 'healthy', storeId: 's', workspaceId: 's', available: true, name: 'Healthy Lunch', price: 45, productType: 'weekly_meal_plan', weeklyWeeks };
  const catalogue = [...products, { ...products[0], id: 'old-mon', available: false }, plan];
  const datedDraft = { ...draft, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: ['03','04','05','06','07'].map(day => ({ date: `2026-08-${day}`, time: '10:00', itemIndexes: [0] })) };
  assert.equal(financial({ products: catalogue, draft: datedDraft }).fulfilments.length, 5);
  const dayDraft = { ...draft, selections: [{ productId: 'wed', quantity: 1, healthyLunchPlanId: plan.id, healthyLunchDate: '2026-08-05' }], fulfilments: [{ date: '2026-08-05', time: '10:00', itemIndexes: [0] }] };
  assert.equal(financial({ products: catalogue, draft: dayDraft }).total, 10);
});

const directMenu = (label = 'A') => Object.fromEntries(['mon','tue','wed','thu','fri'].map((day, index) => [day, { name: `${label} ${day} lunch`, photoUrl: `https://example.test/${label}-${day}.jpg`, price: 11 + index, calories: 410 + index, description: `${label} ${day} description` }]));
const directPlan = () => ({ id: 'embedded', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', available: true, productType: 'weekly_meal_plan', price: 50, optionGroupIds: [], weeklyMenuVersion: 2,
  weeklyWeeks: { week2: { startMonday: '2026-07-27', meals: directMenu() }, week1: { startMonday: '2026-08-03', meals: directMenu('B') } } });

test('embedded full-week purchase snapshots five meals at one package price without Product references', () => {
  const plan = directPlan();
  const weeklyDraft = { ...draft, selections: [{ productId: plan.id, quantity: 2 }], fulfilments: ['27','28','29','30','31'].map(day => ({ date: `2026-07-${day}`, time: '10:00', itemIndexes: [0] })) };
  const options = { products: [plan], draft: weeklyDraft, store: { ...store, orderCutoffTime: '18:00', earliestPickupDays: 1 }, now: new Date('2026-07-26T10:00:00Z') };
  const order = financial(options);
  assert.equal(order.total, 100); assert.equal(order.items.length, 1); assert.equal(order.payment.amountMinor, 10000);
  assert.equal(order.items[0].weeklyPlanSnapshot.meals.length, 5);
  assert.equal(order.items[0].weeklyPlanSnapshot.meals[0].productName, 'A mon lunch');
  assert.equal(order.items[0].weeklyPlanSnapshot.meals[0].price, 11);
  assert.equal(order.items[0].weeklyPlanSnapshot.meals[0].calories, 410);
  assert.throws(() => financial({ ...options, now: new Date('2026-07-26T10:00:00.001Z') }), /closed/);
  plan.weeklyWeeks.week2.meals.mon.name = 'Changed later'; plan.weeklyWeeks.week2.meals.mon.photoUrl = 'new.jpg';
  assert.equal(order.items[0].weeklyPlanSnapshot.meals[0].productName, 'A mon lunch');
  assert.equal(order.items[0].weeklyPlanSnapshot.meals[0].photoUrl, 'https://example.test/A-mon.jpg');
  const publicDay = publicOrderFulfilments(order)[0].meals[0];
  assert.equal(publicDay.calories, 410); assert.equal(publicDay.photoUrl, 'https://example.test/A-mon.jpg');
  assert.equal(publicDay.productId, undefined);
});

test('embedded single days use normal cutoff and authoritative day prices, with multiple dates from one plan', () => {
  const plan = directPlan();
  const selections = ['2026-07-29','2026-08-03'].map(date => ({ productId: plan.id, healthyLunchPlanId: plan.id, healthyLunchDate: date, quantity: 2, price: 0, selectedOptions: [] }));
  const dayDraft = { ...draft, selections, fulfilments: selections.map((selection, index) => ({ date: selection.healthyLunchDate, time: '10:00', itemIndexes: [index] })) };
  const options = { products: [plan], draft: dayDraft, store: { ...store, earliestPickupDays: 1, orderCutoffTime: '18:00' }, now: new Date('2026-07-27T10:01:00Z') };
  const order = financial(options);
  assert.equal(order.total, 48); // 2 × Wednesday 13 + 2 × next Monday 11
  assert.equal(order.items[0].productName, 'A wed lunch'); assert.equal(order.items[1].productName, 'B mon lunch');
  assert.equal(order.items[0].calories, 412); assert.equal(order.items[0].description, 'A wed description');
  assert.equal(order.items[0].weeklyPlanSnapshot, undefined);
  assert.equal(order.fulfilments.length, 2);
  assert.throws(() => financial({ ...options, now: new Date('2026-07-28T10:01:00Z') }), /available/);
  assert.throws(() => financial({ ...options, draft: { ...dayDraft, selections: [{ ...selections[0], healthyLunchDate: '2026-07-30' }, selections[1]] } }), /valid Healthy Lunch/);
  assert.throws(() => financial({ ...options, draft: { ...dayDraft, selections: [{ ...selections[0], healthyLunchPlanId: 'foreign' }, selections[1]] } }), /Healthy Lunch/);
  assert.throws(() => financial({ ...options, draft: { ...dayDraft, selections: [{ ...selections[0], healthyLunchDate: '2026-08-10' }, selections[1]], fulfilments: [{ date: '2026-08-10', time: '10:00', itemIndexes: [0] }, dayDraft.fulfilments[1]] } }), /does not match|available/);
});

test('embedded full-week and per-day deliveries keep existing per-day free-delivery pricing', () => {
  const plan = directPlan();
  const deliveryStore = { ...store, delivery: { ...store.delivery, freeDelivery: { enabled: true, distanceThresholdKm: 5, minimumSubtotalWithin: 15, minimumSubtotalBeyond: 25 } } };
  const deliverySnapshot = { quote: { fee: 7, quotationId: 'q' }, schedule: { date: '2026-07-27' }, fulfilmentMode: 'preorder', pickup: { latitude: '4.6', longitude: '101.1' }, recipient: { latitude: '4.601', longitude: '101.101' } };
  const weeklyDraft = { ...draft, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: ['27','28','29','30','31'].map(day => ({ date: `2026-07-${day}`, time: '10:00', itemIndexes: [0] })) };
  const full = financial({ products: [plan], store: deliveryStore, draft: weeklyDraft });
  assert.equal(full.totals.deliveryFee, 35); assert.equal(full.total, 85); // weekly 50 / 5 = 10 per day, below 15
  const single = financial({ products: [plan], store: deliveryStore, draft: { ...weeklyDraft, selections: [{ productId: plan.id, healthyLunchPlanId: plan.id, healthyLunchDate: '2026-07-31', quantity: 1 }], fulfilments: [{ date: '2026-07-31', time: '10:00', itemIndexes: [0] }] } });
  assert.equal(single.items[0].basePrice, 15); assert.equal(single.totals.deliveryFee, 0); assert.equal(single.total, 15);
  assert.equal(single.fulfilments[0].allocations[0].componentDay, undefined);
});

test('rotation keeps multi-date orders and purchased snapshots fixed when future cycle changes', () => {
  const plan = { id: 'rotation', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', available: true, productType: 'weekly_meal_plan', weeklyMenuVersion: 3,
    price: 50, optionGroupIds: [], rotationStartMonday: '2026-07-27', healthyLunchBlockedDates: [],
    rotationWeeks: { week2: { meals: directMenu('A') }, week4: { meals: directMenu('B') } } };
  const fullDraft = { ...draft, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: ['27','28','29','30','31'].map(day => ({ date: `2026-07-${day}`, time: '10:00', itemIndexes: [0] })) };
  const checkout = { products: [plan], draft: fullDraft, store: { ...store, orderCutoffTime: '18:00' }, now: new Date('2026-07-26T10:00:00Z') };
  const purchased = financial(checkout);
  assert.equal(purchased.items[0].weeklyPlanSnapshot.meals[0].productName, 'A mon lunch');
  assert.equal(purchased.items[0].weeklyPlanSnapshot.startMonday, '2026-07-27');
  assert.throws(() => financial({ ...checkout, now: new Date('2026-07-26T10:00:00.001Z') }), /closed/);
  const dates = ['2026-07-30', '2026-07-31', '2026-08-03'];
  const selections = dates.map(date => ({ productId: plan.id, healthyLunchPlanId: plan.id, healthyLunchDate: date, quantity: 1 }));
  const multi = financial({ ...checkout, draft: { ...draft, selections, fulfilments: dates.map((date, index) => ({ date, time: '10:00', itemIndexes: [index] })) }, now: new Date('2026-07-26T04:00:00Z') });
  assert.deepEqual(multi.items.map(item => item.productName), ['A thu lunch', 'A fri lunch', 'B mon lunch']);
  assert.deepEqual(multi.fulfilments.map(day => day.date), dates);
  plan.rotationWeeks = { week4: { meals: directMenu('Changed') } };
  assert.equal(purchased.items[0].weeklyPlanSnapshot.meals[0].productName, 'A mon lunch');
  assert.equal(multi.items[2].productName, 'B mon lunch');
  assert.equal(financial({ ...checkout, products: [plan] }).items[0].weeklyPlanSnapshot.meals[0].productName, 'Changed mon lunch');
});

test('dated full week checks the advance window against Monday at checkout', () => {
  const plan = { id: 'rotation', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', available: true, productType: 'weekly_meal_plan', weeklyMenuVersion: 3,
    price: 50, optionGroupIds: [], rotationStartMonday: '2026-07-27', healthyLunchBlockedDates: [], rotationWeeks: { week1: { meals: directMenu('A') } } };
  const limited = { ...store, maximumAdvanceDays: 7 };
  const selected = { ...draft, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: ['03', '04', '05', '06', '07'].map(day => ({ date: `2026-08-${day}`, time: '10:00', itemIndexes: [0] })) };
  const now = new Date('2026-07-29T04:00:00Z');
  const order = financial({ products: [plan], store: limited, draft: selected, now });
  assert.deepEqual(order.fulfilments.map(day => day.date), ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
  assert.throws(() => financial({ products: [plan], store: limited, draft: { ...selected, fulfilments: ['10', '11', '12', '13', '14'].map(day => ({ date: `2026-08-${day}`, time: '10:00', itemIndexes: [0] })) }, now }), /fulfilment date/);
});

test('blocked rotation date refuses a full week and that individual date without shifting next week', () => {
  const plan = { id: 'rotation', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', available: true, productType: 'weekly_meal_plan', weeklyMenuVersion: 3,
    price: 50, optionGroupIds: [], rotationStartMonday: '2026-07-27', healthyLunchBlockedDates: ['2026-07-29'],
    rotationWeeks: { week1: { meals: directMenu('A') }, week2: { meals: directMenu('B') } } };
  const fullDraft = { ...draft, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: ['27','28','29','30','31'].map(day => ({ date: `2026-07-${day}`, time: '10:00', itemIndexes: [0] })) };
  assert.throws(() => financial({ products: [plan], draft: fullDraft, now: new Date('2026-07-26T04:00:00Z') }), /closed|blocked/);
  const dayDraft = { ...draft, selections: [{ productId: plan.id, healthyLunchPlanId: plan.id, healthyLunchDate: '2026-07-29', quantity: 1 }], fulfilments: [{ date: '2026-07-29', time: '10:00', itemIndexes: [0] }] };
  assert.throws(() => financial({ products: [plan], draft: dayDraft, now: new Date('2026-07-26T04:00:00Z') }), /Healthy Lunch|available/);
  plan.healthyLunchBlockedDates = [];
  assert.equal(financial({ products: [plan], draft: dayDraft, now: new Date('2026-07-26T04:00:00Z') }).items[0].productName, 'A wed lunch');
});
