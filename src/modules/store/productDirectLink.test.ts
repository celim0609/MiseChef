import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePublicRoute } from '../public/publicRoutes';
import { createStoreProductSlug } from './storeModel';
import { buildUpdatedStoreProduct, filterPublicAvailableProducts, resolvePublicStoreProduct } from './storeProductVisibility';
import type { StoreProduct } from './types';

const product = (id: string, productSlug?: string): StoreProduct => ({
  id,
  ...(productSlug ? { productSlug } : {}),
  storeId: 'store-a', workspaceId: 'store-a', photoUrl: 'https://example.test/product.jpg',
  name: 'Banana Muffin', description: 'Fresh today', price: 8, available: true,
  optionGroupIds: [], createdBy: 'owner', createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z'
});

test('existing Store and direct Product routes parse independently', () => {
  assert.deepEqual(resolvePublicRoute('/store/grab-go'), { page: 'store', slug: 'grab-go' });
  assert.deepEqual(resolvePublicRoute('/store/grab-go/product/banana-muffin-abc123'), {
    page: 'store-product', storeSlug: 'grab-go', productSlug: 'banana-muffin-abc123'
  });
});

test('new product slugs are URL-safe, stable, and Store-scoped unique by immutable product id', () => {
  const first = createStoreProductSlug('Banana Muffin', 'AbC123');
  const second = createStoreProductSlug('Banana Muffin', 'Def456');
  assert.equal(first, 'banana-muffin-AbC123');
  assert.match(first, /^[a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9]+$/);
  assert.notEqual(first, second);
});

test('renaming a product preserves its existing public slug', () => {
  const original = product('abc123', 'banana-muffin-abc123');
  const renamed = buildUpdatedStoreProduct(original, {
    photoUrl: original.photoUrl, name: 'Chocolate Banana Muffin', description: original.description,
    price: original.price, available: true, optionGroupIds: []
  }, '2026-09-15T01:00:00.000Z');
  assert.equal(renamed.productSlug, original.productSlug);
});

test('direct Product lookup resolves only the matching public product and legacy products still render', () => {
  const direct = product('abc123', 'banana-muffin-abc123');
  const legacy = product('legacy');
  const visible = filterPublicAvailableProducts([direct, legacy], 'store-a');
  assert.equal(resolvePublicStoreProduct(visible, 'banana-muffin-abc123')?.id, 'abc123');
  assert.equal(resolvePublicStoreProduct(visible, 'missing-product'), null);
  assert.deepEqual(visible.map(item => item.id), ['abc123', 'legacy']);
});

test('direct Product page retains the existing cart action and has a safe invalid-product state', () => {
  const source = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /startAddingProduct\(product\)/);
  assert.match(source, /This product is not available/);
  assert.match(source, /scrollIntoView/);
});

test('rules require a slug on new products and preserve it on later edits without exposing private products', () => {
  const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /\('productSlug' in request\.resource\.data\)/);
  assert.match(rules, /request\.resource\.data\.productSlug == resource\.data\.productSlug/);
  assert.match(rules, /allow read: if resource\.data\.available == true/);
});
