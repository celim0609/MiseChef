import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicRecipeProjection } from './publicRecipeProjection.js';

test('public Recipe projection allowlists presentation data and removes every internal field', () => {
  const projection = buildPublicRecipeProjection({
    id: 'recipe-a',
    workspaceId: 'workspace-secret',
    companyId: 'workspace-secret',
    userId: 'creator-secret',
    createdBy: 'creator-secret',
    createdByName: 'Original Creator',
    title: 'Teh Ice',
    coverImage: 'https://example.com/teh.jpg',
    category: 'Drinks',
    prepTime: 5,
    cookTime: 2,
    servings: 2,
    yield: '2 glasses',
    story: 'A public story.',
    chefNotes: 'Internal preparation secret.',
    sellingPrice: 12,
    costing: { totalRecipeCost: 2.5, costPerPortion: 1.25 },
    recipeCostLastCalculatedAt: 'today',
    supplierId: 'supplier-secret',
    invoiceId: 'invoice-secret',
    ingredients: [{
      id: 'row-secret', ingredientId: 'library-secret', name: 'Tea', qty: '10', unit: 'g',
      unitCost: 1.5, ingredientCost: 15, costLastCalculatedAt: 'today', costingWarning: 'secret', notes: 'chilled'
    }],
    method: [{ id: 'step-secret', stepNumber: 1, description: 'Mix.' }],
    recommendedProductIds: ['catalog-secret'],
    visibility: 'public'
  }, 'chef-name');

  assert.deepEqual(Object.keys(projection).sort(), [
    'categories', 'category', 'chefName', 'chefUsername', 'cookTime', 'coverImage', 'createdAt',
    'ingredients', 'method', 'prepTime', 'recommendedProducts', 'servings', 'story', 'title',
    'visibility', 'yield'
  ].sort());
  assert.deepEqual(projection.ingredients, [{ name: 'Tea', notes: 'chilled', qty: '10', unit: 'g' }]);
  assert.deepEqual(projection.method, [{ description: 'Mix.', stepNumber: 1 }]);
  assert.equal(JSON.stringify(projection).includes('secret'), false);
});

