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
  for (const text of ['Estimated', '8 / 10 ingredients calculated', '800 kcal total', '400 kcal per serving', 'Ginger nutrition data unavailable', 'Garlic nutrition data unavailable']) assert.ok(html.includes(text));
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
  assert.match(html, /0 kcal total · 0 kcal per serving/);
});
