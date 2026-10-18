import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecipeYieldInput } from '../../../components/RecipeYieldInput';
import { parseMeasuredRecipeYield, resolveRecipeYieldDenominator } from './recipeYield';
import { calculateRecipeNutrition } from './recipeNutritionCalculator';
import { resolveLinkedRecipeUsage } from '../../costing/services/linkedRecipeUsage';
import { calculateRecipeCosting, resolveLinkedRecipeCost } from '../../costing/services/recipeCostCalculator';
import type { Recipe, IngredientNutritionProfile } from '../../../types';

test('single Yield accepts only explicit positive quantities and compatible unit conversions', () => {
  for (const text of ['290g', '290 grams', '0.29 kg']) assert.deepEqual(parseMeasuredRecipeYield(text), { quantity: 290, unit: 'g' });
  assert.deepEqual(parseMeasuredRecipeYield('0.5 L'), { quantity: 500, unit: 'ml' });
  assert.deepEqual(parseMeasuredRecipeYield('12 pcs'), { quantity: 12, unit: 'pcs' });
  for (const text of ['290', 'about 290g', '290g finished', '290g/300ml', '20 servings', '1 loaf', '0g', '-1g', 'Infinity g', '1e309g', '']) assert.equal(parseMeasuredRecipeYield(text), undefined, text);
});

test('explicit saved mass Yield persists its denominator without a second confirmation', () => {
  const legacy = { text: '290g', originalText: '290g' };
  assert.deepEqual(resolveRecipeYieldDenominator(legacy), { quantity: 290, unit: 'g' });
  const saved = resolveRecipeYieldDenominator({ ...legacy, confirmed: true });
  assert.deepEqual(saved, { quantity: 290, unit: 'g' });
  assert.deepEqual(resolveRecipeYieldDenominator({ ...legacy, previous: saved }), saved);
  assert.deepEqual(resolveRecipeYieldDenominator({ text: '290g' }), saved);
  assert.deepEqual(resolveRecipeYieldDenominator({ text: '290g', chefEdited: true }), saved);
});

test('editing Yield replaces or explicitly clears a denominator; unchanged saved data remains intact', () => {
  const previous = { quantity: 290, unit: 'g' as const };
  assert.equal(resolveRecipeYieldDenominator({ text: 'Old display text', originalText: 'Old display text', previous }), previous);
  assert.deepEqual(resolveRecipeYieldDenominator({ text: '500ml', previous, chefEdited: true }), { quantity: 500, unit: 'ml' });
  for (const text of ['', '290', '20 servings']) {
    const nutritionYield = resolveRecipeYieldDenominator({ text, originalText: '290g', previous, chefEdited: true });
    assert.equal(JSON.parse(JSON.stringify({ nutritionYield })).nutritionYield, null);
    assert.equal(resolveLinkedRecipeUsage({ servings: 8, nutritionYield }, 40, 'g').ratio, null);
  }
  assert.deepEqual(resolveRecipeYieldDenominator({ text: '500g', originalText: '290g', previous }), { quantity: 500, unit: 'g' });
});

test('Chef-confirmed single Yield drives Seasoning Soy 40g / 290g Partial kcal and cost without duplicate counting', () => {
  const child = { id: 'soy', workspaceId: 'a', title: 'Seasoning Soy', yield: '290g', servings: 1, ingredients: [{ id: 'sugar', ingredientId: 'sugar', name: 'Sugar', qty: '20', unit: 'g' }, { id: 'missing', name: 'Soy sauce', qty: '100', unit: 'ml' }], costing: { totalRecipeCost: 2.42, costPerPortion: 2.42, breakdown: [{}] } } as Recipe;
  const parent = { id: 'bihun', workspaceId: 'a', servings: 1, ingredients: [{ id: 'associated', name: 'Seasoning soy', qty: '40', unit: 'g' }], linkedRecipes: [{ id: 'link', recipeId: 'soy', quantity: 40, unit: 'g', associatedIngredientId: 'associated' }] } as Recipe;
  const profiles = { sugar: { id: 'sugar', ingredientId: 'sugar', workspaceId: 'a', kind: 'food', source: 'chef_override', status: 'approved', kcalPer100g: 401, confirmedBy: 'owner', confirmedAt: '', updatedAt: '' } as IngredientNutritionProfile };
  const original = JSON.stringify({ child, parent });
  assert.ok(Math.abs(calculateRecipeNutrition(parent, profiles, [child]).totalKcal! - 80.2 * 40 / 290) < 1e-9);
  const saved = JSON.parse(JSON.stringify({ ...child, nutritionYield: resolveRecipeYieldDenominator({ text: child.yield, originalText: child.yield, confirmed: true }) })) as Recipe;
  const nutrition = calculateRecipeNutrition(parent, profiles, [saved]);
  assert.equal(nutrition.status, 'ESTIMATED');
  assert.ok(Math.abs(nutrition.totalKcal! - 11.062068965517241) < 1e-9);
  assert.equal(nutrition.ingredientBreakdown?.length, 1);
  assert.equal(resolveLinkedRecipeCost(saved, parent.linkedRecipes![0])?.contribution, 0.33);
  const volumeLink = { ...parent, linkedRecipes: [{ ...parent.linkedRecipes![0], unit: 'ml' as const }] };
  assert.equal(calculateRecipeNutrition(volumeLink, profiles, [saved]).totalKcal, undefined);
  assert.equal(JSON.stringify({ child, parent }), original);
  assert.equal(resolveLinkedRecipeUsage({ ...saved, servings: 8 }, 0.4, 'portion').ratio, 0.05);
});

test('one Chef-facing Yield control exposes legacy confirmation only when needed', () => {
  const props = { value: '290g', onChange() {}, onConfirm() {} };
  const legacy = renderToStaticMarkup(<RecipeYieldInput {...props} needsConfirmation />);
  assert.doesNotMatch(legacy, /<button|checkbox|display text only/);
  assert.equal((legacy.match(/<input/g) || []).length, 1);
  assert.doesNotMatch(renderToStaticMarkup(<RecipeYieldInput {...props} needsConfirmation={false} />), /<button/);
  const editor = readFileSync(new URL('../../../components/AddRecipeTab.tsx', import.meta.url), 'utf8');
  assert.match(editor, /<RecipeYieldInput/);
  assert.doesNotMatch(editor, /Verified edible batch quantity|Verified edible batch unit|setNutritionYield|Measured finished yield \(optional\)/);
  assert.match(editor, /nutritionYield,\s*yield: recipeYield.trim/);
});


test('save/reload single Yield preserves gram batch cost and Partial kcal regardless of child servings', () => {
 const profile = { id: 'sugar', ingredientId: 'sugar', workspaceId: 'a', kind: 'food', source: 'chef_override', status: 'approved', kcalPer100g: 401, confirmedBy: 'owner', confirmedAt: '', updatedAt: '' } as IngredientNutritionProfile;
 const ingredients = [{ id: 'sugar', name: 'Sugar', status: 'Active', currentPrice: 0.121, purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0 }] as import('../../costing/types').CostingIngredient[];
 const parent = { id: 'parent', workspaceId: 'a', servings: 1, ingredients: [{ id: 'replacement', ingredientId: 'sugar', name: 'Sugar', qty: '40', unit: 'g' }], linkedRecipes: [{ id: 'link', recipeId: 'soy', quantity: 40, unit: 'g', associatedIngredientId: 'replacement' }] } as Recipe;
 for (const servings of [1, 8, 0, undefined]) {
  const saved = JSON.parse(JSON.stringify({ id: 'soy', workspaceId: 'a', title: 'Seasoning Soy', servings, yield: '290g', ingredients: [{ id: 'sugar-row', ingredientId: 'sugar', name: 'Sugar', qty: '20', unit: 'g' }, { id: 'missing', name: 'Unknown', qty: '1', unit: 'g' }] })) as Recipe;
  for (const [quantity, unit] of [[40, 'g'], [0.04, 'kg']] as const) {
   const reloaded = JSON.parse(JSON.stringify({ ...parent, linkedRecipes: [{ ...parent.linkedRecipes![0], quantity, unit }] })) as Recipe;
   const nutrition = calculateRecipeNutrition(reloaded, { sugar: profile }, [saved]);
   assert.equal(nutrition.status, 'ESTIMATED');
   assert.ok(Math.abs(nutrition.totalKcal! - 80.2 * 40 / 290) < 1e-9);
   assert.equal(nutrition.ingredientBreakdown!.length, 1);
   const cost = calculateRecipeCosting(reloaded, ingredients, '', [saved]);
   assert.equal(cost.costing!.totalRecipeCost, 0.33);
   assert.equal(cost.costing!.breakdown.length, 1);
   assert.equal(cost.ingredients[0].ingredientCost, undefined);
  }
 }
});

test('saved mass Yield is authoritative; ambiguous text and incompatible units are never guessed', () => {
 const child = { servings: 8, yield: '290g', nutritionYield: { quantity: 999, unit: 'g' as const } };
 assert.equal(resolveLinkedRecipeUsage(child, 40, 'g').ratio, 40 / 290);
 assert.equal(resolveLinkedRecipeUsage({ ...child, yield: '0.29 kg' }, 0.04, 'kg').ratio, 40 / 290);
 for (const yieldText of ['about 290g', '290', '290g/300ml', '0g']) assert.equal(resolveLinkedRecipeUsage({ servings: 1, yield: yieldText }, 40, 'g').ratio, null);
 assert.equal(resolveLinkedRecipeUsage(child, 40, 'ml').ratio, null);
 assert.equal(resolveLinkedRecipeUsage(child, 0.4, 'portion').ratio, 0.05);
});
