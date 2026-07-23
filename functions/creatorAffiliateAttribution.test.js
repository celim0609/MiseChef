import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCreatorCode,
  resolveCreatorCatalogProducts,
  sanitizeVerifiedCreatorProductLink
} from './creatorAffiliateAttribution.js';
import { buildPublicRecipeProjection } from './publicRecipeProjection.js';
import { createPublicProductIntegrityRevision } from './publicProductIntegrity.js';

const verifiedAt = { seconds: 1, nanoseconds: 0 };
const verifiedLink = {
  creatorCode: 'MC002',
  productId: 'bread_flour',
  affiliateUrl: 'https://s.shopee.sg/creator-link',
  merchantHostname: 's.shopee.sg',
  active: true,
  verifiedAt,
  verifiedBy: 'admin_uid'
};

test('normalizes only non-personal MC creator codes', () => {
  assert.equal(normalizeCreatorCode(' mc002 '), 'MC002');
  assert.equal(normalizeCreatorCode('MC2'), '');
  assert.equal(normalizeCreatorCode('chef@example.com'), '');
  assert.equal(normalizeCreatorCode('MC002<script>'), '');
});

test('accepts only verified active links on the exact approved hostname', () => {
  assert.deepEqual(sanitizeVerifiedCreatorProductLink(verifiedLink, 'MC002', 'bread_flour'), {
    creatorCode: 'MC002',
    catalogProductId: 'bread_flour',
    destinationUrl: 'https://s.shopee.sg/creator-link',
    destinationHostname: 's.shopee.sg'
  });
  assert.equal(sanitizeVerifiedCreatorProductLink({ ...verifiedLink, active: false }, 'MC002', 'bread_flour'), null);
  assert.equal(sanitizeVerifiedCreatorProductLink({ ...verifiedLink, verifiedAt: undefined }, 'MC002', 'bread_flour'), null);
  assert.equal(sanitizeVerifiedCreatorProductLink({ ...verifiedLink, affiliateUrl: 'https://s.shopee.sg.evil.test/item' }, 'MC002', 'bread_flour'), null);
  assert.equal(sanitizeVerifiedCreatorProductLink({ ...verifiedLink, creatorCode: 'MC003' }, 'MC002', 'bread_flour'), null);
});

test('publishes only products with an active creator profile and verified creator link', async () => {
  const products = new Map([
    ['bread_flour', { name: 'Bread Flour', imageUrl: '/assets/products/flour.jpg', merchantHostname: 's.shopee.sg', active: true }],
    ['yeast', { name: 'Yeast', merchantHostname: 's.shopee.sg', active: true }]
  ]);
  const links = new Map([
    ['bread_flour', verifiedLink],
    ['yeast', { ...verifiedLink, productId: 'yeast', active: false }]
  ]);
  const resolved = await resolveCreatorCatalogProducts({
    creatorCode: 'MC002',
    productIds: ['yeast', 'bread_flour'],
    loadCreatorProfile: async () => ({ creatorCode: 'MC002', userId: 'chef_uid', active: true }),
    loadProduct: async id => products.get(id),
    loadCreatorProductLink: async (_code, id) => links.get(id)
  });

  assert.deepEqual(resolved, [{
    publicProduct: { name: 'Bread Flour', image: '/assets/products/flour.jpg' },
    redirect: {
      attributionType: 'creator_affiliate',
      productIndex: -1,
      productName: 'Bread Flour',
      creatorCode: 'MC002',
      catalogProductId: 'bread_flour',
      destinationUrl: 'https://s.shopee.sg/creator-link',
      destinationHostname: 's.shopee.sg'
    }
  }]);
  assert.equal(JSON.stringify(resolved).includes('chef_uid'), false);
});

test('does not publish when the creator profile is absent or inactive', async () => {
  const resolve = active => resolveCreatorCatalogProducts({
    creatorCode: 'MC002',
    productIds: ['bread_flour'],
    loadCreatorProfile: async () => active === null ? null : ({ creatorCode: 'MC002', userId: 'chef_uid', active }),
    loadProduct: async () => ({ name: 'Bread Flour', merchantHostname: 's.shopee.sg', active: true }),
    loadCreatorProductLink: async () => verifiedLink
  });
  assert.deepEqual(await resolve(null), []);
  assert.deepEqual(await resolve(false), []);
});

test('integrity revision is deterministic and changes when product order changes', () => {
  const publicRecipe = { title: 'Bread', recommendedProducts: [{ name: 'Flour' }, { name: 'Yeast' }] };
  const products = [
    { productIndex: 0, productName: 'Flour', destinationUrl: 'https://s.shopee.sg/flour' },
    { productIndex: 1, productName: 'Yeast', destinationUrl: 'https://s.shopee.sg/yeast' }
  ];
  const first = createPublicProductIntegrityRevision({ recipeId: 'recipe_1', publicRecipe, redirectProducts: products });
  const second = createPublicProductIntegrityRevision({ redirectProducts: products, publicRecipe, recipeId: 'recipe_1' });
  const reordered = createPublicProductIntegrityRevision({
    recipeId: 'recipe_1',
    publicRecipe: { ...publicRecipe, recommendedProducts: [...publicRecipe.recommendedProducts].reverse() },
    redirectProducts: [...products].reverse()
  });
  assert.equal(first, second);
  assert.notEqual(first, reordered);
});

test('public recipe projection never exposes creator attribution or creator-specific URLs', () => {
  const projection = buildPublicRecipeProjection({
    title: 'Bread',
    visibility: 'public',
    workspaceId: 'workspace_internal',
    userId: 'user_internal',
    affiliateCreatorCode: 'MC002',
    recommendedProductIds: ['bread_flour'],
    recommendedProducts: [{
      name: 'Bread Flour',
      image: '/assets/products/flour.jpg'
    }]
  });

  assert.deepEqual(projection.recommendedProducts, [{
    name: 'Bread Flour',
    image: '/assets/products/flour.jpg'
  }]);
  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes('MC002'), false);
  assert.equal(serialized.includes('bread_flour'), false);
  assert.equal(serialized.includes('workspace_internal'), false);
  assert.equal(serialized.includes('user_internal'), false);
  assert.equal(serialized.includes('s.shopee.sg'), false);
});
