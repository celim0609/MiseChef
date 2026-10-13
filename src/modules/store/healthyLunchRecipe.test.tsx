import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HealthyLunchCheckoutDates } from './HealthyLunchCheckoutDates';
import { syncHealthyLunchRecipe, prepareHealthyLunchDraft } from './storeProductVisibility';
import type { Recipe } from '../../types';

const meal = { name: 'Manual meal', photoUrl: 'manual.jpg', price: 17, calories: 120, description: 'Manual description' };
const recipe = { id: 'recipe-1', title: ' Recipe lunch ', imageUrl: 'recipe.jpg', story: 'Lunch description', sellingPrice: 99 } as Recipe;
test('Recipe sync copies display data, preserves selling price and source objects', () => {
  const linked = syncHealthyLunchRecipe(meal, recipe, { status: 'COMPLETE', totalKcal: 800, kcalPerServing: 400, incompleteReasons: [] });
  assert.deepEqual(linked, { ...meal, recipeId: recipe.id, name: 'Recipe lunch', photoUrl: 'recipe.jpg', calories: 400, description: 'Lunch description' });
  assert.equal(meal.calories, 120);
  assert.equal(linked.price, 17);
  const resynced = syncHealthyLunchRecipe({ ...linked, price: 21 }, { ...recipe, title: 'Updated Recipe' });
  assert.equal(resynced.price, 21);
  assert.equal(resynced.name, 'Updated Recipe');
  assert.equal(resynced.calories, undefined);
  assert.equal('estimatedCost' in linked, false);
});
test('manual meals stay supported and Recipe links survive menu preparation', () => {
  const meals = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map(day => [day, day === 'mon' ? syncHealthyLunchRecipe(meal, recipe) : meal]));
  const draft = prepareHealthyLunchDraft({ name: 'Lunch', photoUrl: '', description: '', price: 75, available: true, optionGroupIds: [], weeklyMenuVersion: 2, weeklyWeeks: { week2: { startMonday: '2026-10-19', meals } } } as any);
  assert.equal((draft.weeklyWeeks!.week2!.meals.mon as any).recipeId, recipe.id);
  assert.equal((draft.weeklyWeeks!.week2!.meals.tue as any).recipeId, undefined);
});
for (const method of ['pickup', 'delivery'] as const) test(`checkout shows actual ${method} dates once and Store-hours guidance`, () => {
  const html = renderToStaticMarkup(<HealthyLunchCheckoutDates method={method} dates={['2026-10-19', '2026-10-19']} />);
  assert.equal((html.match(new RegExp(`Selected ${method} date:`, 'g')) || []).length, 1);
  assert.match(html, /Mon, 19 Oct/);
  assert.ok(html.includes(`Choose ${method} time within Store hours.`));
  assert.ok(!html.includes('next available day'));
});
