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

test('measured summary displays confirmed finished yield and batch-proportional contribution', () => {
  const child = { id: 'sauce', servings: 8, nutritionYield: { quantity: 230, unit: 'g' }, costing: { totalRecipeCost: 23, costPerPortion: 2.88, breakdown: [{}] } } as Recipe;
  const html = renderToStaticMarkup(<LinkedRecipeCostSummary child={child} quantity={60} unit="g" />);
  assert.match(html, /Finished yield:.*230 g/);
  assert.match(html, /Cost per g:/);
  assert.match(html, /6.00/);
  assert.doesNotMatch(html, /role="alert"/);
});

test('measured summary shows unavailable rather than a zero contribution without verified yield', () => {
  const child = { id: 'sauce', servings: 8, yield: '230g', costing: { totalRecipeCost: 23, costPerPortion: 2.88, breakdown: [{}] } } as Recipe;
  const html = renderToStaticMarkup(<LinkedRecipeCostSummary child={child} quantity={60} unit="g" />);
  assert.match(html, /Child costing unavailable/);
  assert.doesNotMatch(html, /0.00/);
});

test('missing or incompatible measured yield asks inline once; valid saved yield needs no confirmation', () => {
  const child = { id: 'soy', title: 'Seasoning Soy', servings: 8, nutritionYield: { quantity: 290, unit: 'g' } } as Recipe;
  const valid = renderToStaticMarkup(<LinkedRecipeCostSummary child={child} quantity={30} unit="g" />);
  assert.doesNotMatch(valid, /What is the measured/);
  const incompatible = renderToStaticMarkup(<LinkedRecipeCostSummary child={child} quantity={30} unit="ml" />);
  assert.equal((incompatible.match(/What is the measured finished yield/g) || []).length, 1);
  assert.match(incompatible, /g and ml are not interchangeable/);
});

test('editor reuses yield for new links and hides legacy controls without requiring confirmation', () => {
  const editor = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');
  assert.match(editor, /unit: getDefaultLinkedRecipeUnit\(available\)/);
  assert.match(editor, /Advanced nutrition option/);
  assert.doesNotMatch(editor, /Confirm measured finished yield/);
});

test('known partial child contribution stays visible with an explicit partial warning', () => {
 const child = { id: 'soy', servings: 8, nutritionYield: { quantity: 290, unit: 'g' }, ingredients: [{ id: 'known', ingredientCost: 29 }, { id: 'missing', costingWarning: 'unavailable' }], costing: { totalRecipeCost: 29, costPerPortion: 3.63, breakdown: [{}] } } as Recipe;
 const html = renderToStaticMarkup(<LinkedRecipeCostSummary child={child} quantity={40} unit="g" />);
 assert.match(html, /Partial Food Cost contribution:/);
 assert.match(html, /4.00/);
 assert.match(html, /Missing costs are not zero/);
});

test('parent Food Cost labels known subtotals Partial and unavailable totals Incomplete', async () => {
 const { default: RecipeCostAnalysis } = await import('./RecipeCostAnalysis');
 const partial = { id: 'parent', ingredients: [{ id: 'known', ingredientCost: 4 }, { id: 'unknown', costingWarning: 'unavailable' }], costing: { totalRecipeCost: 4, costPerPortion: 4, breakdown: [{}] } } as Recipe;
 const html = renderToStaticMarkup(<RecipeCostAnalysis recipe={partial} defaultOpen />);
 assert.match(html, /Partial Total Cost/);
 assert.match(html, /Partial Cost Per Portion/);
 assert.match(html, /Missing costs are unavailable, not zero/);
 const unavailable = renderToStaticMarkup(<RecipeCostAnalysis recipe={{ ...partial, ingredients: [partial.ingredients[1]], costing: { ...partial.costing!, totalRecipeCost: 0, breakdown: [] } }} defaultOpen />);
 assert.match(unavailable, /Incomplete Cost/);
});
