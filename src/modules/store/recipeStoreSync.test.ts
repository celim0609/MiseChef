import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Recipe } from '../../types';
import { calculateRecipeNutrition } from '../nutrition/services/recipeNutritionCalculator';
import { getReadyToSellProductDraft, getStoreProductEditorDraft, buildUpdatedStoreProduct } from './storeProductVisibility';
import { normalizeStoreProduct, validateStoreProduct } from './storeModel';
import { loadRecipePhotoForStoreProduct } from './recipeProductPhoto';

const soy = { id: 'soy', workspaceId: 'a', title: 'Seasoning Soy', ingredients: [{ id: 'food', ingredientId: 'food', name: 'Soy', qty: '100', unit: 'g' }], servings: 8, nutritionYield: { quantity: 290, unit: 'g' } } as Recipe;
const parent = { id: 'bowl', workspaceId: 'a', title: 'Bowl', servings: 2, sellingPrice: 12, ingredients: [], linkedRecipes: [{ id: 'link', recipeId: 'soy', quantity: 30, unit: 'g' }] } as Recipe;
const profiles = { food: { id: 'food', confirmedBy: 'owner', confirmedAt: '', updatedAt: '', ingredientId: 'food', workspaceId: 'a', kind: 'food', status: 'approved', source: 'chef_override', kcalPer100g: 80 } } as Parameters<typeof calculateRecipeNutrition>[1];

for (const partial of [false, true]) test(`linked Recipe ${partial ? 'Partial' : 'Complete'} per-serving nutrition survives saved Product and reopen`, async () => {
  const child = partial ? { ...soy, ingredients: [...soy.ingredients, { id: 'missing', name: 'Unknown', qty: '1', unit: 'g' }] } : soy;
  const nutrition = calculateRecipeNutrition(parent, profiles, [child]);
  const draft = getReadyToSellProductDraft(parent, nutrition);
  const photo = await loadRecipePhotoForStoreProduct({ recipeId: parent.id, photoUrl: 'https://recipe.test/photo.jpg', fetchImage: async () => new Response(new Blob(['photo'], { type: 'image/jpeg' })) });
  assert.equal(photo.type, 'image/jpeg');
  // The existing uploader returns a public Product URL, not the private Recipe URL.
  const savedDraft = { ...draft, photoUrl: 'https://store.test/product.jpg' };
  assert.equal(validateStoreProduct(savedDraft), '');
  const saved = normalizeStoreProduct('product', JSON.parse(JSON.stringify({ ...savedDraft, workspaceId: 'a', storeId: 'a' })));
  const reopened = getStoreProductEditorDraft(saved);
  assert.equal(reopened.photoUrl, savedDraft.photoUrl);
  assert.equal(reopened.recipeId, parent.id);
  assert.equal(reopened.description, draft.description);
  if (partial) {
    assert.equal(reopened.calories, undefined);
    assert.match(reopened.description, /Partial nutrition \(estimated\): 4.1 kcal per serving/);
  } else {
    assert.equal(reopened.calories, 4); // 80 × 30/290 ÷ 2, rounded by existing Product rules.
    assert.equal(reopened.description, '');
  }
  const edited = buildUpdatedStoreProduct(saved, { ...reopened, photoUrl: 'https://store.test/manual.jpg', calories: 123, description: 'Manual copy' }, 'now');
  const again = getStoreProductEditorDraft(normalizeStoreProduct(saved.id, JSON.parse(JSON.stringify(edited))));
  assert.equal(again.photoUrl, 'https://store.test/manual.jpg');
  assert.equal(again.calories, 123);
  assert.equal(again.description, 'Manual copy');
});

test('missing or invalid saved kcal never becomes zero, while explicit zero remains valid', () => {
  for (const calories of [undefined, null, '', ' ', false, true, NaN, Infinity, -1]) {
    assert.equal(normalizeStoreProduct('legacy', { calories }).calories, undefined);
  }
  assert.equal(normalizeStoreProduct('zero', { calories: 0 }).calories, 0);
  assert.equal(normalizeStoreProduct('legacy-number', { calories: '120' }).calories, 120);
  const legacy = normalizeStoreProduct('legacy', { name: 'Existing', photoUrl: 'https://store.test/old.jpg', description: 'Manual existing copy' });
  assert.equal(getStoreProductEditorDraft(legacy).description, 'Manual existing copy');
  assert.equal(getStoreProductEditorDraft(legacy).photoUrl, 'https://store.test/old.jpg');
});

test('Store surfaces render persisted nutrition and promotional cards retain Partial descriptions', () => {
  const publicPage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  const promo = publicPage.slice(publicPage.indexOf('promotionProducts.map'), publicPage.indexOf('promotion.estimatedPrice !== null'));
  assert.match(promo, /product.description/);
  assert.match(promo, /product.calories !== undefined/);
  const admin = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  assert.match(admin, /product.calories\} kcal per serving/);
  assert.match(admin, /product.description/);
  const service = readFileSync(new URL('./services/storeService.ts', import.meta.url), 'utf8');
  assert.match(service, /description: draft.description.trim\(\)/);
  assert.match(service, /calories: draft.calories/);
});
