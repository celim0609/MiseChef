import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRecipeNutrition } from './recipeNutritionCalculator';
import { resolveRecipeNutritionIdentity } from './recipeNutritionIdentity';
import type { IngredientNutritionProfile } from '../../../types';
const row = (name: string, qty = '30', unit = 'g', ingredientId?: string) => ({ id: name, name, qty, unit, ingredientId });

test('exact raw fruit aliases resolve verified mass profiles without mutating names or costing links', () => {
  const ingredients = [row('Passion fruit pulp', '30', 'g', 'existing-cost-link'), row('Fresh orange', '20')];
  const before = structuredClone(ingredients);
  const result = calculateRecipeNutrition({ ingredients, servings: 2 }, {});
  assert.equal(resolveRecipeNutritionIdentity('Passion fruit pulp')?.catalogProfileId, '2709248');
  assert.equal(resolveRecipeNutritionIdentity('Fresh orange')?.catalogProfileId, '169097');
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.ingredientBreakdown?.map(item => item.kcal), [29.1, 9.4]);
  assert.equal(result.totalKcal, 38.5);
  assert.equal(result.kcalPerServing, 19.25);
  assert.deepEqual(ingredients, before);
});

test('only exact aliases resolve; juice, whole fruit including peel, brands and ambiguous forms stay unavailable', () => {
  for (const name of ['Passion fruit', 'Orange', 'Passion fruit juice', 'Passion fruit nectar', 'Passion fruit syrup', 'Whole orange with peel', 'Fresh orange juice', 'Orange juice', 'Lemon Slice', 'Sprite', 'Sweetened passion fruit pulp', 'constructor', 'toString']) {
    assert.equal(resolveRecipeNutritionIdentity(name), undefined, name);
    const result = calculateRecipeNutrition({ servings: 1, ingredients: [row(name)] }, {});
    assert.equal(result.ingredientBreakdown?.[0].kcal, undefined, name);
  }
  assert.equal(resolveRecipeNutritionIdentity('  FRESH   ORANGE ')?.kcalPer100g, 47);
});

test('raw fruits do not invent volume, serving or count conversions; empty salt remains unavailable', () => {
  for (const unit of ['ml', 'slice', 'pcs']) {
    const result = calculateRecipeNutrition({ servings: 1, ingredients: [row('Passion fruit pulp', '1', unit)] }, {});
    assert.equal(result.ingredientBreakdown?.[0].kcal, undefined);
  }
  const result = calculateRecipeNutrition({ servings: 1, ingredients: [row('Fresh orange', '20'), row('Salt (盐)', '', '')] }, {});
  assert.equal(result.status, 'ESTIMATED');
  assert.equal(result.ingredientBreakdown?.[1].kcal, undefined);
});

test('existing approved ingredient profile takes precedence over raw fruit defaults', () => {
  const profile: IngredientNutritionProfile = { id: 'food', ingredientId: 'food', workspaceId: 'workspace', kind: 'food', status: 'approved', source: 'chef_override', kcalPer100g: 50, confirmedBy: 'chef', confirmedAt: '', updatedAt: '' };
  const result = calculateRecipeNutrition({ servings: 1, ingredients: [row('Fresh orange', '20', 'g', 'food')] }, { food: profile });
  assert.equal(result.totalKcal, 10);
});
