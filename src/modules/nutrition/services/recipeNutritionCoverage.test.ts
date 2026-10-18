import assert from 'node:assert/strict';
import test from 'node:test';
import type { IngredientNutritionProfile } from '../../../types';
import { calculateRecipeNutrition } from './recipeNutritionCalculator';
import { resolveRecipeNutritionIdentity } from './recipeNutritionIdentity';

const row = (name: string, unit = 'g', qty = '100', ingredientId?: string) => ({ id: name, name, unit, qty, ingredientId });
const profile = (overrides: Partial<IngredientNutritionProfile> = {}): IngredientNutritionProfile => ({
  id: 'food', ingredientId: 'food', workspaceId: 'workspace', kind: 'food', status: 'approved', source: 'chef_override',
  kcalPer100g: 100, confirmedBy: 'chef', confirmedAt: '2026-10-07', updatedAt: '2026-10-07', ...overrides
});

test('explicit non-food and exact operational identities are excluded from both coverage counts', () => {
  const result = calculateRecipeNutrition({ servings: 1, ingredients: [
    row('Food', 'g', '100', 'food'), row('Packaging', 'pcs', '1', 'packaging'), row('Coaster', 'pcs', '1'), row('12 oz cup', 'pcs', '1')
  ] }, { food: profile(), packaging: profile({ kind: 'non_food' }) });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.calculatedIngredientCount, 1);
  assert.equal(result.totalIngredientCount, 1);
  assert.deepEqual(result.incompleteReasons, []);
});

test('unknown and qualified names remain eligible and missing, never inferred as zero or non-food', () => {
  for (const name of ['Unknown food', 'Cup noodles', 'Coaster sauce', '12 oz cup noodles', 'Salt substitute', 'Salted caramel', 'Coconut water', 'Ice cream', 'Flavoured ice']) {
    const result = calculateRecipeNutrition({ servings: 1, ingredients: [row('Water', 'ml'), row(name)] }, {});
    assert.equal(result.status, 'ESTIMATED', name);
    assert.equal(result.calculatedIngredientCount, 1, name);
    assert.equal(result.totalIngredientCount, 2, name);
    assert.match(result.incompleteReasons[0], /nutrition data unavailable/, name);
  }
});

test('verified Water and plain Ice calculate genuine zero energy in mass and compatible volume units', () => {
  for (const name of ['Water', 'Water (水)', 'Ice', 'Plain ice']) {
    for (const unit of ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp']) {
      const result = calculateRecipeNutrition({ servings: 1, ingredients: [row(name, unit)] }, {});
      assert.equal(result.status, 'COMPLETE', `${name} ${unit}`);
      assert.equal(result.totalKcal, 0);
      assert.equal(result.calculatedIngredientCount, 1);
      assert.equal(result.totalIngredientCount, 1);
    }
  }
  assert.equal(calculateRecipeNutrition({ servings: 1, ingredients: [row('Ice', 'pcs')] }, {}).status, 'INCOMPLETE');
});

test('approved profiles take precedence and missing unit data is not manufactured', () => {
  const result = calculateRecipeNutrition({ servings: 1, ingredients: [row('Water', 'ml', '100', 'food')] }, { food: profile({ kcalPer100g: 0 }) });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.incompleteReasons[0], /does not support volume/);
  assert.equal(resolveRecipeNutritionIdentity('Coaster', profile())?.kind, 'food');
});

test('Salt (盐) uses the same canonical identity as Salt, without mutating names or costing links', () => {
  assert.equal(resolveRecipeNutritionIdentity('Salt (盐)')?.catalogProfileId, '173468');
  assert.equal(resolveRecipeNutritionIdentity('Salt')?.catalogProfileId, '173468');
  const ingredients = [row('Salt (盐)', 'g', '10'), row('Salt', 'g', '2', 'existing-cost-link')];
  const before = structuredClone(ingredients);
  const result = calculateRecipeNutrition({ servings: 1, ingredients }, { 'existing-cost-link': profile({ catalogProfileId: '173468', kcalPer100g: 0 }) });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.totalKcal, 0);
  assert.equal(result.calculatedIngredientCount, 2);
  assert.deepEqual(ingredients, before);
});

test('Beta example coverage excludes operational rows and resolves only verified foods', () => {
  const latte = calculateRecipeNutrition({ servings: 1, ingredients: [
    row('Kopi based', 'ml'), row('Full cream milk', 'ml', '100', 'milk'), row('Whipping Cream (忌廉)', 'ml'), row('Syrup', 'ml'),
    row('Salt (盐)', 'g', '2'), row('Ice', 'ml', '132', 'ice'), row('12 oz cup', 'pcs', '1'), row('Coaster', 'pcs', '1')
  ] }, { milk: profile({ kcalPer100ml: 54 }) });
  assert.equal(latte.calculatedIngredientCount, 3);
  assert.equal(latte.totalIngredientCount, 6);
  assert.equal(latte.kcalPerServing, 54);
  const soy = calculateRecipeNutrition({ servings: 1, ingredients: [
    row('Soy sauce', 'ml'), row('Oyster Sauce (蚝油)'), row('Black soy sauce'), row('Sugar (糖)', 'g', '20', 'sugar'),
    row('Salt (盐)', 'g', '10'), row('MSG (味精)'), row('Water (水)', 'ml')
  ] }, { sugar: profile({ kcalPer100g: 400 }) });
  assert.equal(soy.calculatedIngredientCount, 3);
  assert.equal(soy.totalIngredientCount, 7);
  assert.equal(soy.kcalPerServing, 80);
});

test('breakdown reuses exact contributions, preserves duplicate rows, excludes non-food and leaves failures unavailable', () => {
  const ingredients = [row('Food', 'g', '25', 'food'), row('Food', 'pcs', '2', 'piece'), row('Water', 'ml'), row('Unknown'), row('Food', 'unsupported', '1', 'food'), row('Coaster')];
  const before = structuredClone(ingredients);
  const result = calculateRecipeNutrition({ servings: 2, ingredients }, { food: profile(), piece: profile({ gramsPerPiece: 50 }) });
  assert.deepEqual(result.ingredientBreakdown?.map(item => item.kcal), [25, 100, 0, undefined, undefined]);
  assert.equal(result.totalKcal, 125);
  assert.equal(result.kcalPerServing, 62.5);
  assert.equal(result.calculatedIngredientCount, 3);
  assert.equal(result.totalIngredientCount, 5);
  assert.deepEqual(ingredients, before);
  const incomplete = calculateRecipeNutrition({ servings: 1, ingredients: [row('Unknown')] }, {});
  assert.equal(incomplete.status, 'INCOMPLETE');
  assert.equal(incomplete.ingredientBreakdown?.[0].kcal, undefined);
});
