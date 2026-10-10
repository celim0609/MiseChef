import assert from 'node:assert/strict';
import test from 'node:test';
import { WEEKLY_DAYS, getWeeklyDates, getWeeklyPickupTimes, validateWeeklyMealPlan, weeklyCartError, buildWeeklyOrderDetails, publicWeeklyFulfilments } from './storeWeeklyMealPlan.js';
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

test('catalogue rejects missing, nested, foreign, hidden, option-bearing and weekday-mismatching meals', () => {
  assert.equal(validateWeeklyMealPlan(plan, products, 's'), '');
  for (const changes of [{ available: false }, { storeId: 'foreign' }, { workspaceId: 'foreign' }, { productType: 'weekly_meal_plan' }, { optionGroupIds: ['options'] }, { availableDay: 'tue' }]) {
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
