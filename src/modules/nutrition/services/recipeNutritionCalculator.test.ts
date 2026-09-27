import assert from 'node:assert/strict';
import test from 'node:test';
import type { IngredientNutritionProfile } from '../../../types';
import { calculateRecipeNutrition, getSnapshotCalories } from './recipeNutritionCalculator';

const profile = (id: string, overrides: Partial<IngredientNutritionProfile> = {}): IngredientNutritionProfile => ({
  id, ingredientId: id, workspaceId: 'workspace', kind: 'food', status: 'approved', source: 'chef_override',
  kcalPer100g: 100, confirmedBy: 'chef', confirmedAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z', ...overrides
});

test('calculates approved mass nutrition and snapshots per-serving kcal', () => {
  const result = calculateRecipeNutrition({ servings: 2, ingredients: [{ id: 'flour', ingredientId: 'flour', name: 'Flour', qty: '250', unit: 'g' }] }, { flour: profile('flour', { kcalPer100g: 364 }) });
  assert.deepEqual(result, { status: 'COMPLETE', totalKcal: 910, kcalPerServing: 455, incompleteReasons: [] });
  assert.equal(getSnapshotCalories(result), 455);
});

test('calculates volume only when the approved profile has kcal per 100 ml', () => {
  const result = calculateRecipeNutrition({ servings: 1, ingredients: [{ id: 'milk', ingredientId: 'milk', name: 'Milk', qty: '2', unit: 'tbsp' }] }, { milk: profile('milk', { kcalPer100g: undefined, kcalPer100ml: 60 }) });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.totalKcal, 18);
});

test('does not treat missing food nutrition or missing piece weight as zero', () => {
  const result = calculateRecipeNutrition({ servings: 1, ingredients: [
    { id: 'banana', ingredientId: 'banana', name: 'Banana', qty: '1', unit: 'pcs' },
    { id: 'egg', ingredientId: 'egg', name: 'Egg', qty: '50', unit: 'g' }
  ] }, { banana: profile('banana') });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.incompleteReasons.join(' '), /Weight per piece/);
  assert.match(result.incompleteReasons.join(' '), /Egg: nutrition profile is required/);
});

test('calculates pcs and nos from approved grams per piece without changing costing units', () => {
  const result = calculateRecipeNutrition({ servings: 2, ingredients: [
    { id: 'egg', ingredientId: 'egg', name: 'Egg', qty: '2', unit: 'pcs' },
    { id: 'banana', ingredientId: 'banana', name: 'Banana', qty: '1', unit: 'nos' }
  ] }, {
    egg: profile('egg', { kcalPer100g: 143, gramsPerPiece: 50 }),
    banana: profile('banana', { kcalPer100g: 89, gramsPerPiece: 120 })
  });
  assert.deepEqual(result, { status: 'COMPLETE', totalKcal: 249.8, kcalPerServing: 124.9, incompleteReasons: [] });
});

test('non-food contributes zero without making a Recipe incomplete', () => {
  const result = calculateRecipeNutrition({ servings: 2, ingredients: [
    { id: 'ice', ingredientId: 'ice', name: 'Ice', qty: '5', unit: 'pcs' },
    { id: 'rice', ingredientId: 'rice', name: 'Rice', qty: '100', unit: 'g' }
  ] }, {
    ice: profile('ice', { kind: 'non_food', source: 'chef_non_food', kcalPer100g: undefined }),
    rice: profile('rice', { kcalPer100g: 130 })
  });
  assert.deepEqual(result, { status: 'COMPLETE', totalKcal: 130, kcalPerServing: 65, incompleteReasons: [] });
});
