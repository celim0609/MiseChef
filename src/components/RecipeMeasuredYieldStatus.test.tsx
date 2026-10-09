import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import RecipeDetailModal from './RecipeDetailModal';
import { RecipeMeasuredYieldStatus } from './RecipeMeasuredYieldStatus';
import { RecipeNutritionResult } from './RecipeNutritionResult';
import type { Recipe, IngredientNutritionProfile } from '../types';
import { calculateRecipeNutrition } from '../modules/nutrition/services/recipeNutritionCalculator';
const child = { id: 'soy', workspaceId: 'workspace', title: 'Seasoning Soy', servings: 1, yield: '290g', ingredients: [{ id: 'sugar', ingredientId: 'sugar', name: 'Sugar', qty: '20', unit: 'g' }, { id: 'missing', name: 'Soy sauce', qty: '100', unit: 'ml' }] } as Recipe;
const parent = { id: 'bihun', workspaceId: 'workspace', title: 'Wok fried bihun', servings: 1, ingredients: [{ id: 'base', ingredientId: 'base', name: 'Base', qty: '100', unit: 'g' }, { id: 'associated', name: 'Seasoning soy', qty: '40', unit: 'g' }, { id: 'box', ingredientId: 'box650', name: 'Box', qty: '1', unit: 'pcs' }], linkedRecipes: [{ id: 'link', recipeId: 'soy', recipeTitle: 'Seasoning Soy', quantity: 40, unit: 'g', nutritionUseAssociatedQuantity: false, associatedIngredientId: 'associated' }] } as Recipe;
const profile = (id: string, kcalPer100g: number): IngredientNutritionProfile => ({ id, ingredientId: id, workspaceId: 'workspace', kind: 'food', status: 'approved', source: 'chef_override', kcalPer100g, confirmedBy: 'owner', confirmedAt: '', updatedAt: '' });
const profiles = { base: profile('base', 47.525), sugar: profile('sugar', 401), box650: { ...profile('box650', 0), kind: 'non_food' as const, source: 'chef_non_food' as const, kcalPer100g: undefined } };

test('live-shaped legacy 290g / 40g link stays unavailable and renders the specific reason', () => {
  const before = JSON.stringify({ child, parent, profiles });
  const result = calculateRecipeNutrition(parent, profiles, [child]);
  assert.equal(result.totalKcal, 47.525);
  assert.equal(result.status, 'ESTIMATED');
  assert.equal(result.ingredientBreakdown?.find(row => row.id === 'link')?.kcal, undefined);
  assert.equal(result.ingredientBreakdown?.filter(row => row.name === 'Seasoning Soy').length, 1);
  assert.ok(!result.ingredientBreakdown?.some(row => row.id === 'associated' || row.id === 'box'));
  assert.equal(result.totalIngredientCount, 2);
  const html = renderToStaticMarkup(<RecipeNutritionResult nutrition={result} />);
  assert.match(html, /explicitly confirmed finished yield is required/);
  assert.match(html, /Seasoning Soy/);
  assert.match(html, /—/);
  assert.equal(JSON.stringify({ child, parent, profiles }), before);
});

test('only an explicit compatible measured yield enables 11.062 Partial kcal and one contribution', () => {
  const verified = { ...child, nutritionYield: { quantity: 290, unit: 'g' as const } };
  const result = calculateRecipeNutrition(parent, profiles, [verified]);
  assert.equal(result.status, 'ESTIMATED');
  assert.ok(Math.abs(result.ingredientBreakdown!.find(row => row.id === 'link')!.kcal! - 80.2 * 40 / 290) < 1e-9);
  assert.ok(Math.abs(result.totalKcal! - (47.525 + 80.2 * 40 / 290)) < 1e-9);
  assert.match(renderToStaticMarkup(<RecipeNutritionResult nutrition={result} />), /11.06 kcal/);
  const incompatible = calculateRecipeNutrition(parent, profiles, [{ ...verified, nutritionYield: { quantity: 290, unit: 'ml' } }]);
  assert.equal(incompatible.ingredientBreakdown!.find(row => row.id === 'link')!.kcal, undefined);
});

test('child detail distinguishes saved display text from verified finished yield without a second confirmation', () => {
  const html = renderToStaticMarkup(<RecipeMeasuredYieldStatus recipe={child} measuredLinkNeedsYield />);
  assert.match(html, /290g.*display text only/);
  assert.match(html, /Measured finished yield not set/);
  const verified = renderToStaticMarkup(<RecipeMeasuredYieldStatus recipe={{ ...child, nutritionYield: { quantity: 290, unit: 'g' } }} measuredLinkNeedsYield />);
  assert.match(verified, /Confirmed finished yield:.*290.*g/);
  assert.doesNotMatch(verified, /not set|display text only/);
  assert.equal(renderToStaticMarkup(<RecipeMeasuredYieldStatus recipe={child} />), '');
});


test('Recipe detail renders the diagnostic for the persisted measured link, but not another workspace', () => {
  const actions = { onClose() {}, onEdit() {}, onDuplicate() {}, onShare() {}, onDelete() {}, onToggleFavorite() {} };
  const render = (recipes: Recipe[]) => renderToStaticMarkup(<RecipeDetailModal recipe={{ ...child, method: [], categories: [] }} recipes={recipes} {...actions} />);
  assert.match(render([parent]), /290g.*display text only/);
  assert.doesNotMatch(render([{ ...parent, workspaceId: 'other' }]), /Measured finished yield not set/);
});
