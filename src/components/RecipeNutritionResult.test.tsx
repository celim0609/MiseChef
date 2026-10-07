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
