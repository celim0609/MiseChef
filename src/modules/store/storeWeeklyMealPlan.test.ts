import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WEEKLY_DAYS, getWeeklyPickupTimes, weeklyCartError } from '../../../functions/storeWeeklyMealPlan.js';
import { createDefaultWorkspaceStore, normalizeStoreProduct, validateStoreProduct, getValidPickupDates, getPickupTimeSlots } from './storeModel';
import { buildUpdatedStoreProduct, getStoreProductEditorDraft } from './storeProductVisibility';
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
  assert.match(editor, /Select Single Product/);
  assert.match(page, /store.delivery\?\.enabled/);
  assert.match(page, /Week starting Monday/);
  assert.match(page, /renderWeeklyMeals\(requestedProduct\)/);
  assert.match(page, /weeklyCheckoutError/);
  assert.match(page, /placedOrder.weeklyFulfilments.map/);
  assert.match(orders, /updateStatus\('Completed', day.day\)/);
  assert.match(orders, /&& !selectedOrder.weeklyFulfilments/);
});
