import type { RecipeNutritionSummary } from '../types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecipeNutritionResult } from './RecipeNutritionResult';

test('partial nutrition displays estimate, coverage, calories and every missing ingredient', () => {
  const html = renderToStaticMarkup(<RecipeNutritionResult nutrition={{
    status: 'ESTIMATED', totalKcal: 800, kcalPerServing: 400,
    calculatedIngredientCount: 8, totalIngredientCount: 10,
    incompleteReasons: ['Ginger nutrition data unavailable', 'Garlic nutrition data unavailable']
  }} />);
  for (const text of ['Partial Total: 800 kcal', '8 / 10 ingredients calculated', 'Partial 400 kcal per serving', 'Ginger nutrition data unavailable', 'Garlic nutrition data unavailable']) assert.ok(html.includes(text));
  assert.ok(!html.includes('Incomplete'));
});

test('details render calculator contributions, unavailable dash and verified zero while retaining totals', async () => {
  const { calculateRecipeNutrition } = await import('../modules/nutrition/services/recipeNutritionCalculator');
  const nutrition = calculateRecipeNutrition({ servings: 2, ingredients: [
    { id: 'salt', name: 'Salt (盐)', qty: '2', unit: 'g' },
    { id: 'water', name: 'Water', qty: '100', unit: 'ml' },
    { id: 'unknown', name: 'Unknown sauce', qty: '3', unit: 'tbsp' },
    { id: 'cup', name: '12 oz cup', qty: '1', unit: 'pcs' }
  ] }, {});
  const html = renderToStaticMarkup(<RecipeNutritionResult nutrition={nutrition} />);
  assert.match(html, /Ingredient nutrition breakdown/);
  assert.match(html, /Salt \(盐\).*2<\/td><td>g<\/td><td[^>]*>0 kcal/);
  assert.match(html, /Water.*100<\/td><td>ml<\/td><td[^>]*>0 kcal/);
  assert.match(html, /Unknown sauce.*3<\/td><td>tbsp<\/td><td[^>]*>—/);
  assert.doesNotMatch(html, /12 oz cup/);
  assert.match(html, /Partial Total: 0 kcal · Partial 0 kcal per serving/);
});

test('complete and unavailable details retain coverage and breakdown without inventing totals', () => {
  const complete = renderToStaticMarkup(<RecipeNutritionResult nutrition={{ status: 'COMPLETE', totalKcal: 100, kcalPerServing: 50, calculatedIngredientCount: 1, totalIngredientCount: 1, incompleteReasons: [], ingredientBreakdown: [{ id: 'a', name: 'Food', quantity: '100', unit: 'g', kcal: 100 }] }} />);
  assert.match(complete, /Total Calories: 100 kcal · 50 kcal per serving/);
  assert.match(complete, /1 \/ 1 ingredients calculated/);
  assert.match(complete, /Ingredient nutrition breakdown/);
  assert.doesNotMatch(complete, /Partial/);
  const empty = renderToStaticMarkup(<RecipeNutritionResult nutrition={{ status: 'INCOMPLETE', calculatedIngredientCount: 0, totalIngredientCount: 1, incompleteReasons: [], ingredientBreakdown: [{ id: 'a', name: 'Food', quantity: '100', unit: 'g' }] }} />);
  assert.match(empty, /Incomplete/);
  assert.match(empty, /0 \/ 1 ingredients calculated/);
  assert.match(empty, /—/);
  assert.doesNotMatch(empty, /Total Calories|Partial Total|0 kcal/);
});

test('nutrition details show the USDA description and review warning without changing approved calories', () => {
  const nutrition: RecipeNutritionSummary = {
    status: 'COMPLETE', totalKcal: 523, kcalPerServing: 523, incompleteReasons: [], calculatedIngredientCount: 1, totalIngredientCount: 1,
    ingredientBreakdown: [{ id: 'sugar', name: 'Caster Sugar', quantity: '100', unit: 'g', kcal: 523, foodDescription: 'Cookie, sugar or plain, sugar free' }],
    reviewWarnings: ['Caster Sugar: selected USDA food requires review.']
  };
  const html = renderToStaticMarkup(<RecipeNutritionResult nutrition={nutrition} />);
  assert.match(html, /USDA: Cookie, sugar or plain, sugar free/);
  assert.match(html, /Nutrition selections requiring review/);
  assert.match(html, /523 kcal/);
  assert.equal(nutrition.totalKcal, 523);
});
