import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WEEKLY_DAYS, getWeeklyPickupTimes, weeklyCartError } from '../../../functions/storeWeeklyMealPlan.js';
import { createDefaultWorkspaceStore, normalizeStoreProduct, validateStoreProduct, getValidPickupDates, getPickupTimeSlots } from './storeModel';
import { buildUpdatedStoreProduct, getStoreProductEditorDraft, prepareHealthyLunchDraft, updateHealthyLunchMeal } from './storeProductVisibility';
import type { WeeklyMeals } from './types';

const weeklyMeals = Object.fromEntries(WEEKLY_DAYS.map(day => [day, `meal-${day}`])) as WeeklyMeals;
const legacy = normalizeStoreProduct('plan', { storeId: 's', workspaceId: 's', name: 'Weekly lunch', price: 100, photoUrl: 'photo.jpg', available: true, optionGroupIds: [] });

test('missing Product Type preserves Single Product behavior and weekly save/reload preserves references', () => {
  assert.equal(legacy.productType ?? 'single', 'single');
  assert.equal(validateStoreProduct(getStoreProductEditorDraft(legacy)), '');
  const draft = { ...getStoreProductEditorDraft(legacy), productType: 'weekly_meal_plan' as const, weeklyMeals };
  assert.equal(validateStoreProduct(draft), '');
  const saved = buildUpdatedStoreProduct(legacy, draft, '2026-07-26T00:00:00Z');
  const reloaded = normalizeStoreProduct(saved.id, JSON.parse(JSON.stringify(saved)));
  assert.equal(reloaded.productType, 'weekly_meal_plan');
  assert.deepEqual(getStoreProductEditorDraft(reloaded).weeklyMeals, weeklyMeals);
  assert.notEqual(getStoreProductEditorDraft(reloaded).weeklyMeals, reloaded.weeklyMeals);
  assert.match(validateStoreProduct({ ...draft, optionGroupIds: ['g'] }), /options/);
  assert.match(validateStoreProduct({ ...draft, availableDay: 'mon' }), /Available day/);
  assert.match(validateStoreProduct({ ...draft, productType: 'single' }), /Single Products/);
  assert.equal(buildUpdatedStoreProduct(reloaded, { ...getStoreProductEditorDraft(legacy), productType: 'single' }, 'later').weeklyMeals, undefined);
});

test('client date filtering and mixed-cart blocking reuse shared server validation', () => {
  const store = createDefaultWorkspaceStore({ id: 's', name: 'Store', country: 'MY' }, 'owner', '2026-07-26T00:00:00Z');
  const now = new Date('2026-07-26T04:00:00Z');
  const mondays = getValidPickupDates(store, now).filter(date => getWeeklyPickupTimes(store, date, getValidPickupDates, getPickupTimeSlots, now).length);
  assert.ok(mondays.length);
  assert.ok(mondays.every(date => new Date(`${date}T00:00:00Z`).getUTCDay() === 1));
  assert.ok(weeklyCartError([{ productId: 'plan' }, { productId: 'single' }], [{ id: 'plan', productType: 'weekly_meal_plan' }]));
});

test('public and merchant UI wire weekly schedule controls and preserve legacy daily completion', () => {
  const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const orders = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');
  assert.match(editor, /aria-label="Product Type"/);
  assert.match(editor, /Single-day price/);
  assert.doesNotMatch(editor, /Select Single Product/);
  assert.match(page, /store.delivery\?\.enabled/);
  assert.match(page, /5-Day Plan dates/);
  assert.match(page, /renderWeeklyMeals\(requestedProduct\)/);
  assert.match(page, /weeklyCheckoutError/);
  assert.match(page, /placedOrder.weeklyFulfilments.map/);
  assert.match(orders, /updateStatus\('Completed', day.day\)/);
  assert.match(orders, /&& !selectedOrder.weeklyFulfilments/);
});

test('weekly and selected-day UI is read-only per meal and uses one shared time for pickup and delivery', () => {
  const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /groupFulfilmentSchedule\(applySharedTime\(/);
  assert.match(page, /fulfilmentMethod === 'delivery' \? deliveryTime : pickupTime/);
  assert.match(page, /!weeklyCartPlan && group.dates.length > 1/);
  assert.match(page, /'Weekly schedule' : 'Selected days'/);
  assert.doesNotMatch(page, /aria-label=\{`(?:Time|Date) for \$\{row.label\}/);
  assert.doesNotMatch(page, /fulfilment\(s\)|One order and one payment|Choose each day's time below|>Fulfilment</);
  assert.match(page, /sharedPickupTimes.map/);
  assert.match(page, /deliveryFeeLabel\(proposedFulfilments\?\.length \|\| 1\)/);
});

test('ordinary single-product checkout keeps original date/time controls without the weekly schedule', () => {
  const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /usesScheduledCheckout\(cart.length, Boolean\(weeklyCartPlan\)/);
  assert.match(page, /!groupOrder && !multiScheduleEnabled && <label/);
  assert.match(page, /!multiScheduleEnabled && <label[^]*?aria-label="Delivery time"/);
  assert.match(page, /aria-label="Pickup date"/);
  assert.match(page, /aria-label="Delivery date"/);
  assert.match(page, /if \(multiScheduleEnabled\) \{/);
  assert.match(page, /multiScheduleEnabled && <section aria-label=\{weeklyCartPlan/);
});


test('weekly pickup excludes a Monday moved behind the cut-off', () => {
  const cutoffStore = { country: 'MY', orderDays: ['monday','tuesday','wednesday','thursday','friday'], earliestPickupDays: 1, maximumAdvanceDays: 14, unavailableDates: [], orderCutoffTime: '18:00', pickupOperatingHours: { start: '10:00', end: '18:00' } };
  assert.ok(getWeeklyPickupTimes(cutoffStore, '2026-10-12', getValidPickupDates, getPickupTimeSlots, new Date('2026-10-11T10:00:00Z')).length);
  assert.deepEqual(getWeeklyPickupTimes(cutoffStore, '2026-10-12', getValidPickupDates, getPickupTimeSlots, new Date('2026-10-11T10:00:01Z')), []);
});

test('dated weeks survive create/edit/reload without aliasing and old menus stay recurring until dated', () => {
  const weeklyWeeks = { week1: { startMonday: '2026-10-19', meals: weeklyMeals }, week4: { startMonday: '2026-11-09', meals: { ...weeklyMeals, mon: 'other-mon' } } };
  const draft = { ...getStoreProductEditorDraft(legacy), productType: 'weekly_meal_plan' as const, weeklyWeeks };
  assert.equal(validateStoreProduct(draft), '');
  const saved = buildUpdatedStoreProduct(legacy, draft, 'now');
  const reloaded = normalizeStoreProduct(saved.id, JSON.parse(JSON.stringify(saved)));
  const edited = getStoreProductEditorDraft(reloaded);
  assert.deepEqual(edited.weeklyWeeks, weeklyWeeks);
  edited.weeklyWeeks!.week1!.meals.mon = 'changed';
  assert.equal(reloaded.weeklyWeeks!.week1!.meals.mon, weeklyMeals.mon);
  assert.equal(buildUpdatedStoreProduct(reloaded, getStoreProductEditorDraft(legacy), 'later').weeklyWeeks, undefined);
  assert.equal(getStoreProductEditorDraft(normalizeStoreProduct('old', { ...saved, weeklyWeeks: undefined, weeklyMeals })).weeklyWeeks, undefined);
  assert.match(validateStoreProduct({ ...draft, productType: 'single' }), /Single Products/);
});

test('embedded drafts omit empty weeks, keep Week 2 alone, and preserve direct meals through save/reload', async () => {
  const { prepareHealthyLunchDraft, getEmbeddedHealthyLunchDraft } = await import('./storeProductVisibility');
  const meals = Object.fromEntries(WEEKLY_DAYS.map(day => [day, { name: ` ${day} direct `, photoUrl: `https://example.test/${day}.jpg`, price: 12, calories: 0 }])) as import('./types').EmbeddedWeeklyMeals;
  const draft = prepareHealthyLunchDraft({ ...getStoreProductEditorDraft(legacy), productType: 'weekly_meal_plan', weeklyMenuVersion: 2, photoUrl: '', weeklyWeeks: { week1: { startMonday: '', meals }, week2: { startMonday: '2026-10-19', meals } } });
  assert.equal(validateStoreProduct(draft), '');
  assert.deepEqual(Object.keys(draft.weeklyWeeks!), ['week2']);
  assert.equal(draft.photoUrl, 'https://example.test/mon.jpg');
  const saved = buildUpdatedStoreProduct(legacy, draft, 'now');
  const loaded = normalizeStoreProduct(saved.id, JSON.parse(JSON.stringify(saved)));
  assert.equal(loaded.weeklyMenuVersion, 2);
  const edited = getEmbeddedHealthyLunchDraft(loaded, []);
  assert.deepEqual(edited.weeklyWeeks, draft.weeklyWeeks);
  (edited.weeklyWeeks!.week2!.meals as import('./types').EmbeddedWeeklyMeals).mon.name = 'Changed';
  assert.equal((loaded.weeklyWeeks!.week2!.meals as import('./types').EmbeddedWeeklyMeals).mon.name, 'mon direct');
  assert.match(validateStoreProduct(prepareHealthyLunchDraft({ ...draft, weeklyWeeks: { week3: { startMonday: '', meals } } })), /at least one/);
});

test('embedded meals accept manual and linked Recipes, remove cleared links, and reject invalid links', () => {
  const meals = Object.fromEntries(WEEKLY_DAYS.map(day => [day, {
    photoUrl: `https://example.test/${day}.jpg`, name: `${day} lunch`, price: 12
  }])) as import('./types').EmbeddedWeeklyMeals;
  const draft = { ...getStoreProductEditorDraft(legacy), productType: 'weekly_meal_plan' as const,
    weeklyMenuVersion: 2 as const, weeklyWeeks: { week2: { startMonday: '2026-10-19', meals } } };
  const validates = () => validateStoreProduct(prepareHealthyLunchDraft(draft));
  assert.equal(validates(), '');

  meals.mon = updateHealthyLunchMeal(meals.mon, { recipeId: 'recipe-1' });
  assert.equal(validates(), '');
  assert.equal((buildUpdatedStoreProduct(legacy, prepareHealthyLunchDraft(draft), 'now').weeklyWeeks!.week2!.meals.mon as import('./types').HealthyLunchMeal).recipeId, 'recipe-1');

  meals.mon = updateHealthyLunchMeal(meals.mon, { recipeId: undefined });
  assert.equal(Object.hasOwn(meals.mon, 'recipeId'), false);
  assert.equal(validates(), '');

  for (const invalid of ['', '  ', 123, null, undefined]) {
    meals.mon = { ...meals.mon, recipeId: invalid } as import('./types').HealthyLunchMeal;
    assert.match(validates(), /Each week needs a distinct Monday and five meals/);
  }
});

test('converting referenced menus copies meal values into a draft without modifying products or old menu data', async () => {
  const { getEmbeddedHealthyLunchDraft } = await import('./storeProductVisibility');
  const sourceMeals = WEEKLY_DAYS.map(day => ({ ...legacy, id: `meal-${day}`, name: `${day} meal`, price: 12, calories: 450, description: 'Vegetables' }));
  const old = { ...legacy, productType: 'weekly_meal_plan' as const, weeklyMeals };
  const dated = { ...old, weeklyWeeks: { week3: { startMonday: '2026-10-19', meals: weeklyMeals } } };
  const before = JSON.stringify([dated, sourceMeals]);
  const converted = getEmbeddedHealthyLunchDraft(dated, sourceMeals);
  assert.equal(converted.weeklyMenuVersion, 2); assert.equal(converted.weeklyMeals, undefined);
  assert.equal((converted.weeklyWeeks!.week3!.meals as import('./types').EmbeddedWeeklyMeals).mon.name, 'mon meal');
  assert.equal(JSON.stringify([dated, sourceMeals]), before);
  const undated = getEmbeddedHealthyLunchDraft(old, sourceMeals);
  assert.equal(undated.weeklyWeeks!.week1!.startMonday, '');
  assert.equal((undated.weeklyWeeks!.week1!.meals as import('./types').EmbeddedWeeklyMeals).mon.price, 12);
  assert.equal(getStoreProductEditorDraft(old).weeklyMenuVersion, undefined);
});
