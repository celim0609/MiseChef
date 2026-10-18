import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { IngredientNutritionProfile, Recipe } from '../../../types';
import { calculateRecipeNutrition, getSnapshotCalories } from './recipeNutritionCalculator';
import { calculateRecipeCosting } from '../../costing/services/recipeCostCalculator';
import { getReadyToSellProductDraft } from '../../store/storeProductVisibility';
import { scaleLinkedRecipeQuantities } from '../../costing/services/linkedRecipePresentation';
const row = (id: string, qty = '100', unit = 'g') => ({ id, ingredientId: id, name: id, qty, unit });
const recipe = (id: string, ingredients = [row('food')], servings = 4): Recipe => ({ id, workspaceId: 'a', title: id, ingredients, servings } as Recipe);
const profile = (id: string, energy = 400): IngredientNutritionProfile => ({ id, ingredientId: id, workspaceId: 'a', kind: 'food', source: 'usda_fdc', status: 'approved', kcalPer100g: energy, confirmedBy: 'owner', confirmedAt: '', updatedAt: '' });
const profiles = { food: profile('food') };
const link = (recipeId: string, quantity = 0.4, associatedIngredientId?: string) => ({ id: `link-${recipeId}`, recipeId, quantity, unit: 'portion' as const, associatedIngredientId });

test('child calories use fractional portions recursively, with leaf coverage and no mutation', () => {
  const child = recipe('child');
  const parent = recipe('parent', [], 2); parent.linkedRecipes = [link('child')];
  const grand = recipe('grand', [], 1); grand.linkedRecipes = [link('parent', 0.5)];
  const original = JSON.stringify([child, parent, grand]);
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 40);
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).kcalPerServing, 20);
  const result = calculateRecipeNutrition(grand, profiles, [child, parent]);
  assert.equal(result.totalKcal, 10); assert.equal(result.status, 'COMPLETE');
  assert.equal(result.calculatedIngredientCount, 1); assert.equal(result.totalIngredientCount, 1);
  assert.equal(JSON.stringify([child, parent, grand]), original);
});

test('explicit associations replace nutrition once while unassociated rows remain independent', () => {
  const child = recipe('child'); const parent = recipe('parent');
  parent.linkedRecipes = [link('child', 1, 'food')];
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 100);
  parent.linkedRecipes[0].associatedIngredientId = undefined;
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 500);
});

test('partial child nutrition propagates partial totals, missing coverage and COMPLETE-only Product prefill', () => {
  const child = recipe('child', [row('food'), row('unknown')]);
  const parent = recipe('parent', [], 1); parent.linkedRecipes = [link('child', 1)];
  const result = calculateRecipeNutrition(parent, profiles, [child]);
  assert.equal(result.totalKcal, 100); assert.equal(result.status, 'ESTIMATED');
  assert.equal(result.calculatedIngredientCount, 1); assert.equal(result.totalIngredientCount, 2);
  assert.equal(getSnapshotCalories(result), undefined);
  assert.equal(getReadyToSellProductDraft(parent, result).calories, undefined);
});

test('missing children, cross-workspace children, invalid portions and cycles never produce complete zero', () => {
  const parent = recipe('parent', [], 1); parent.linkedRecipes = [link('child', 1)];
  const child = recipe('child'); child.workspaceId = 'b';
  for (const list of [[], [child]]) assert.equal(calculateRecipeNutrition(parent, profiles, list).status, 'INCOMPLETE');
  child.workspaceId = 'a'; child.linkedRecipes = [link('parent', 1)];
  const result = calculateRecipeNutrition(parent, {}, [parent, child]);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.totalKcal, undefined);
  parent.linkedRecipes[0].quantity = NaN;
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).status, 'INCOMPLETE');
});

test('actual associated mass uses explicit saved batch Yield without a second field', () => {
  const child = recipe('child', [row('food', '1000')], 10); child.yield = '1000g';
  const parent = recipe('parent', [row('sauce', '60')], 1);
  parent.linkedRecipes = [{ ...link('child', 1, 'sauce'), nutritionUseAssociatedQuantity: true }];
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 240);
  child.nutritionYield = { quantity: 1000, unit: 'g' };
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 240);
  parent.ingredients[0].qty = '0.06'; parent.ingredients[0].unit = 'kg';
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 240);
  assert.equal(parent.linkedRecipes[0].quantity, 1);
});

test('verified yield supports compatible volume and fractional pcs without inventing density', () => {
  const child = recipe('child'); const parent = recipe('parent', [row('sauce', '0.06', 'l')], 1);
  parent.linkedRecipes = [{ ...link('child', 1, 'sauce'), nutritionUseAssociatedQuantity: true }];
  child.nutritionYield = { quantity: 1000, unit: 'ml' };
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 24);
  parent.ingredients[0].unit = 'g';
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).status, 'INCOMPLETE');
  child.nutritionYield = { quantity: 10, unit: 'pcs' };
  parent.ingredients[0].qty = '0.5'; parent.ingredients[0].unit = 'pcs';
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 20);
});

test('unknown conversions and missing piece weights remain unavailable; verified zero remains calculated', () => {
  const p = { food: profile('food', 0) };
  assert.equal(calculateRecipeNutrition(recipe('r'), p).status, 'COMPLETE');
  assert.equal(calculateRecipeNutrition(recipe('r', [row('food', '1', 'pcs')]), p).status, 'INCOMPLETE');
  assert.equal(calculateRecipeNutrition(recipe('r', [row('food', '1', 'ml')]), p).status, 'INCOMPLETE');
  p.food.gramsPerPiece = 55;
  assert.equal(calculateRecipeNutrition(recipe('r', [row('food', '0.5', 'pcs')]), p).totalKcal, 0);
});

test('confirmed packaging disappears only from nutrition, retaining its cost and identity', () => {
  const r = recipe('parent', [row('food'), row('box', '1', 'pcs')], 1);
  const p = { ...profiles, box: { ...profile('box'), kind: 'non_food' as const } };
  const n = calculateRecipeNutrition(r, p);
  assert.equal(n.totalIngredientCount, 1); assert.equal(n.ingredientBreakdown?.length, 1);
  const cost = calculateRecipeCosting(r, [{ id: 'box', name: 'box', status: 'Active', recipeUnit: 'pcs', purchaseUnit: 'pcs', currentPrice: 2, conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0 } as any]);
  assert.equal(cost.ingredients[1].ingredientCost, 2);
  const unknown = calculateRecipeNutrition(r, profiles);
  assert.equal(unknown.totalIngredientCount, 2); assert.equal(unknown.status, 'ESTIMATED');
});

test('a foreign workspace profile cannot supply calories or exclude a food as packaging', () => {
  for (const kind of ['food', 'non_food'] as const) {
    const n = calculateRecipeNutrition(recipe('r'), { food: { ...profile('food'), workspaceId: 'b', kind } });
    assert.equal(n.status, 'INCOMPLETE'); assert.equal(n.totalIngredientCount, 1);
  }
});

test('scaling doubles total, scales linked quantities and preserves per-serving calories', () => {
  const child = recipe('child'); const r = recipe('r', [row('food')], 2); r.linkedRecipes = [link('child')];
  const original = calculateRecipeNutrition(r, profiles, [child]);
  const scaled = { ...r, servings: 4, ingredients: [row('food', '200')], linkedRecipes: scaleLinkedRecipeQuantities(r.linkedRecipes, 2) };
  const result = calculateRecipeNutrition(scaled, profiles, [child]);
  assert.equal(result.totalKcal, original.totalKcal! * 2); assert.equal(result.kcalPerServing, original.kcalPerServing);
  const detail = readFileSync(new URL('../../../components/RecipeDetailModal.tsx', import.meta.url), 'utf8');
  assert.match(detail, /useRecipeNutrition\(displayedRecipe, recipes\)/);
});

test('dependency changes update calculations; COMPLETE products snapshot only nutrition and retain manual edits', () => {
  const child = recipe('child'); const parent = recipe('parent', [], 1); parent.linkedRecipes = [link('child', 1)];
  const before = calculateRecipeNutrition(parent, profiles, [child]);
  const after = calculateRecipeNutrition(parent, { food: profile('food', 200) }, [child]);
  assert.equal(before.totalKcal, 100); assert.equal(after.totalKcal, 50);
  const changedChild = { ...child, servings: 2 };
  assert.equal(calculateRecipeNutrition(parent, profiles, [changedChild]).totalKcal, 200);
  const draft = getReadyToSellProductDraft(parent, after); draft.calories = 123; draft.name = 'Manual';
  calculateRecipeNutrition(parent, profiles, [child]);
  assert.equal(draft.calories, 123); assert.equal(draft.name, 'Manual');
});

test('approved USDA identity and review flags are displayed data, never an automatic overwrite', () => {
  const p = { food: { ...profile('food'), foodDescription: 'Cookie, sugar or plain, sugar free', reviewWarnings: ['Review food identity'] } };
  const before = JSON.stringify(p);
  const result = calculateRecipeNutrition(recipe('r'), p);
  assert.equal(result.ingredientBreakdown?.[0].foodDescription, p.food.foodDescription);
  assert.match(result.reviewWarnings?.[0] || '', /Review food identity/);
  assert.equal(JSON.stringify(p), before);
});

test('server costing runtime is generated from the unchanged shared calculator', async () => {
  const { build } = await import('esbuild');
  const result = await build({ entryPoints: ['src/modules/costing/services/recipeCostServerRuntime.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: 'functions/recipeCostRuntime.generated.js', write: false });
  assert.equal(result.outputFiles[0].text, readFileSync('functions/recipeCostRuntime.generated.js', 'utf8'));
});
