import assert from 'node:assert/strict';
import test from 'node:test';
import { AVAILABLE_DAYS, cartAllowsFulfilmentDate, currentFulfilmentDate, productAllowsFulfilmentDate } from '../../../functions/storeProductAvailability.js';
import { createDefaultWorkspaceStore, getValidPickupDates, normalizeStoreProduct, validateStoreProduct } from './storeModel';
import { buildUpdatedStoreProduct, filterPublicAvailableProducts, getStoreProductEditorDraft } from './storeProductVisibility';
import type { StoreProduct } from './types';

const now = new Date('2026-07-26T04:00:00Z');
const store = { ...createDefaultWorkspaceStore({ id: 'store', name: 'Store', country: 'MY' }, 'owner', now.toISOString()), orderDays: ['monday', 'tuesday', 'friday'] as const };
const configuredDates = getValidPickupDates({ ...store, orderDays: [...store.orderDays] }, now);

test('weekday date lists intersect configured Store days without changing the Store window', () => {
  for (const [day, weekday] of [['mon', 1], ['tue', 2]] as const) {
    const allowed = configuredDates.filter(date => productAllowsFulfilmentDate({ availableDay: day }, date));
    assert.ok(allowed.length > 0);
    assert.ok(allowed.every(date => new Date(`${date}T00:00:00Z`).getUTCDay() === weekday));
  }
  assert.deepEqual(configuredDates.filter(date => productAllowsFulfilmentDate({}, date)), configuredDates);
  assert.deepEqual(configuredDates.filter(date => productAllowsFulfilmentDate({ availableDay: 'all' }, date)), configuredDates);
  assert.deepEqual(configuredDates.filter(date => productAllowsFulfilmentDate({ availableDay: 'wed' }, date)), []);
});

test('mixed weekday meals have no common dates; normal products do not narrow dates', () => {
  const products = [{ id: 'monday', availableDay: 'mon' }, { id: 'tuesday', availableDay: 'tue' }, { id: 'normal' }];
  assert.equal(cartAllowsFulfilmentDate([{ productId: 'monday' }, { productId: 'normal' }], products, '2026-07-27'), true);
  assert.equal(cartAllowsFulfilmentDate([{ productId: 'monday' }, { productId: 'tuesday' }], products, '2026-07-27'), false);
  assert.equal(productAllowsFulfilmentDate({ availableDay: 'mon' }, '2026-02-30'), false);
  assert.equal(productAllowsFulfilmentDate({ availableDay: 'mon' }, ''), false);
  assert.equal(currentFulfilmentDate('Asia/Kuala_Lumpur', new Date('2026-07-26T17:00:00Z')), '2026-07-27');
});

test('Available day survives editing, serialization and reload while public products remain visible', () => {
  const legacy = normalizeStoreProduct('meal', { name: 'Meal', available: true, photoUrl: 'https://example.test/meal.jpg', price: 10, optionGroupIds: [] });
  assert.equal(legacy.availableDay, 'all');
  for (const day of AVAILABLE_DAYS) {
    const draft = { ...getStoreProductEditorDraft(legacy), availableDay: day as StoreProduct['availableDay'] };
    assert.equal(validateStoreProduct(draft), '');
    const saved = buildUpdatedStoreProduct(legacy, draft, now.toISOString());
    const reloaded = normalizeStoreProduct(saved.id, JSON.parse(JSON.stringify(saved)));
    assert.equal(getStoreProductEditorDraft(reloaded).availableDay, day);
    assert.equal(filterPublicAvailableProducts([reloaded], reloaded.storeId).length, 1);
  }
  assert.match(validateStoreProduct({ ...getStoreProductEditorDraft(legacy), availableDay: 'monday' as StoreProduct['availableDay'] }), /Available day/);
});
