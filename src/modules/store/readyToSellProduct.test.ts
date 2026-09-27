import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Recipe } from '../../types';
import { getReadyToSellProductDraft } from './storeProductVisibility';

const recipe: Pick<Recipe, 'id' | 'title' | 'sellingPrice' | 'calories' | 'costing'> = {
  id: 'recipe-laksa',
  title: ' Laksa Noodles ',
  sellingPrice: 12.5,
  calories: 420
};

test('Ready to Sell opens a new Store Product draft with only sellable Recipe fields', () => {
  assert.deepEqual(getReadyToSellProductDraft(recipe), {
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
    calories: 510,
    costing: {
      totalRecipeCost: 6,
      costPerPortion: 3,
      sellingPrice: 18,
      foodCostPercentage: 16.67,
      grossProfitPercentage: 83.33,
      breakdown: [],
      lastCalculatedAt: '2026-09-27T00:00:00.000Z'
    }
  });

  assert.equal(draft.price, 18);
  assert.equal(draft.calories, 510);
  assert.deepEqual(Object.keys(draft).sort(), [
    'available', 'calories', 'description', 'name', 'optionGroupIds', 'photoUrl', 'price', 'recipeId'
  ]);
});

test('Ready to Sell leaves calories absent when the Recipe has none', () => {
  const draft = getReadyToSellProductDraft({ ...recipe, calories: undefined });

  assert.equal(draft.calories, undefined);
});

test('Ready to Sell sends a carried Recipe photo through the existing Store Product upload path', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

  assert.match(source, /loadRecipePhotoForStoreProduct\(\{ recipeId: recipe\.id, photoUrl \}\)/);
  assert.match(source, /uploadStoreProductPhoto\(\{ workspaceId: workspace\.id, productId, file: productPhotoFile \}\)/);
  assert.match(source, /uploadStoreProductSocialImage\(\{ workspaceId: workspace\.id, productId, file: productPhotoFile \}\)/);
  assert.doesNotMatch(source, /photoUrl: recipe\.(?:imageUrl|coverImage)/);
});
