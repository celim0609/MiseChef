import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Recipe } from '../../types';
import { getReadyToSellProductDraft, getStoreProductEditorDraft, buildUpdatedStoreProduct } from './storeProductVisibility';

const recipe: Pick<Recipe, 'id' | 'title' | 'sellingPrice' | 'costing'> = {
  id: 'recipe-laksa',
  title: ' Laksa Noodles ',
  sellingPrice: 12.5
};

const completeNutrition = { status: 'COMPLETE' as const, totalKcal: 840, kcalPerServing: 420, incompleteReasons: [] };

test('Ready to Sell opens a new Store Product draft with only sellable Recipe fields', () => {
  assert.deepEqual(getReadyToSellProductDraft(recipe, completeNutrition), {
    photoUrl: '',
    name: 'Laksa Noodles',
    description: '',
    price: 12.5,
    calories: 420,
    recipeId: 'recipe-laksa',
    available: true,
    optionGroupIds: []
  });
});

test('Ready to Sell snapshots public Recipe values without copying costing data', () => {
  const draft = getReadyToSellProductDraft({
    ...recipe,
    sellingPrice: 18,
    costing: {
      totalRecipeCost: 6,
      costPerPortion: 3,
      sellingPrice: 18,
      foodCostPercentage: 16.67,
      grossProfitPercentage: 83.33,
      breakdown: [],
      lastCalculatedAt: '2026-09-27T00:00:00.000Z'
    }
  }, { ...completeNutrition, totalKcal: 1020, kcalPerServing: 510 });

  assert.equal(draft.price, 18);
  assert.equal(draft.calories, 510);
  assert.deepEqual(Object.keys(draft).sort(), [
    'available', 'calories', 'description', 'name', 'optionGroupIds', 'photoUrl', 'price', 'recipeId'
  ]);
});

test('Ready to Sell leaves calories absent when Recipe nutrition is incomplete', () => {
  const draft = getReadyToSellProductDraft(recipe, { status: 'INCOMPLETE', incompleteReasons: ['Flour: nutrition profile is required.'] });

  assert.equal(draft.calories, undefined);
});

test('Ready to Sell sends a carried Recipe photo through the existing Store Product upload path', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

  assert.match(source, /loadRecipePhotoForStoreProduct\(\{ recipeId: recipe\.id, photoUrl \}\)/);
  assert.match(source, /uploadStoreProductPhoto\(\{ workspaceId: workspace\.id, productId, file: productPhotoFile \}\)/);
  assert.match(source, /uploadStoreProductSocialImage\(\{ workspaceId: workspace\.id, productId, file: productPhotoFile \}\)/);
  assert.doesNotMatch(source, /photoUrl: recipe\.(?:imageUrl|coverImage)/);
});

test('Ready to Sell remains available with estimated nutrition', () => {
  const draft = getReadyToSellProductDraft(recipe, {
    status: 'ESTIMATED', totalKcal: 800, kcalPerServing: 400,
    calculatedIngredientCount: 8, totalIngredientCount: 9,
    incompleteReasons: ['Ginger nutrition data unavailable']
  });
  assert.equal(draft.recipeId, recipe.id);
  assert.equal(draft.price, 12.5);
  assert.equal(draft.available, true);
});

test('manual photos invalidate pending transfers and stale nutrition cannot reset another draft', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const manual = source.slice(source.indexOf('const handleProductPhotoChange'), source.indexOf('const handleSetUpStore'));
  assert.match(manual, /productPhotoTransferIdRef.current \+= 1/);
  assert.match(manual, /readImageFile\(event, setProductPhotoFile\)/);
  assert.match(source, /if \(productPhotoTransferIdRef.current !== transferId\) return;\s*setProductDraft/);
  assert.match(source, /if \(productPhotoTransferIdRef.current === transferId\) setProductPhotoFile\(photo\)/);
});

test('estimated calories remain absent rather than becoming a complete Product value', () => {
  assert.equal(getReadyToSellProductDraft(recipe, { status: 'ESTIMATED', totalKcal: 800, kcalPerServing: 400, incompleteReasons: ['Missing data'] }).calories, undefined);
});

test('Ready to Sell carries Partial kcal as clearly labelled editable public description', () => {
  const draft = getReadyToSellProductDraft(recipe, { status: 'ESTIMATED', totalKcal: 80, kcalPerServing: 8.275862, incompleteReasons: ['Missing food'] });
  assert.match(draft.description, /Partial nutrition \(estimated\): 8.3 kcal per serving/);
  assert.equal(draft.calories, undefined);
  assert.equal(draft.photoUrl, '');
  const saved = buildUpdatedStoreProduct({ ...draft, id: 'product', workspaceId: 'workspace', storeId: 'store', createdAt: '', updatedAt: '' } as import('./types').StoreProduct, { ...draft, description: 'My manual product description', calories: 100 }, 'now');
  const reopened = getStoreProductEditorDraft(saved);
  assert.equal(reopened.description, 'My manual product description');
  assert.equal(reopened.calories, 100);
  for (const value of [undefined, NaN, Infinity, -1]) {
    assert.equal(getReadyToSellProductDraft(recipe, { status: 'ESTIMATED', kcalPerServing: value, incompleteReasons: [] }).description, '');
  }
});
