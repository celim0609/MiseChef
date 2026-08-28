import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRecipeCosting } from '../costing/services/recipeCostCalculator';
import { validateRecipeDependencies } from '../costing/services/recipeDependencyModel';
import type { CostingIngredient } from '../costing/types';
import type { Recipe } from '../../types';
import { calculateStoreProductCostAnalysis } from './storeCostModel';
import { resolvePublicRecipeAuthors, safePublicDisplayName } from '../public/publicRecipeAuthor';

const recipe = (id: string, title: string, ingredientId: string, qty: string, servings = 1): Recipe => ({
  id, title, coverImage: '', category: '', prepTime: 10, servings, yield: `${servings} portions`,
  difficulty: 'Easy', story: '', ingredients: ingredientId ? [{ id: `${id}-row`, ingredientId, name: ingredientId, qty, unit: 'g' }] : [],
  method: [{ id: `${id}-step`, stepNumber: 1, description: 'Cook.' }], videoLink: '', chefName: 'User Log', isSaved: false, collections: []
});

const ingredient = (id: string, currentPrice: number): CostingIngredient => ({
  id, name: id, category: '', purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, currentPrice,
  currency: 'MYR', supplierId: '', yieldPercentage: 100, wastePercentage: 0, status: 'Active', notes: '',
  createdAt: '', updatedAt: '', createdBy: 'owner', workspaceId: 'workspace'
});

test('ingredient-only recipes remain unchanged and linked recipe portions contribute current cost', () => {
  const sambal = recipe('sambal', 'Sambal', 'sambal-input', '12');
  const nasi = recipe('nasi', 'Nasi Lemak', 'rice-input', '9');
  nasi.linkedRecipes = [{ id: 'component-sambal', recipeId: sambal.id, recipeTitle: sambal.title, quantity: 1, unit: 'portion' }];
  const ingredients = [ingredient('sambal-input', 0.1), ingredient('rice-input', 0.25)];

  const ingredientOnly = calculateRecipeCosting(sambal, ingredients, 'now', [sambal, nasi]);
  const finished = calculateRecipeCosting(nasi, ingredients, 'now', [sambal, nasi]);
  assert.equal(ingredientOnly.costing?.costPerPortion, 1.2);
  assert.equal(finished.costing?.totalRecipeCost, 3.45);
  assert.equal(finished.costing?.breakdown.find(item => item.linkedRecipeId === 'sambal')?.ingredientCost, 1.2);

  const updated = calculateRecipeCosting(nasi, [ingredient('sambal-input', 0.1125), ingredient('rice-input', 0.25)], 'later', [sambal, nasi]);
  assert.equal(updated.costing?.totalRecipeCost, 3.6);
});

test('direct and indirect circular recipe references are rejected', () => {
  const a = recipe('a', 'A', '', '');
  const b = recipe('b', 'B', '', '');
  a.linkedRecipes = [{ id: 'a-b', recipeId: 'b', quantity: 1, unit: 'portion' }];
  b.linkedRecipes = [{ id: 'b-a', recipeId: 'a', quantity: 1, unit: 'portion' }];
  assert.match(validateRecipeDependencies('a', [{ id: 'self', recipeId: 'a', quantity: 1, unit: 'portion' }], [a, b]), /circular/i);
  assert.match(validateRecipeDependencies('a', a.linkedRecipes, [a, b]), /circular/i);
  assert.throws(() => calculateRecipeCosting(a, [], 'now', [a, b]), /Circular recipe dependency/);
});

test('Store linked recipe cost drives profit while unlinked cost remains unavailable', () => {
  const linked = recipe('nasi', 'Nasi Lemak', '', '');
  linked.costing = { totalRecipeCost: 3.45, costPerPortion: 3.45, sellingPrice: 0, foodCostPercentage: 0, grossProfitPercentage: 0, breakdown: [{ recipeIngredientId: 'row', itemType: 'ingredient', ingredientName: 'Rice', quantity: 1, unit: 'g', unitCost: 3.45, ingredientCost: 3.45, percentageOfTotalRecipeCost: 100 }], lastCalculatedAt: 'now' };
  const analysis = calculateStoreProductCostAnalysis({ price: 7.9, recipeId: 'nasi' }, [linked]);
  assert.deepEqual(analysis, { sellingPrice: 7.9, estimatedCost: 3.45, grossProfit: 4.45, grossMargin: 56.33 });
  assert.equal(calculateStoreProductCostAnalysis({ price: 5 }, []).estimatedCost, null);
});

test('public attribution uses a valid public profile name and never exposes internal fallbacks', () => {
  const publicRecipe = { ...recipe('public', 'Public', '', ''), chefUsername: 'chef-sara', chefName: 'User Log' };
  assert.equal(resolvePublicRecipeAuthors([publicRecipe], [{ username: 'chef-sara', name: 'Sara Lim', skills: [], publicRecipeCount: 1 }])[0].chefName, 'Sara Lim');
  assert.equal(resolvePublicRecipeAuthors([publicRecipe], [])[0].chefName, 'MiseChef');
  assert.equal(safePublicDisplayName('chef@example.com'), '');
  assert.equal(safePublicDisplayName('abc123456789012345678901234567'), '');
});
