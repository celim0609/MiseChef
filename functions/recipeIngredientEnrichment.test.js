import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECIPE_INGREDIENT_CATALOG,
  findRecipeIngredientFamily,
  findRecipeIngredientVariant,
  normalizeRecipeIngredientName,
  resolverOptions
} from './recipeIngredientEnrichment.js';

const coverage = names => names.reduce((result, name) => {
  const family = findRecipeIngredientFamily(name);
  if (!family) result.unmatched += 1;
  else if (family.variantKey) result.safe += 1;
  else result.askOnce += 1;
  return result;
}, { safe: 0, askOnce: 0, unmatched: 0 });

test('safe curated aliases resolve without fuzzy matching', () => {
  assert.equal(findRecipeIngredientFamily(' 白糖 ')?.variantKey, 'granulated-sugar');
  assert.equal(findRecipeIngredientFamily('plain flour')?.variantKey, 'all-purpose-flour');
  assert.equal(findRecipeIngredientFamily('corn oil')?.variantKey, 'corn-oil');
  assert.equal(findRecipeIngredientFamily('vegetable oil'), null);
  assert.equal(findRecipeIngredientFamily('olive oils'), null);
  assert.equal(normalizeRecipeIngredientName('Chicken   Breast'), 'chicken breast');
});

test('ASK ONCE families expose culinary choices only', () => {
  const cream = findRecipeIngredientFamily('cream');
  assert.deepEqual(resolverOptions(cream).map(option => option.label), [
    'Heavy · Whipping', 'Half-and-half', 'Light · Table'
  ]);
  assert.equal(findRecipeIngredientVariant(cream, 'cream.heavy')?.fdcId, '170859');

  const egg = findRecipeIngredientFamily('egg');
  assert.equal(findRecipeIngredientVariant(egg, 'egg.yolk-raw')?.fdcId, '172184');
  assert.equal(findRecipeIngredientFamily('egg yolk')?.variantKey, 'egg.yolk-raw');
});

test('explicit qualifiers bypass remembered ASK ONCE defaults', () => {
  assert.equal(findRecipeIngredientFamily('skim milk')?.variantKey, 'milk.skim');
  assert.equal(findRecipeIngredientFamily('unsalted butter')?.variantKey, 'butter.unsalted');
  assert.equal(findRecipeIngredientFamily('cooked pasta')?.variantKey, 'pasta.cooked');
  assert.equal(findRecipeIngredientFamily('raw shrimp')?.variantKey, 'shrimp.raw');
  assert.equal(findRecipeIngredientFamily('ground beef')?.askOnce?.length, 2);
});

test('unsafe broad and specialty terms remain unresolved', () => {
  for (const value of [
    'vegetable oil', 'baking powder', 'cheese', 'stock', 'fish', 'beef',
    'chocolate', 'vinegar', 'chili powder', 'curry powder', 'pasta sauce',
    'hot sauce', 'gluten free flour', 'oat milk', 'cooking wine'
  ]) {
    assert.equal(findRecipeIngredientFamily(value), null, value);
  }
});

test('muffin catalog coverage avoids Search/Link for every safe or ASK ONCE line', () => {
  const result = coverage([
    'plain flour', 'brown sugar', 'cocoa powder', 'baking soda', 'egg',
    'milk', 'unsalted butter', 'vanilla extract', 'salt', 'baking powder'
  ]);
  assert.deepEqual(result, { safe: 7, askOnce: 2, unmatched: 1 });
});

test('pasta catalog coverage keeps cheese deliberately unresolved', () => {
  const result = coverage([
    'dry pasta', 'olive oil', 'onion', 'garlic', 'tomato', 'fresh basil',
    'parmesan', 'chicken breast', 'salt', 'black pepper'
  ]);
  assert.deepEqual(result, { safe: 8, askOnce: 1, unmatched: 1 });
});

test('chicken main catalog coverage resolves all lines after one culinary choice', () => {
  const result = coverage([
    'chicken breast', 'potato', 'carrot', 'broccoli', 'onion', 'garlic',
    'olive oil', 'lemon juice', 'salt', 'black pepper'
  ]);
  assert.deepEqual(result, { safe: 9, askOnce: 1, unmatched: 0 });
});

test('Asian rice/noodle catalog coverage leaves only intentionally unsupported items', () => {
  const result = coverage([
    'dried rice noodles', 'sesame oil', 'soy sauce', 'ginger', 'garlic',
    'scallion', 'carrot', 'raw shrimp', 'canned coconut milk', 'lime juice',
    'fish sauce'
  ]);
  assert.deepEqual(result, { safe: 9, askOnce: 0, unmatched: 2 });
});

test('catalog keeps nine generic workspace ASK ONCE families', () => {
  assert.equal(RECIPE_INGREDIENT_CATALOG.filter(entry => entry.askOnce).length, 9);
});
