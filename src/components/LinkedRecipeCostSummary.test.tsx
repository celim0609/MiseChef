import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { LinkedRecipeCostSummary } from './LinkedRecipeCostSummary';
import { calculateRecipeCosting } from '../modules/costing/services/recipeCostCalculator';
import type { Recipe } from '../types';
import type { CostingIngredient } from '../modules/costing/types';

test('summary displays child servings, per-portion cost and fractional contribution', () => {
  const child = calculateRecipeCosting({ id: 'child', servings: 4, ingredients: [{ id: 'row', name: 'Rice', ingredientId: 'rice', qty: '8', unit: 'g' }] } as Recipe,
    [{ id: 'rice', name: 'Rice', currentPrice: 1, purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0, status: 'Active' } as CostingIngredient]);
  const html = renderToStaticMarkup(<LinkedRecipeCostSummary child={child} quantity={0.4} />);
  assert.match(html, /Child servings:.*4/);
  assert.match(html, /Cost per portion:/);
  assert.match(html, /Contribution:/);
  assert.match(html, /0.80/);
  assert.doesNotMatch(html, /role="alert"/);
});

test('missing child renders dashes and an unavailable warning', () => {
  const html = renderToStaticMarkup(<LinkedRecipeCostSummary quantity={0.4} />);
  assert.match(html, /Child costing unavailable/);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /0.00/);
});

test('editor and scaled detail integrate explicit portion semantics and association', () => {
  const editor = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');
  assert.match(editor, /Child portions used per parent batch/);
  assert.match(editor, /Ingredient cost replaced by this link/);
  const detail = readFileSync(new URL('./RecipeDetailModal.tsx', import.meta.url), 'utf8');
  assert.match(detail, /scaleLinkedRecipeQuantities\(recipe.linkedRecipes, scaleRatio\)/);
  assert.match(detail, /displayedRecipe.linkedRecipes\?\.map/);
});
