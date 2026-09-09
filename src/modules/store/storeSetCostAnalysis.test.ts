import assert from 'node:assert/strict';
import test from 'node:test';
import type { Recipe } from '../../types';
import { normalizeStoreProduct } from './storeModel';
import { resolveStoreProductEstimatedCost } from './storeCostModel';
import { calculateStoreSetAnalysis, getDefaultStoreSetSelections, normalizeStoreSet } from './storeSetModel';
import type { StoreProduct } from './types';

const now = '2026-08-28T00:00:00.000Z';
const costedRecipe = (id: string, cost: number): Recipe => ({
  id, title: id, coverImage: '', category: '', prepTime: 0, servings: 1, yield: '1 portion', difficulty: 'Easy', story: '',
  ingredients: [], method: [], videoLink: '', chefName: '', isSaved: false, collections: [],
  costing: {
    totalRecipeCost: cost, costPerPortion: cost, sellingPrice: 0, foodCostPercentage: 0, grossProfitPercentage: 0,
    breakdown: [{ recipeIngredientId: `${id}-cost`, itemType: 'ingredient', ingredientName: 'Costed ingredient', quantity: 1, unit: 'unit', unitCost: cost, ingredientCost: cost, percentageOfTotalRecipeCost: 100 }],
    lastCalculatedAt: now
  }
});
const product = (id: string, price: number, recipeId?: string): StoreProduct => ({
  id, storeId: 'store', workspaceId: 'store', photoUrl: `${id}.jpg`, name: id, description: '', price,
  ...(recipeId ? { recipeId } : {}), available: true, optionGroupIds: [], createdBy: 'owner', createdAt: now, updatedAt: now
});
const products = [product('main', 8, 'main-recipe'), product('drink', 5, 'drink-recipe')];
const set = normalizeStoreSet('combo', {
  storeId: 'store', workspaceId: 'store', name: 'Combo', description: '', photoUrl: 'combo.jpg', category: '',
  price: 10, available: true, sortOrder: 0, createdBy: 'owner', createdAt: now, updatedAt: now,
  groups: [
    { id: 'main-group', name: 'Main', required: true, selectionCount: 1, sortOrder: 0, options: [{ productId: 'main', priceAdjustment: 0, sortOrder: 0 }] },
    { id: 'drink-group', name: 'Drink', required: true, selectionCount: 1, sortOrder: 1, options: [{ productId: 'drink', priceAdjustment: 0, sortOrder: 0 }] }
  ]
});
const selections = getDefaultStoreSetSelections(set, products);
const recipes = [costedRecipe('main-recipe', 3), costedRecipe('drink-recipe', 2)];

test('linked Store Product resolves the canonical Recipe per-portion cost', () => {
  assert.equal(resolveStoreProductEstimatedCost(products[0], recipes), 3);
});

test('Set estimated cost sums all required default product recipe costs', () => {
  assert.equal(calculateStoreSetAnalysis(set, products, selections, recipes).estimatedCost, 5);
});

test('Set gross profit subtracts resolved recipe costs from Set selling price', () => {
  assert.equal(calculateStoreSetAnalysis(set, products, selections, recipes).grossProfit, 5);
});

test('Set gross margin divides gross profit by Set selling price', () => {
  assert.equal(calculateStoreSetAnalysis(set, products, selections, recipes).grossMargin, 50);
});

test('a missing linked Recipe cost never becomes zero or produces profit metrics', () => {
  const analysis = calculateStoreSetAnalysis(set, products, selections, [recipes[0]]);
  assert.equal(analysis.estimatedCost, null);
  assert.equal(analysis.grossProfit, null);
  assert.equal(analysis.grossMargin, null);
});

test('existing unlinked Store Products remain valid but report unavailable cost', () => {
  const unlinked = normalizeStoreProduct('legacy', {
    storeId: 'store', workspaceId: 'store', photoUrl: 'legacy.jpg', name: 'Legacy', description: '', price: 4,
    estimatedCost: 1.5, available: true, optionGroupIds: [], createdBy: 'owner', createdAt: now, updatedAt: now
  });
  assert.equal(unlinked.recipeId, undefined);
  assert.equal(resolveStoreProductEstimatedCost(unlinked, recipes), null);
});

test('updated Recipe cost is reflected without changing the Store Product', () => {
  const before = calculateStoreSetAnalysis(set, products, selections, recipes);
  const updatedRecipes = [costedRecipe('main-recipe', 4), recipes[1]];
  const after = calculateStoreSetAnalysis(set, products, selections, updatedRecipes);
  assert.equal(before.estimatedCost, 5);
  assert.equal(after.estimatedCost, 6);
  assert.equal(after.grossProfit, 4);
});

test('legacy linkedRecipeId documents resolve through recipeId without a migration', () => {
  const normalized = normalizeStoreProduct('legacy-linked', {
    storeId: 'store', workspaceId: 'store', photoUrl: 'legacy.jpg', name: 'Legacy linked', description: '', price: 8,
    linkedRecipeId: 'main-recipe', linkedRecipeTitle: 'Main', estimatedCost: 99, available: true, optionGroupIds: [],
    createdBy: 'owner', createdAt: now, updatedAt: now
  });
  assert.equal(normalized.recipeId, 'main-recipe');
  assert.equal(resolveStoreProductEstimatedCost(normalized, recipes), 3);
});
