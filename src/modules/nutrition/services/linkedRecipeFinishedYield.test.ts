import test from 'node:test';
import assert from 'node:assert/strict';
import type { IngredientNutritionProfile, LinkedRecipeComponent, Recipe } from '../../../types';
import type { CostingIngredient } from '../../costing/types';
import { calculateRecipeNutrition, getSnapshotCalories } from './recipeNutritionCalculator';
import { calculateRecipeCosting } from '../../costing/services/recipeCostCalculator';
import { resolveLinkedRecipeUsage } from '../../costing/services/linkedRecipeUsage';
import { scaleLinkedRecipeQuantities } from '../../costing/services/linkedRecipePresentation';
const food = (id: string, qty = '100', unit = 'g') => ({ id, ingredientId: id, name: id, qty, unit });
const profile = (id: string, energy: number): IngredientNutritionProfile => ({ id, ingredientId: id, workspaceId: 'a', status: 'approved', kind: 'food', source: 'chef_override', kcalPer100g: energy, confirmedBy: 'owner', confirmedAt: '', updatedAt: '' });
const recipe = (id: string, ingredients: Recipe['ingredients'], servings = 1): Recipe => ({ id, workspaceId: 'a', title: id, ingredients, servings } as Recipe);
const link = (id: string, quantity = 60, unit: LinkedRecipeComponent['unit'] = 'g', associatedIngredientId?: string): LinkedRecipeComponent => ({ id: `link-${id}`, recipeId: id, quantity, unit, associatedIngredientId });
const profiles = { sauce: profile('sauce', 282), bowl: profile('bowl', 402) };
const library: CostingIngredient[] = [
  { id: 'sauce', name: 'sauce', status: 'Active', currentPrice: 0.23, purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0 } as CostingIngredient,
  { id: 'bowl', name: 'bowl', status: 'Active', currentPrice: 0.1, purchaseUnit: 'g', recipeUnit: 'g', conversionFactor: 1, yieldPercentage: 100, wastePercentage: 0 } as CostingIngredient
];
const sauce = () => ({ ...recipe('teriyaki', [food('sauce')], 8), nutritionYield: { quantity: 230, unit: 'g' as const }, yield: 'Existing saved yield text' });
const bowl = () => ({ ...recipe('bowl', [food('bowl'), food('unknown'), { ...food('associated', '60'), ingredientId: 'sauce' }]), linkedRecipes: [link('teriyaki', 60, 'g', 'associated')] });
const close = (actual: number | undefined, expected: number) => assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('confirmed Teriyaki example: 230g / 282kcal / 8 servings; 60g contributes 73.6 and parent Partial 475.6', () => {
  const child = sauce(); const parent = bowl(); const original = JSON.stringify([child, parent]);
  const result = calculateRecipeNutrition(parent, profiles, [child]);
  close(result.ingredientBreakdown?.find(row => row.id === 'link-teriyaki')?.kcal, 282 * 60 / 230);
  close(result.totalKcal, 402 + 282 * 60 / 230);
  assert.equal(Number(result.totalKcal!.toFixed(1)), 475.6); assert.equal(result.status, 'ESTIMATED');
  assert.equal(result.ingredientBreakdown?.filter(row => row.name === 'associated').length, 0);
  assert.equal(getSnapshotCalories(result), undefined);
  const cost = calculateRecipeCosting(parent, library, '', [child]);
  assert.equal(cost.costing?.totalRecipeCost, 16); // 10 bowl + 23 * 60/230; associated sauce is excluded.
  const row = cost.costing?.breakdown.find(row => row.itemType === 'linkedRecipe');
  assert.equal(row?.ingredientCost, 6); assert.equal(row?.unit, 'g'); assert.equal(row?.quantity, 60);
  assert.equal(JSON.stringify([child, parent]), original);
});

test('measured links are independent of servings, whereas legacy fractional portion links retain their meaning and rounding', () => {
  const child = sauce(); const parent = bowl();
  const before = calculateRecipeNutrition(parent, profiles, [child]);
  child.servings = 16;
  close(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, before.totalKcal!);
  assert.equal(calculateRecipeCosting(parent, library, '', [child]).costing?.totalRecipeCost, 16);
  const portionParent = recipe('portion-parent', []); portionParent.linkedRecipes = [link('teriyaki', 0.4, 'portion')];
  close(calculateRecipeNutrition(portionParent, profiles, [child]).totalKcal, 282 / 16 * 0.4);
  child.servings = 8;
  close(calculateRecipeNutrition(portionParent, profiles, [child]).totalKcal, 14.1);
  assert.equal(calculateRecipeCosting(portionParent, library, '', [child]).costing?.totalRecipeCost, 1.15);
  assert.equal(portionParent.linkedRecipes[0].quantity, 0.4);
});

test('kg/g compatible links use the same kcal and cost ratio; volume never guesses density', () => {
  const child = sauce(); const parent = recipe('p', []);
  parent.linkedRecipes = [link('teriyaki', 0.06, 'kg')];
  close(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 282 * 60 / 230);
  assert.equal(calculateRecipeCosting(parent, library, '', [child]).costing?.totalRecipeCost, 6);
  parent.linkedRecipes[0].unit = 'ml';
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).status, 'INCOMPLETE');
  const cost = calculateRecipeCosting(parent, library, '', [child]);
  assert.equal(cost.costing?.linkedRecipeWarnings?.length, 1);
  assert.equal(cost.costing?.breakdown.length, 0);
});

test('ambiguous finished yield cannot be inferred from ingredient weights', () => {
  const child = sauce(); delete (child as Partial<Recipe>).nutritionYield; child.yield = 'about 230g';
  const parent = recipe('p', []); parent.linkedRecipes = [link('teriyaki')];
  const result = calculateRecipeNutrition(parent, profiles, [child]);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.totalKcal, undefined);
  assert.match(result.incompleteReasons.join(' '), /explicitly confirmed finished yield/);
  assert.equal(calculateRecipeCosting(parent, library, '', [child]).costing?.linkedRecipeWarnings?.length, 1);
  assert.equal(child.yield, 'about 230g');
});

test('scaling parent usage doubles kcal and cost; scaling child batch and finished yield preserves per-gram contribution', () => {
  const child = sauce(); const parent = bowl();
  const scaled = { ...parent, servings: 2, ingredients: parent.ingredients.map(row => ({ ...row, qty: String(Number(row.qty) * 2) })), linkedRecipes: scaleLinkedRecipeQuantities(parent.linkedRecipes, 2) };
  const base = calculateRecipeNutrition(parent, profiles, [child]); const doubled = calculateRecipeNutrition(scaled, profiles, [child]);
  close(doubled.totalKcal, base.totalKcal! * 2); close(doubled.kcalPerServing, base.kcalPerServing!);
  assert.equal(calculateRecipeCosting(scaled, library, '', [child]).costing?.totalRecipeCost, 32);
  const scaledChild = { ...child, ingredients: [food('sauce', '200')], nutritionYield: { quantity: 460, unit: 'g' as const }, servings: 16 };
  close(calculateRecipeNutrition(parent, profiles, [scaledChild]).totalKcal, base.totalKcal!);
  assert.equal(calculateRecipeCosting(parent, library, '', [scaledChild]).costing?.totalRecipeCost, 16);
});

test('nested measured children use each explicitly confirmed finished yield', () => {
  const child = sauce(); const middle = recipe('middle', [], 2); middle.nutritionYield = { quantity: 100, unit: 'g' }; middle.linkedRecipes = [link('teriyaki', 60)];
  const parent = recipe('outer', []); parent.linkedRecipes = [link('middle', 50)];
  const result = calculateRecipeNutrition(parent, profiles, [child, middle]);
  close(result.totalKcal, 282 * 60 / 230 * 0.5); assert.equal(result.status, 'COMPLETE');
  assert.equal(calculateRecipeCosting(parent, library, '', [child, middle]).costing?.totalRecipeCost, 3);
});

test('partial and unavailable children propagate status and cycles never become complete nutrition', () => {
  const child = sauce(); child.ingredients.push(food('unknown')); const parent = recipe('p', []); parent.linkedRecipes = [link('teriyaki')];
  assert.equal(calculateRecipeNutrition(parent, profiles, [child]).status, 'ESTIMATED');
  assert.equal(calculateRecipeNutrition(parent, {}, [child]).status, 'INCOMPLETE');
  child.linkedRecipes = [link('p', 1, 'portion')];
  const result = calculateRecipeNutrition(parent, profiles, [parent, child]);
  assert.notEqual(result.status, 'COMPLETE'); assert.match(result.incompleteReasons.join(' '), /Circular/);
  assert.throws(() => calculateRecipeCosting(parent, library, '', [parent, child]), /Circular/);
});

test('updated child finished yield or calories immediately changes derived parent results', () => {
  const child = sauce(); const parent = bowl(); child.nutritionYield.quantity = 460;
  close(calculateRecipeNutrition(parent, profiles, [child]).totalKcal, 402 + 282 * 60 / 460);
  assert.equal(calculateRecipeCosting(parent, library, '', [child]).costing?.totalRecipeCost, 13);
  const changed = { ...profiles, sauce: profile('sauce', 564) };
  close(calculateRecipeNutrition(parent, changed, [child]).totalKcal, 402 + 564 * 60 / 460);
});

test('invalid finished yield and quantities fail closed; compatible verified volume and count remain supported', () => {
  const child: Recipe & { nutritionYield: NonNullable<Recipe['nutritionYield']> } = sauce();
  for (const quantity of [0, -1, NaN, Infinity]) assert.equal(resolveLinkedRecipeUsage(child, quantity, 'g').ratio, null);
  child.nutritionYield.quantity = 0; assert.equal(resolveLinkedRecipeUsage(child, 60, 'g').ratio, null);
  child.nutritionYield = { quantity: 1000, unit: 'ml' };
  close(resolveLinkedRecipeUsage(child, 0.06, 'l').ratio || undefined, 0.06);
  child.nutritionYield = { quantity: 10, unit: 'pcs' };
  close(resolveLinkedRecipeUsage(child, 0.5, 'pcs').ratio || undefined, 0.05);
});

test('Seasoning Soy saved measured output contributes 8.3 Partial kcal for 30g without confirmation', () => {
  const child = { ...recipe('soy', [food('soy'), food('unknown')], 8), nutritionYield: { quantity: 290, unit: 'g' as const }, yield: '290g' };
  const parent = { ...recipe('parent', []), linkedRecipes: [link('soy', 30, 'g')] };
  const result = calculateRecipeNutrition(parent, { soy: profile('soy', 80) }, [child]);
  close(result.totalKcal, 80 * 30 / 290);
  assert.equal(result.status, 'ESTIMATED');
  assert.equal(Math.round(result.totalKcal! * 10) / 10, 8.3);
  assert.equal(child.nutritionYield.quantity, 290);
});
