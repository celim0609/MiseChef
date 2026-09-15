import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePublicRoute } from '../public/publicRoutes';
import { createStoreProductSlug, normalizeStoreProduct } from './storeModel';
import { getProductSocialImageCrop, PRODUCT_SOCIAL_IMAGE } from './productSocialImage';
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

test('Product social images use a fixed JPEG social canvas and preserve their own public URL', () => {
  assert.deepEqual(PRODUCT_SOCIAL_IMAGE, { width: 1200, height: 630, targetBytes: 307200, maxBytes: 614400 });
  assert.deepEqual(getProductSocialImageCrop(2400, 1200), { x: 57, y: 0, width: 2286, height: 1200 });
  assert.deepEqual(getProductSocialImageCrop(1200, 1200), { x: 0, y: 285, width: 1200, height: 630 });
  const normalized = normalizeStoreProduct('one', { id: 'one', productSlug: 'one-one', storeId: 'store-a', workspaceId: 'store-a', photoUrl: 'https://cdn.example/photo.jpg', socialImageUrl: 'https://cdn.example/social.jpg', name: 'One', description: '', price: 1, available: true, optionGroupIds: [], createdBy: 'owner' });
  assert.equal(normalized.socialImageUrl, 'https://cdn.example/social.jpg');
});

test('direct Product lookup resolves only the matching public product and legacy products still render', () => {
  const direct = product('abc123', 'banana-muffin-abc123');
  const legacy = product('legacy');
  const visible = filterPublicAvailableProducts([direct, legacy], 'store-a');
  assert.equal(resolvePublicStoreProduct(visible, 'banana-muffin-abc123')?.id, 'abc123');
  assert.equal(resolvePublicStoreProduct(visible, 'missing-product'), null);
  assert.deepEqual(visible.map(item => item.id), ['abc123', 'legacy']);
});

test('two Product links resolve only their own selected Product', () => {
  const first = product('first', 'first-first');
  const second = { ...product('second', 'second-second'), name: 'Second Product' };
  assert.equal(resolvePublicStoreProduct([first, second], 'first-first')?.id, first.id);
  assert.equal(resolvePublicStoreProduct([first, second], 'second-second')?.id, second.id);
});

test('direct Product page renders standalone content with the existing cart action and safe invalid-product state', () => {
  const source = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /className=\{productSlug \? 'hidden' : 'min-w-0'\}/);
  assert.match(source, /catalogue-main/);
  assert.match(source, /startAddingProduct\(product\)/);
  assert.match(source, /startAddingProduct\(requestedProduct\)/);
  assert.match(source, /standalone-product-title/);
  assert.match(source, /Back to Store/);
  assert.match(source, /Product unavailable/);
  assert.match(source, /getPromotionOfferLabel\(promotionByProduct\.get\(requestedProduct\.id\)!\)/);
  assert.doesNotMatch(source, /productCard\?\.scrollIntoView/);
});

test('rules require a slug on new products and preserve it on later edits without exposing private products', () => {
  const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /\('productSlug' in request\.resource\.data\)/);
  assert.match(rules, /request\.resource\.data\.productSlug == resource\.data\.productSlug/);
  assert.match(rules, /allow read: if resource\.data\.available == true/);
  assert.match(rules, /'socialImageUrl'/);
  assert.match(rules, /data\.socialImageUrl is string/);
});
