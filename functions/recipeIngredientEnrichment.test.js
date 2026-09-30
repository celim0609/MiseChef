import assert from 'node:assert/strict';
import test from 'node:test';
import { findRecipeIngredientFamily, findRecipeIngredientVariant, normalizeRecipeIngredientName, resolverOptions } from './recipeIngredientEnrichment.js';

test('safe curated aliases resolve without fuzzy matching', () => {
  assert.equal(findRecipeIngredientFamily(' 白糖 ')?.variantKey, 'granulated-sugar');
  assert.equal(findRecipeIngredientFamily('olive-oil')?.variantKey, 'olive-oil');
  assert.equal(findRecipeIngredientFamily('olive oils'), null);
  assert.equal(normalizeRecipeIngredientName('Chicken   Breast'), 'chicken breast');
});

test('ask-once families expose culinary choices only', () => {
  const chicken = findRecipeIngredientFamily('鸡胸肉');
  assert.deepEqual(resolverOptions(chicken).map(option => option.label), [
    'Raw · Skinless · Boneless'
  ]);
  assert.equal(findRecipeIngredientVariant(chicken, 'chicken-breast.raw-skinless-boneless')?.fdcId, '171077');
});

test('broad category words remain unresolved', () => {
  for (const value of ['cream', 'cheese', 'stock', 'beef', 'fish']) {
    assert.equal(findRecipeIngredientFamily(value), null, value);
  }
});
