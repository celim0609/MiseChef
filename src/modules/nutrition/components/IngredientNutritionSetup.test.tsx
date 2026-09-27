import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import IngredientNutritionSetup from './IngredientNutritionSetup';

test('renders optional draft Nutrition setup before an Ingredient exists', () => {
  const markup = renderToStaticMarkup(
    <IngredientNutritionSetup ingredientName="Banana" workspaceId="workspace-a" value={{ source: 'none' }} onChange={() => undefined} />
  );
  assert.match(markup, /Nutrition setup/);
  assert.match(markup, /Find USDA nutrition/);
  assert.match(markup, /Weight per piece \(g\)/);
  assert.match(markup, /Not configured/);
});
