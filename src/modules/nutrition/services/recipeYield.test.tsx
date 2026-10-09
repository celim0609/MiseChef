import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecipeYieldInput } from '../../../components/RecipeYieldInput';
import { parseMeasuredRecipeYield, resolveRecipeYieldDenominator } from './recipeYield';
import { calculateRecipeNutrition } from './recipeNutritionCalculator';
import { resolveLinkedRecipeUsage } from '../../costing/services/linkedRecipeUsage';
import { resolveLinkedRecipeCost } from '../../costing/services/recipeCostCalculator';
import type { Recipe, IngredientNutritionProfile } from '../../../types';

test('single Yield accepts only explicit positive quantities and compatible unit conversions', () => {
  for (const text of ['290g', '290 grams', '0.29 kg']) assert.deepEqual(parseMeasuredRecipeYield(text), { quantity: 290, unit: 'g' });
  assert.deepEqual(parseMeasuredRecipeYield('0.5 L'), { quantity: 500, unit: 'ml' });
  assert.deepEqual(parseMeasuredRecipeYield('12 pcs'), { quantity: 12, unit: 'pcs' });
  for (const text of ['290', 'about 290g', '290g finished', '290g/300ml', '20 servings', '1 loaf', '0g', '-1g', 'Infinity g', '1e309g', '']) assert.equal(parseMeasuredRecipeYield(text), undefined, text);
});

test('unchanged legacy Yield never migrates on unrelated saves, but one confirmation persists it', () => {
  const legacy = { text: '290g', originalText: '290g' };
  assert.equal(resolveRecipeYieldDenominator(legacy), undefined);
  const saved = resolveRecipeYieldDenominator({ ...legacy, confirmed: true });
  assert.deepEqual(saved, { quantity: 290, unit: 'g' });
  assert.deepEqual(resolveRecipeYieldDenominator({ ...legacy, previous: saved }), saved);
  assert.equal(resolveRecipeYieldDenominator({ text: '290g' }), undefined); // Imported text is not Chef-entered measured output.
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
  assert.equal(resolveRecipeYieldDenominator({ text: '500g', originalText: '290g', previous }), null); // Changed imported text needs confirmation too.
});

test('Chef-confirmed single Yield drives Seasoning Soy 40g / 290g Partial kcal and cost without duplicate counting', () => {
  const child = { id: 'soy', workspaceId: 'a', title: 'Seasoning Soy', yield: '290g', servings: 1, ingredients: [{ id: 'sugar', ingredientId: 'sugar', name: 'Sugar', qty: '20', unit: 'g' }, { id: 'missing', name: 'Soy sauce', qty: '100', unit: 'ml' }], costing: { totalRecipeCost: 2.42, costPerPortion: 2.42, breakdown: [{}] } } as Recipe;
  const parent = { id: 'bihun', workspaceId: 'a', servings: 1, ingredients: [{ id: 'associated', name: 'Seasoning soy', qty: '40', unit: 'g' }], linkedRecipes: [{ id: 'link', recipeId: 'soy', quantity: 40, unit: 'g', associatedIngredientId: 'associated' }] } as Recipe;
  const profiles = { sugar: { id: 'sugar', ingredientId: 'sugar', workspaceId: 'a', kind: 'food', source: 'chef_override', status: 'approved', kcalPer100g: 401, confirmedBy: 'owner', confirmedAt: '', updatedAt: '' } as IngredientNutritionProfile };
  const original = JSON.stringify({ child, parent });
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, undefined);
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
  assert.match(legacy, /Confirm 290g as measured finished yield/);
  assert.equal((legacy.match(/<input/g) || []).length, 1);
  assert.doesNotMatch(renderToStaticMarkup(<RecipeYieldInput {...props} needsConfirmation={false} />), /<button/);
  const editor = readFileSync(new URL('../../../components/AddRecipeTab.tsx', import.meta.url), 'utf8');
  assert.match(editor, /<RecipeYieldInput/);
  assert.doesNotMatch(editor, /Verified edible batch quantity|Verified edible batch unit|setNutritionYield|Measured finished yield \(optional\)/);
  assert.match(editor, /nutritionYield,\s*yield: recipeYield.trim/);
});
