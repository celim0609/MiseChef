import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import IngredientNutritionSetup, { withUsdaPieceWeight } from './IngredientNutritionSetup';

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

test('synchronizes USDA piece weight into the save selection and restores it for edit hydration', () => {
  const selected = withUsdaPieceWeight({ source: 'usda_fdc', fdcId: '123', description: 'Eggs, Grade A, Large, egg whole' }, '56');
  assert.deepEqual(selected, { source: 'usda_fdc', fdcId: '123', description: 'Eggs, Grade A, Large, egg whole', gramsPerPiece: 56 });
  assert.deepEqual(withUsdaPieceWeight(selected, ''), { source: 'usda_fdc', fdcId: '123', description: 'Eggs, Grade A, Large, egg whole' });
  assert.deepEqual(withUsdaPieceWeight(selected, 'invalid'), { source: 'usda_fdc', fdcId: '123', description: 'Eggs, Grade A, Large, egg whole' });

  const markup = renderToStaticMarkup(
    <IngredientNutritionSetup ingredientName="Egg" workspaceId="workspace-a" showPieceWeight value={selected} onChange={() => undefined} />
  );
  assert.match(markup, /Weight per piece \(g\)/);
  assert.match(markup, /value="56"/);
  assert.doesNotMatch(markup, /Use USDA piece weight/);
});
