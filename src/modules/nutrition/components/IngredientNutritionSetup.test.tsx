import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import IngredientNutritionSetup from './IngredientNutritionSetup';

test('renders optional draft Nutrition setup before an Ingredient exists', () => {
  const markup = renderToStaticMarkup(
    <IngredientNutritionSetup ingredientName="Banana" workspaceId="workspace-a" showPieceWeight value={{ source: 'none' }} onChange={() => undefined} />
  );
  assert.match(markup, /Nutrition setup/);
  assert.match(markup, /Find USDA nutrition/);
  assert.doesNotMatch(markup, /Weight per piece \(g\)/);
  assert.match(markup, /Not configured/);
});

test('shows manual fields, including piece weight, only for a chef-confirmed piece-based setup', () => {
  const markup = renderToStaticMarkup(
    <IngredientNutritionSetup ingredientName="Banana" workspaceId="workspace-a" showPieceWeight value={{ source: 'chef_override', kcalPer100g: 89, gramsPerPiece: 120 }} onChange={() => undefined} />
  );
  assert.match(markup, /kcal per 100 g/);
  assert.match(markup, /Weight per piece \(g\)/);
});

test('keeps USDA piece weight available only for piece-based recipe units', () => {
  const markup = renderToStaticMarkup(
    <IngredientNutritionSetup ingredientName="Banana" workspaceId="workspace-a" showPieceWeight value={{ source: 'usda_fdc', fdcId: '123' }} onChange={() => undefined} />
  );
  assert.match(markup, /Weight per piece \(g\)/);
  assert.match(markup, /Use USDA piece weight/);
});
