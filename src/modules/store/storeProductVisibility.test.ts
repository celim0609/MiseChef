import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildUpdatedStoreProduct,
  filterAdminStoreProducts,
  filterPublicAvailableProducts,
  getStoreProductEditorDraft,
  getStoreProductEditorPresentation,
  getStoreProductValidationTarget
} from './storeProductVisibility';
import type { StoreProduct, StoreProductDraft } from './types';

const product = (
  id: string,
  workspaceId: string,
  available: boolean,
  name = id
): StoreProduct => ({
  id,
  storeId: workspaceId,
  workspaceId,
  photoUrl: `https://example.test/${id}.jpg`,
  name,
  description: `${name} description`,
  price: 12.5,
  available,
  optionGroupIds: ['size'],
  createdBy: 'owner-1',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z'
});

const products = [
  product('available', 'workspace-a', true, 'Available Croissant'),
  product('unavailable', 'workspace-a', false, 'Seasonal Black Tea'),
  product('other-store', 'workspace-b', true, 'Other Store Product')
];

const serviceSource = readFileSync(new URL('./services/storeService.ts', import.meta.url), 'utf8');
const adminQuerySource = serviceSource.slice(
  serviceSource.indexOf('async listAdminProducts'),
  serviceSource.indexOf('async createProduct')
);
const publicQuerySource = serviceSource.slice(serviceSource.indexOf('async getPublicStore'));

test('admin and public Firestore queries keep availability filtering separate', () => {
  assert.match(adminQuerySource, /where\('workspaceId', '==', workspaceId\)/);
  assert.doesNotMatch(adminQuerySource, /where\('available', '==', true\)/);
  assert.match(publicQuerySource, /where\('storeId', '==', store\.id\)/);
  assert.match(publicQuerySource, /where\('available', '==', true\)/);
});

test('admin Store Products includes available and unavailable products in the current workspace', () => {
  assert.deepEqual(
    filterAdminStoreProducts(products, 'workspace-a', '').map(item => item.id),
    ['available', 'unavailable']
  );
});

test('admin search finds unavailable products case-insensitively by partial name or description', () => {
  assert.deepEqual(
    filterAdminStoreProducts(products, 'workspace-a', 'BLACK te').map(item => item.id),
    ['unavailable']
  );
  assert.deepEqual(
    filterAdminStoreProducts(products, 'workspace-a', 'tea desc').map(item => item.id),
    ['unavailable']
  );
});

test('an unavailable product remains editable and can be made available without changing its identity or links', () => {
  const unavailable = products[1];
  const draft: StoreProductDraft = {
    photoUrl: unavailable.photoUrl,
    name: unavailable.name,
    description: unavailable.description,
    price: unavailable.price,
    available: true,
    optionGroupIds: [...unavailable.optionGroupIds]
  };
  const updated = buildUpdatedStoreProduct(unavailable, draft, '2026-08-23T01:00:00.000Z');

  assert.equal(updated.available, true);
  assert.equal(updated.id, unavailable.id);
  assert.equal(updated.workspaceId, unavailable.workspaceId);
  assert.equal(updated.photoUrl, unavailable.photoUrl);
  assert.deepEqual(updated.optionGroupIds, unavailable.optionGroupIds);
});

test('product editor copy clearly distinguishes Add and Edit modes', () => {
  assert.deepEqual(getStoreProductEditorPresentation(null), {
    title: 'Add Product',
    context: 'Create a new product for this Store.',
    primaryAction: 'Add Product',
    cancelAction: 'Cancel'
  });
  assert.deepEqual(getStoreProductEditorPresentation(products[1]), {
    title: 'Edit Product',
    context: 'Editing: Seasonal Black Tea',
    primaryAction: 'Save Changes',
    cancelAction: 'Cancel Edit'
  });
});

test('Edit loads the selected unavailable product into an independent draft', () => {
  const selectedProduct = products[1];
  const draft = getStoreProductEditorDraft(selectedProduct);

  assert.deepEqual(draft, {
    photoUrl: selectedProduct.photoUrl,
    name: 'Seasonal Black Tea',
    description: selectedProduct.description,
    price: 12.5,
    available: false,
    optionGroupIds: ['size']
  });
  assert.notEqual(draft.optionGroupIds, selectedProduct.optionGroupIds);
});

test('validation messages map to the first appropriate editable field', () => {
  assert.equal(getStoreProductValidationTarget('Product photo is required.'), 'photo');
  assert.equal(getStoreProductValidationTarget('Product name is required.'), 'name');
  assert.equal(getStoreProductValidationTarget('Product description must be shorter.'), 'description');
  assert.equal(getStoreProductValidationTarget('Enter a valid product price.'), 'price');
  assert.equal(getStoreProductValidationTarget('Add at least one option choice.'), 'options');
});

test('Store Product editor scrolls into view and returns focus to the saved product', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

  assert.match(source, /setEditingProduct\(product\);[\s\S]*setProductDraft\(getStoreProductEditorDraft\(product\)\)/);
  assert.match(source, /productFormRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(source, /productNameInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /layoutFrame = window\.requestAnimationFrame[\s\S]*focusFrame = window\.requestAnimationFrame/);
  assert.match(source, /card\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(source, /card\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /data-product-form-mode=\{editingProduct \? 'edit' : 'add'\}/);
  assert.match(source, /setProducts\(current => \[[\s\S]*savedProduct,[\s\S]*product\.id !== savedProduct\.id/);
  assert.match(source, /setRecentlySavedProductId\(savedProduct\.id\)/);
});

test('validation failure remains in edit mode and focuses the invalid field', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const validationStart = source.indexOf('if (preflightError || optionError)');
  const validationEnd = source.indexOf('setIsSaving(true)', validationStart);
  const validationBranch = source.slice(validationStart, validationEnd);

  assert.ok(validationStart >= 0);
  assert.match(validationBranch, /setErrorMessage\(validationMessage\)/);
  assert.match(validationBranch, /focusProductValidationError\(validationMessage\)/);
  assert.match(validationBranch, /return;/);
  assert.doesNotMatch(validationBranch, /setEditingProduct\(null\)|setIsProductFormOpen\(false\)|setRecentlySavedProductId/);
  assert.match(source, /target === 'name'[\s\S]*productNameInputRef\.current/);
  assert.match(source, /productFormRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test('Cancel Edit clears the draft and edit identity without saving', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const closeStart = source.indexOf('const closeProductForm = () =>');
  const closeEnd = source.indexOf('const openProductEditor', closeStart);
  const closeHandler = source.slice(closeStart, closeEnd);

  assert.ok(closeStart >= 0);
  assert.match(closeHandler, /setEditingProduct\(null\)/);
  assert.match(closeHandler, /setProductDraft\(emptyProductDraft\(\)\)/);
  assert.match(closeHandler, /setProductOptions\(\[\]\)/);
  assert.match(closeHandler, /setIsProductFormOpen\(false\)/);
  assert.doesNotMatch(closeHandler, /updateProduct|createProduct|setProducts/);
  assert.match(source, /onClick=\{closeProductForm\}[\s\S]*\{productEditorPresentation\.cancelAction\}/);
});

test('public Store includes only available products for the requested Store and restores a re-enabled product', () => {
  assert.deepEqual(
    filterPublicAvailableProducts(products, 'workspace-a').map(item => item.id),
    ['available']
  );

  const reEnabled = { ...products[1], available: true };
  assert.deepEqual(
    filterPublicAvailableProducts([products[0], reEnabled, products[2]], 'workspace-a').map(item => item.id),
    ['available', 'unavailable']
  );
});

test('admin and public product filtering preserve Store/workspace isolation', () => {
  assert.deepEqual(
    filterAdminStoreProducts(products, 'workspace-b', '').map(item => item.id),
    ['other-store']
  );
  assert.deepEqual(
    filterPublicAvailableProducts(products, 'workspace-b').map(item => item.id),
    ['other-store']
  );
});
