import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultLinkedRecipeUnit } from './linkedRecipeUsage';

test('new links reuse explicit saved mass Yield or verified structured output', () => {
  assert.equal(getDefaultLinkedRecipeUnit({ servings: 8, nutritionYield: { quantity: 290, unit: 'g' } }), 'g');
  assert.equal(getDefaultLinkedRecipeUnit({ servings: 8, nutritionYield: { quantity: 290, unit: 'ml' } }), 'ml');
  assert.equal(getDefaultLinkedRecipeUnit({ servings: 8, nutritionYield: { quantity: 0, unit: 'g' } }), 'portion');
  assert.equal(getDefaultLinkedRecipeUnit({ servings: 8, yield: '290g' }), 'g');
});
