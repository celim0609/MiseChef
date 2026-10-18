import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import IngredientNutritionSetup from '../components/IngredientNutritionSetup';
import { isKnownOperationalIngredient } from './recipeNutritionIdentity';
import { calculateRecipeNutrition } from './recipeNutritionCalculator';
import { calculateRecipeCosting } from '../../costing/services/recipeCostCalculator';
import type { Recipe } from '../../../types';
import type { CostingIngredient } from '../../costing/types';

test('exact Box 650 packaging skips food lookup UI; unknown Box foods are not guessed', () => {
  assert.equal(isKnownOperationalIngredient(' Box 650 '), true);
  for (const name of ['Box cake', 'Box 650 sauce', 'Box', 'Unknown']) assert.equal(isKnownOperationalIngredient(name), false);
  const html = renderToStaticMarkup(<IngredientNutritionSetup ingredientName="Box 650" value={{ source: 'none' }} onChange={() => {}} />);
  assert.doesNotMatch(html, /Search USDA|Find USDA/);
  assert.match(html, /Mark as non-food/);
});

test('Box 650 is excluded from coverage but retains its Ingredient cost', () => {
  const recipe = { id: 'recipe', servings: 1, ingredients: [{ id: 'box', ingredientId: 'box', name: 'Box 650', qty: '2', unit: 'pcs' }, { id: 'unknown', name: 'Unknown food', qty: '1', unit: 'g' }] } as Recipe;
  const result = calculateRecipeNutrition(recipe, {});
  assert.equal(result.totalIngredientCount, 1);
  assert.equal(result.calculatedIngredientCount, 0);
  assert.doesNotMatch(result.incompleteReasons.join(' '), /Box 650/);
  const library = [{ id: 'box', name: 'Box 650', status: 'Active', currentPrice: 0.5, purchaseUnit: 'pcs', recipeUnit: 'pcs', conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0 }] as CostingIngredient[];
  assert.equal(calculateRecipeCosting(recipe, library).costing?.totalRecipeCost, 1);
});

test('Ingredient save persists cost before classification; packaging uses non-food confirmation and no USDA request', () => {
  const editor = readFileSync(new URL('../../costing/pages/Ingredients/index.tsx', import.meta.url), 'utf8');
  assert.ok(editor.indexOf('savedIngredient = createdIngredient') < editor.indexOf('const packaging ='));
  assert.match(editor, /selection: packaging \? \{ source: 'chef_non_food' \} : nutritionSelection/);
  const skip = editor.slice(editor.indexOf('if (isKnownOperationalIngredient(ingredient.name))'), editor.indexOf('void loadIngredientNutritionProfiles'));
  assert.match(skip, /return;/);
  const service = readFileSync(new URL('./ingredientNutritionProfileService.ts', import.meta.url), 'utf8');
  assert.match(service, /'saveChefIngredientNutrition'/);
  assert.doesNotMatch(service, /setDoc\(/);
  assert.match(editor, /nutritionRequestRef.current !== requestId/);
});
