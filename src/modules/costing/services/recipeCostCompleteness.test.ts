import assert from 'node:assert/strict';
import test from 'node:test';
import type { Recipe } from '../../../types';
import type { CostingIngredient } from '../types';
import { calculateRecipeCosting, resolveLinkedRecipeCost } from './recipeCostCalculator';
import { getRecipeCostCompleteness } from './recipeCostCompleteness';
const priced = { id: 'sugar', name: 'Sugar', currentPrice: 1, purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0, status: 'Active' } as CostingIngredient;
const child = { id: 'soy', title: 'Seasoning Soy', servings: 8, nutritionYield: { quantity: 290, unit: 'g' }, ingredients: [{ id: 'sugar-row', name: 'Sugar', ingredientId: 'sugar', qty: '29', unit: 'g' }, { id: 'unknown', name: 'Unknown', qty: '1', unit: 'g' }] } as Recipe;
test('unknown child costs retain the known batch subtotal and visibly propagate partial cost', () => {
 const result = calculateRecipeCosting(child, [priced]);
 assert.equal(getRecipeCostCompleteness(result), 'PARTIAL');
 assert.match(result.ingredients[1].costingWarning!, /unavailable/);
 assert.equal(resolveLinkedRecipeCost(result, { quantity: 40, unit: 'g' })?.contribution, 4);
 assert.equal(resolveLinkedRecipeCost({ ...result, servings: 99 }, { quantity: 40, unit: 'g' })?.contribution, 4);
 const parent = { id: 'parent', servings: 1, ingredients: [{ id: 'replaced', name: 'Sugar', qty: '40', unit: 'g' }], linkedRecipes: [{ id: 'link', recipeId: 'soy', quantity: 40, unit: 'g', associatedIngredientId: 'replaced' }] } as Recipe;
 const calculated = calculateRecipeCosting(parent, [priced], undefined, [child]);
 assert.equal(calculated.costing?.totalRecipeCost, 4);
 assert.equal(getRecipeCostCompleteness(calculated), 'PARTIAL');
 assert.equal(calculated.ingredients[0].ingredientCost, undefined);
 assert.equal(calculateRecipeCosting(parent, [{ ...priced, currentPrice: 2 }], undefined, [child]).costing?.totalRecipeCost, 8);
});
test('missing purchase price never becomes a verified zero; explicit zero remains valid', () => {
 const recipe = { ...child, ingredients: [child.ingredients[0]] };
 const missing = calculateRecipeCosting(recipe, [{ ...priced, currentPrice: 0, priceStatus: 'missing' }]);
 assert.equal(getRecipeCostCompleteness(missing), 'INCOMPLETE');
 assert.equal(resolveLinkedRecipeCost(missing, { quantity: 40, unit: 'g' }), null);
 const zero = calculateRecipeCosting(recipe, [{ ...priced, currentPrice: 0 }]);
 assert.equal(getRecipeCostCompleteness(zero), 'COMPLETE');
 assert.equal(resolveLinkedRecipeCost(zero, { quantity: 40, unit: 'g' })?.contribution, 0);
});
test('unknown-only and incompatible measured child costs remain unavailable', () => {
 const missing = calculateRecipeCosting({ ...child, ingredients: [child.ingredients[1]] }, [priced]);
 assert.equal(getRecipeCostCompleteness(missing), 'INCOMPLETE');
 assert.equal(resolveLinkedRecipeCost(missing, { quantity: 40, unit: 'g' }), null);
 assert.equal(resolveLinkedRecipeCost(calculateRecipeCosting(child, [priced]), { quantity: 40, unit: 'ml' }), null);
});
