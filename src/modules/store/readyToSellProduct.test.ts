import assert from 'node:assert/strict';
import test from 'node:test';
import type { Recipe } from '../../types';
import { getReadyToSellProductDraft } from './storeProductVisibility';

const recipe: Pick<Recipe, 'id' | 'title' | 'sellingPrice' | 'costing'> = {
  id: 'recipe-laksa',
  title: ' Laksa Noodles ',
  sellingPrice: 12.5
};

test('Ready to Sell opens a new Store Product draft with only sellable Recipe fields', () => {
  assert.deepEqual(getReadyToSellProductDraft(recipe), {
    photoUrl: '',
    name: 'Laksa Noodles',
    description: '',
    price: 12.5,
    recipeId: 'recipe-laksa',
    available: true,
    optionGroupIds: []
  });
});

test('Ready to Sell snapshots Recipe selling price without copying costing data', () => {
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
  });

  assert.equal(draft.price, 18);
  assert.deepEqual(Object.keys(draft).sort(), [
    'available', 'description', 'name', 'optionGroupIds', 'photoUrl', 'price', 'recipeId'
  ]);
});
