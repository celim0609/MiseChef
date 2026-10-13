import assert from 'node:assert/strict';
import test from 'node:test';
import { WEEKLY_DAYS, getWeeklyDates, buildWeeklyDeliverySchedule, getWeeklyPickupTimes, validateWeeklyMealPlan, weeklyCartError, buildWeeklyOrderDetails, publicWeeklyFulfilments } from './storeWeeklyMealPlan.js';
import { getValidPickupDates, getPickupTimeSlots } from './storePaymentsCore.js';

const now = new Date('2026-07-26T04:00:00Z');
const store = { id: 's', workspaceId: 's', country: 'MY', orderDays: ['monday','tuesday','wednesday','thursday','friday'], earliestPickupDays: 0, maximumAdvanceDays: 14, unavailableDates: [], pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Kitchen' }], pickupOperatingHours: { start: '10:00', end: '18:00' } };
const meals = WEEKLY_DAYS.map(day => ({ id: day, storeId: 's', workspaceId: 's', name: `${day} meal`, photoUrl: `${day}.jpg`, available: true, availableDay: day, optionGroupIds: [] }));
const plan = { id: 'plan', storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', available: true, optionGroupIds: [], weeklyMeals: Object.fromEntries(WEEKLY_DAYS.map(day => [day, day])) };
const products = [...meals, plan];
const draft = { pickupDate: '2026-07-27', pickupTime: '10:00', pickupLocationId: 'counter', selections: [{ productId: 'plan', quantity: 2, selectedOptions: [] }] };
const build = (overrides = {}) => buildWeeklyOrderDetails({ store, draft, products, now, getDates: getValidPickupDates, getTimes: getPickupTimeSlots, ...overrides });

test('weekly dates require a real Monday and cross month/year boundaries correctly', () => {
  assert.deepEqual(getWeeklyDates('2026-12-28'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01']);
  for (const invalid of ['', '2026-07-28', '2026-02-30', '2026-7-27']) assert.deepEqual(getWeeklyDates(invalid), []);
});

test('weekly slots respect every Store day, blocked date, time and advance window', () => {
  assert.ok(getWeeklyPickupTimes(store, draft.pickupDate, getValidPickupDates, getPickupTimeSlots, now).includes('10:00'));
  for (const changed of [{ ...store, unavailableDates: ['2026-07-29'] }, { ...store, orderDays: ['monday','tuesday','thursday','friday'] }, { ...store, maximumAdvanceDays: 7 }]) {
    const monday = changed.maximumAdvanceDays === 7 ? '2026-08-03' : draft.pickupDate;
    assert.deepEqual(getWeeklyPickupTimes(changed, monday, getValidPickupDates, getPickupTimeSlots, now), []);
  }
  assert.throws(() => build({ draft: { ...draft, pickupTime: '08:00' } }), /all five days/);
});

test('catalogue rejects missing, nested, foreign, hidden, option-bearing meals', () => {
  assert.equal(validateWeeklyMealPlan(plan, products, 's'), '');
  for (const changes of [{ available: false }, { storeId: 'foreign' }, { workspaceId: 'foreign' }, { productType: 'weekly_meal_plan' }, { optionGroupIds: ['options'] }]) {
    assert.ok(validateWeeklyMealPlan(plan, [{ ...meals[0], ...changes }, ...products.slice(1)], 's'));
  }
  assert.ok(validateWeeklyMealPlan({ ...plan, weeklyMeals: { mon: 'mon' } }, products, 's'));
  assert.ok(validateWeeklyMealPlan({ ...plan, weeklyMeals: { ...plan.weeklyMeals, sat: 'mon' } }, products, 's'));
  assert.ok(validateWeeklyMealPlan(plan, products.filter(product => product.id !== 'wed'), 's'));
  assert.ok(validateWeeklyMealPlan({ ...plan, weeklyMeals: { ...plan.weeklyMeals, mon: 'plan' } }, products, 's'));
});

test('weekly checkout rejects mixed carts, multiple plans, Sets, options, groups and delivery', () => {
  for (const selections of [ [...draft.selections, { productId: 'mon' }], [...draft.selections, ...draft.selections], [{ ...draft.selections[0], setId: 'set' }], [{ ...draft.selections[0], selectedOptions: [{ groupId: 'g' }] }], [{ ...draft.selections[0], selectedSetItems: [{ productId: 'mon' }] }] ]) {
    assert.ok(weeklyCartError(selections, products));
    assert.throws(() => build({ draft: { ...draft, selections } }), /alone/);
  }
  for (const changes of [{ fulfilmentMethod: 'delivery' }, { deliverySnapshot: { fulfilmentMode: 'instant' } }, { groupShareCode: 'group' }]) assert.throws(() => build({ draft: { ...draft, ...changes } }), /pickup-only/);
  assert.throws(() => build({ groupOrder: { id: 'group' } }), /pickup-only/);
  assert.throws(() => build({ draft: { ...draft, pickupLocationId: 'foreign' } }), /location/);
  assert.equal(build({ draft: { ...draft, selections: [{ productId: 'mon', quantity: 1 }] } }), null);
});

test('immutable snapshots contain five same-time/location meals and quantity complete plans', () => {
  const result = build();
  assert.equal(result.weeklyPlanSnapshot.meals.length, 5);
  assert.equal(result.weeklyFulfilments.length, 5);
  assert.deepEqual(result.weeklyCompletion, {});
  for (const [index, entry] of result.weeklyFulfilments.entries()) {
    assert.equal(entry.date, `2026-07-${27 + index}`);
    assert.equal(entry.quantity, 2); assert.equal(entry.pickupTime, '10:00'); assert.equal(entry.pickupLocationId, 'counter');
  }
  const before = JSON.stringify(result);
  const previousName = meals[0].name;
  meals[0].name = 'Changed after purchase';
  assert.equal(JSON.stringify(result), before);
  meals[0].name = previousName;
  const publicDays = publicWeeklyFulfilments({ ...result, weeklyCompletion: { mon: { completedBy: 'secret-operator' } } });
  assert.equal(publicDays[0].completed, true);
  assert.equal(JSON.stringify(publicDays).includes('productId'), false);
  assert.equal(JSON.stringify(publicDays).includes('secret-operator'), false);
});

test('a Monday inside the preorder window is unavailable if its Friday falls outside it', () => {
  const limited = { ...store, maximumAdvanceDays: 7 };
  const wednesday = new Date('2026-07-29T04:00:00Z');
  assert.ok(getValidPickupDates(limited, wednesday).includes('2026-08-03'));
  assert.equal(getValidPickupDates(limited, wednesday).includes('2026-08-07'), false);
  assert.deepEqual(getWeeklyPickupTimes(limited, '2026-08-03', getValidPickupDates, getPickupTimeSlots, wednesday), []);
});

test('weekly mapping overrides standalone weekday while one delivery time covers every assigned day', () => {
  const changed = products.map(product => product.id === 'thu' ? { ...product, availableDay: 'tue' } : product);
  assert.equal(validateWeeklyMealPlan(plan, changed, 's'), '');
  assert.equal(build({ products: changed }).weeklyFulfilments[3].productId, 'thu');
  for (const time of ['09:00', '13:30']) {
    const schedule = buildWeeklyDeliverySchedule('2026-07-27', time);
    assert.deepEqual(schedule.map(entry => entry.date), getWeeklyDates('2026-07-27'));
    assert.ok(schedule.every(entry => entry.time === time && entry.itemIndexes[0] === 0));
  }
  assert.throws(() => buildWeeklyDeliverySchedule('2026-07-28', '10:00'), /Monday/);
});


test('weekly pickup excludes a Monday moved behind the cut-off', () => {
  const cutoffStore = { country: 'MY', orderDays: ['monday','tuesday','wednesday','thursday','friday'], earliestPickupDays: 1, maximumAdvanceDays: 14, unavailableDates: [], orderCutoffTime: '18:00', pickupOperatingHours: { start: '10:00', end: '18:00' } };
  assert.ok(getWeeklyPickupTimes(cutoffStore, '2026-10-12', getValidPickupDates, getPickupTimeSlots, new Date('2026-10-11T10:00:00Z')).length);
  assert.deepEqual(getWeeklyPickupTimes(cutoffStore, '2026-10-12', getValidPickupDates, getPickupTimeSlots, new Date('2026-10-11T10:00:01Z')), []);
});

test('dated full-week cutoff is Sunday Store-local time, inclusive to the millisecond, independent of earliest days', async () => {
  const { isDatedWeekOpen, fullWeekDateStore } = await import('./storeWeeklyMealPlan.js');
  for (const country of ['MY', 'SG']) for (const earliestPickupDays of [0, 1, 7]) {
    const settings = { ...store, country, earliestPickupDays, orderCutoffTime: '18:00' };
    assert.equal(isDatedWeekOpen(settings, '2026-10-19', new Date('2026-10-18T09:59:59.999Z')), true);
    assert.equal(isDatedWeekOpen(settings, '2026-10-19', new Date('2026-10-18T10:00:00.000Z')), true);
    assert.equal(isDatedWeekOpen(settings, '2026-10-19', new Date('2026-10-18T10:00:00.001Z')), false);
    assert.equal(isDatedWeekOpen(settings, '2026-10-19', new Date('2026-10-19T00:00:00Z')), false);
    assert.equal(fullWeekDateStore(settings, { weeklyWeeks: {} }).earliestPickupDays, 0);
    assert.equal(settings.earliestPickupDays, earliestPickupDays);
  }
});

test('unset full-week cutoff closes at Monday midnight, including month and year boundaries', async () => {
  const { isDatedWeekOpen, weekRangeLabel } = await import('./storeWeeklyMealPlan.js');
  for (const orderCutoffTime of [undefined, null, '']) {
    assert.equal(isDatedWeekOpen({ ...store, orderCutoffTime }, '2026-10-19', new Date('2026-10-18T15:59:59.999Z')), true);
    assert.equal(isDatedWeekOpen({ ...store, orderCutoffTime }, '2026-10-19', new Date('2026-10-18T16:00:00.000Z')), false);
  }
  assert.equal(isDatedWeekOpen({ ...store, orderCutoffTime: '00:00' }, '2027-01-04', new Date('2027-01-02T16:00:00Z')), true);
  assert.equal(isDatedWeekOpen({ ...store, orderCutoffTime: '00:00' }, '2027-01-04', new Date('2027-01-02T16:00:00.001Z')), false);
  assert.equal(weekRangeLabel('2026-10-19'), '19–23 Oct');
  assert.equal(weekRangeLabel('2026-12-28'), '28 Dec–1 Jan');
});

test('four distinct dated menus resolve by date and reject malformed slots and foreign references', async () => {
  const { resolveWeeklyMeals, validateWeeklyStructure } = await import('./storeWeeklyMealPlan.js');
  const weeklyWeeks = Object.fromEntries(['2026-07-27','2026-08-03','2026-08-10','2026-08-17'].map((startMonday, index) => [`week${index + 1}`, { startMonday, meals: plan.weeklyMeals }]));
  const dated = { ...plan, weeklyMeals: undefined, weeklyWeeks };
  assert.equal(validateWeeklyMealPlan(dated, [...meals, dated], 's'), '');
  assert.deepEqual(resolveWeeklyMeals(dated, '2026-08-10'), plan.weeklyMeals);
  assert.equal(resolveWeeklyMeals(dated, '2026-08-24'), undefined);
  assert.deepEqual(resolveWeeklyMeals(plan, '2026-08-24'), plan.weeklyMeals);
  for (const invalid of [{}, { week5: weeklyWeeks.week1 }, { week1: { ...weeklyWeeks.week1, startMonday: '2026-07-28' } }, { week1: weeklyWeeks.week1, week2: weeklyWeeks.week1 }, { week1: { ...weeklyWeeks.week1, meals: { mon: 'mon' } } }]) assert.ok(validateWeeklyStructure({ ...dated, weeklyWeeks: invalid }));
  assert.ok(validateWeeklyMealPlan(dated, [{ ...meals[0], storeId: 'foreign' }, ...meals.slice(1), dated], 's'));
});

const embeddedMeals = () => Object.fromEntries(WEEKLY_DAYS.map((day, index) => [day, {
  photoUrl: `https://example.test/${day}.jpg`, name: `${day} embedded lunch`, price: 11 + index,
  calories: 400 + index, description: `${day} ingredients`
}]));
const embeddedPlan = () => ({ ...plan, weeklyMeals: undefined, weeklyMenuVersion: 2,
  weeklyWeeks: { week2: { startMonday: '2026-07-27', meals: embeddedMeals() } } });

test('embedded menu accepts any one to four slots, resolves by actual Monday, and needs no Single Products', async () => {
  const { resolveHealthyLunchDay, datedWeeks, validateWeeklyStructure } = await import('./storeWeeklyMealPlan.js');
  for (const slots of [['week2'], ['week1','week2'], ['week1','week3'], ['week1','week2','week3','week4']]) {
    const dated = embeddedPlan();
    dated.weeklyWeeks = Object.fromEntries(slots.map((slot, index) => [slot, { startMonday: ['2026-08-17','2026-08-10','2026-08-03','2026-07-27'][index], meals: embeddedMeals() }]));
    assert.equal(validateWeeklyMealPlan(dated, [dated], 's'), '');
    assert.equal(datedWeeks(dated).length, slots.length);
    assert.deepEqual(datedWeeks(dated).map(week => week.startMonday), Object.values(dated.weeklyWeeks).map(week => week.startMonday).sort());
  }
  const dated = embeddedPlan();
  const meal = resolveHealthyLunchDay(dated, [dated], '2026-07-29');
  assert.equal(meal.name, 'wed embedded lunch'); assert.equal(meal.price, 13); assert.equal(meal.calories, 402);
  assert.equal(resolveHealthyLunchDay(dated, [dated], '2026-08-05'), undefined);
  assert.ok(validateWeeklyStructure({ ...dated, weeklyWeeks: {} }));
  assert.ok(validateWeeklyStructure({ ...dated, weeklyWeeks: undefined }));
});

test('embedded validation rejects incomplete meals, invalid prices, dates and version mixing', async () => {
  const { validateWeeklyStructure } = await import('./storeWeeklyMealPlan.js');
  for (const change of [{ name: '' }, { photoUrl: '' }, { price: -1 }, { price: NaN }, { price: '12' }, { calories: -1 }, { calories: 1.5 }, { description: 'x'.repeat(1201) }, { unknown: true }]) {
    const dated = embeddedPlan(); dated.weeklyWeeks.week2.meals.mon = { ...dated.weeklyWeeks.week2.meals.mon, ...change };
    assert.ok(validateWeeklyStructure(dated));
  }
  const optional = embeddedPlan(); delete optional.weeklyWeeks.week2.meals.mon.calories; delete optional.weeklyWeeks.week2.meals.mon.description;
  assert.equal(validateWeeklyStructure(optional), '');
  assert.ok(validateWeeklyStructure({ ...optional, weeklyMenuVersion: 3 }));
  assert.ok(validateWeeklyStructure({ ...optional, weeklyMenuVersion: undefined }));
  assert.ok(validateWeeklyStructure({ ...optional, weeklyWeeks: { week2: { startMonday: '2026-07-28', meals: embeddedMeals() } } }));
  assert.ok(validateWeeklyStructure({ ...optional, weeklyWeeks: { week2: optional.weeklyWeeks.week2, week4: optional.weeklyWeeks.week2 } }));
});
