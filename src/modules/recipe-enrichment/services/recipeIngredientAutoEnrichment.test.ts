import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ingredient } from '../../../types';
import {
  getPendingRecipeIngredientEnrichmentTargets,
  markUnlinkedRecipeIngredientRowsForAutoEnrichment
} from './recipeIngredientAutoEnrichment';

const ingredient = (id: string, name: string, ingredientId?: string) => ({
  id, name, qty: '1', unit: 'g', ...(ingredientId ? { ingredientId } : {})
}) as Ingredient;

test('marks every unlinked ingredient in a multi-ingredient import for one-time enrichment', () => {
  const pending = new Set<string>();
  const imported = [
    ingredient('flour', 'Plain flour'),
    ingredient('soda', 'Baking soda'),
    ingredient('linked', 'Salt', 'existing-salt')
  ];

  markUnlinkedRecipeIngredientRowsForAutoEnrichment(imported, pending);

  assert.deepEqual([...pending].sort(), ['flour', 'soda']);
  assert.deepEqual(
    getPendingRecipeIngredientEnrichmentTargets(imported, pending, new Map()).map(item => item.id),
    ['flour', 'soda']
  );
});

test('does not repeat an attempted row and retries only when its name changes', () => {
  const pending = new Set(['flour']);
  const attempted = new Map([['flour', 'Plain flour']]);
  const original = [ingredient('flour', 'Plain flour')];
  const renamed = [ingredient('flour', 'All-purpose flour')];

  assert.deepEqual(getPendingRecipeIngredientEnrichmentTargets(original, pending, attempted), []);
  assert.deepEqual(getPendingRecipeIngredientEnrichmentTargets(renamed, pending, attempted).map(item => item.name), ['All-purpose flour']);
});
