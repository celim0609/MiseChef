import assert from 'node:assert/strict';
import test from 'node:test';
import type { Recipe } from '../../../types';
import type { CostingIngredient } from '../types';
import { calculateRecipeCosting } from './recipeCostCalculator';
import { scaleLinkedRecipeQuantities } from './linkedRecipePresentation';

const food = { id: 'food', name: 'Food', category: '', purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, currentPrice: 1, yieldPercentage: 100, wastePercentage: 0, status: 'Active' } as CostingIngredient;
const child = { id: 'child', title: 'Child', servings: 4, yield: '600 ml', ingredients: [{ id: 'child-row', ingredientId: 'food', name: 'Food', qty: '8', unit: 'g' }] } as Recipe;
const parent = { id: 'parent', title: 'Parent', servings: 2, ingredients: [{ id: 'display-row', ingredientId: 'food', name: 'Child', qty: '1', unit: 'g' }], linkedRecipes: [{ id: 'link', recipeId: 'child', recipeTitle: 'Child', quantity: 0.4, unit: 'portion' }] } as Recipe;
const calculate = (r: Recipe, children = [child]) => calculateRecipeCosting(r, [food], 'now', children);

test('0.4 remains child portions per parent batch; Yield text never changes costing', () => {
  const result = calculate(parent);
  assert.equal(result.linkedRecipes?.[0].quantity, 0.4);
  assert.equal(result.costing?.breakdown.find(i => i.itemType === 'linkedRecipe')?.ingredientCost, 0.8);
  assert.equal(result.costing?.costPerPortion, 0.9);
  assert.equal(calculate(parent, [{ ...child, yield: '999 kg' }]).costing?.totalRecipeCost, 1.8);
});

test('same-name ingredients are costed separately unless explicitly associated', () => {
  assert.equal(calculate(parent).costing?.totalRecipeCost, 1.8);
  const associated = { ...parent, linkedRecipes: parent.linkedRecipes!.map(c => ({ ...c, associatedIngredientId: 'display-row' })) };
  const result = calculate(associated);
  assert.equal(result.costing?.totalRecipeCost, 0.8);
  assert.equal(result.ingredients[0].ingredientCost, undefined);
  assert.equal(result.ingredients[0].ingredientId, 'food');
  assert.equal(calculate({ ...parent, linkedRecipes: associated.linkedRecipes!.map(c => ({ ...c, associatedIngredientId: 'removed-row' })) }).costing?.totalRecipeCost, 1.8);
  assert.equal(calculate({ ...associated, linkedRecipes: [] }).costing?.totalRecipeCost, 1);
});

test('missing and uncosted children emit warnings instead of silently appearing costed', () => {
  assert.match(calculate(parent, []).costing?.linkedRecipeWarnings?.[0] || '', /unavailable/);
  assert.match(calculate(parent, [{ ...child, ingredients: [] }]).costing?.linkedRecipeWarnings?.[0] || '', /unavailable/);
  assert.match(calculate(parent, [{ ...child, servings: 0 }]).costing?.linkedRecipeWarnings?.[0] || '', /unavailable/);
});

test('parent scaling scales linked portions without mutating saved 0.4 or associations', () => {
  const saved = parent.linkedRecipes!.map(c => ({ ...c, associatedIngredientId: 'display-row' }));
  assert.equal(scaleLinkedRecipeQuantities(saved, 2)?.[0].quantity, 0.8);
  assert.equal(scaleLinkedRecipeQuantities(saved, 0.5)?.[0].quantity, 0.2);
  assert.equal(scaleLinkedRecipeQuantities(saved, 2)?.[0].associatedIngredientId, 'display-row');
  assert.equal(saved[0].quantity, 0.4);
});
