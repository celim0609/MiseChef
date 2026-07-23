import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVED_MERCHANT_DOMAINS,
  createPublicProductClickHandler,
  isApprovedMerchantHostname,
  normalizeProductIdentifier
} from './publicProductClickTracking.js';
import { sanitizePublicRecommendedProducts } from './publicRecipeProjection.js';
import {
  combineRecommendedProducts,
  normalizeRecommendedProductIds,
  resolveApprovedCatalogProducts,
  toApprovedProductSummary
} from './approvedProductCatalog.js';
import { createPublicProductIntegrityRevision } from './publicProductIntegrity.js';

const APPROVED_DOMAINS = ['merchant.example'];

test('production allowlist contains only the approved Shopee redirect domain', () => {
  assert.deepEqual(APPROVED_MERCHANT_DOMAINS, ['s.shopee.sg']);
  assert.equal(isApprovedMerchantHostname('s.shopee.sg'), true);
  assert.equal(isApprovedMerchantHostname('offers.s.shopee.sg'), true);
  assert.equal(isApprovedMerchantHostname('s.shopee.sg.evil.test'), false);
  assert.equal(isApprovedMerchantHostname('not-s.shopee.sg'), false);
});

test('public recommendations preserve safe optional product images', () => {
  assert.deepEqual(sanitizePublicRecommendedProducts([
    { name: 'Bread Flour', url: 'https://s.shopee.sg/example', image: '/assets/products/redman-bread-flour-1kg.jpg' },
    { name: 'Milk Powder', url: 'https://s.shopee.sg/another' }
  ]), [
    { name: 'Bread Flour', url: 'https://s.shopee.sg/example', image: '/assets/products/redman-bread-flour-1kg.jpg' },
    { name: 'Milk Powder', url: 'https://s.shopee.sg/another' }
  ]);
});

test('unsafe product image paths are omitted without removing the product', () => {
  assert.deepEqual(sanitizePublicRecommendedProducts([
    { name: 'Bread Flour', url: 'https://s.shopee.sg/example', image: 'https://evil.test/tracker.gif' }
  ]), [
    { name: 'Bread Flour', url: 'https://s.shopee.sg/example' }
  ]);
});

test('catalog product ids are deduplicated without changing saved order', () => {
  assert.deepEqual(normalizeRecommendedProductIds(['catalog_b', 'catalog_a', 'catalog_b', '', '../unsafe']), [
    'catalog_b',
    'catalog_a'
  ]);
});

test('catalog products resolve from server data in recipe order and omit inactive entries', async () => {
  const products = new Map([
    ['catalog_a', { name: 'Bread Flour', affiliateUrl: 'https://s.shopee.sg/flour', merchantHostname: 's.shopee.sg', imageUrl: 'https://firebasestorage.googleapis.com/image-a', active: true }],
    ['catalog_b', { name: 'Dry Yeast', affiliateUrl: 'https://s.shopee.sg/yeast', merchantHostname: 's.shopee.sg', active: true }],
    ['catalog_c', { name: 'Inactive', affiliateUrl: 'https://s.shopee.sg/inactive', merchantHostname: 's.shopee.sg', active: false }]
  ]);

  assert.deepEqual(await resolveApprovedCatalogProducts(
    ['catalog_b', 'catalog_c', 'catalog_a', 'catalog_b'],
    async id => products.get(id)
  ), [
    { name: 'Dry Yeast', url: 'https://s.shopee.sg/yeast' },
    { name: 'Bread Flour', url: 'https://s.shopee.sg/flour', image: 'https://firebasestorage.googleapis.com/image-a' }
  ]);
});

test('public ordering is legacy first followed by catalog selection order', () => {
  const legacy = [{ name: 'Legacy Flour', url: 'https://s.shopee.sg/legacy' }];
  const catalog = [
    { name: 'Dry Yeast', url: 'https://s.shopee.sg/yeast' },
    { name: 'Bread Flour', url: 'https://s.shopee.sg/flour' }
  ];
  assert.deepEqual(combineRecommendedProducts(legacy, catalog), [...legacy, ...catalog]);
});

test('chef catalog summaries never contain affiliate destinations', () => {
  assert.deepEqual(toApprovedProductSummary('catalog_a', {
    name: 'Bread Flour',
    affiliateUrl: 'https://s.shopee.sg/flour',
    merchantHostname: 's.shopee.sg',
    imageUrl: 'https://firebasestorage.googleapis.com/image-a',
    active: true
  }), {
    id: 'catalog_a',
    name: 'Bread Flour',
    imageUrl: 'https://firebasestorage.googleapis.com/image-a',
    active: true
  });
});

test('public projections accept only hashed public product asset URLs', () => {
  const safeImage = 'https://firebasestorage.googleapis.com/v0/b/misechef-fa4bf.firebasestorage.app/o/public-recipe-assets%2F0123456789abcdef0123456789abcdef%2Fproduct-2?alt=media&token=public';
  const internalImage = 'https://firebasestorage.googleapis.com/v0/b/misechef-fa4bf.firebasestorage.app/o/approved-products%2Finternal-id%2Fimage.jpg?alt=media&token=private';
  assert.deepEqual(sanitizePublicRecommendedProducts([
    { name: 'Safe', url: 'https://s.shopee.sg/safe', image: safeImage },
    { name: 'Internal', url: 'https://s.shopee.sg/internal', image: internalImage }
  ]), [
    { name: 'Safe', url: 'https://s.shopee.sg/safe', image: safeImage },
    { name: 'Internal', url: 'https://s.shopee.sg/internal' }
  ]);
});

const createResponse = () => ({
  headers: {},
  statusCode: 200,
  body: '',
  redirectLocation: '',
  set(headers) {
    this.headers = { ...this.headers, ...headers };
    return this;
  },
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  type() {
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  redirect(statusCode, location) {
    this.statusCode = statusCode;
    this.redirectLocation = location;
    return this;
  }
});

const runHandler = async ({
  path = '/go/recipes/recipe_123/products/0',
  url = path,
  method = 'GET',
  recipe = {
    title: 'Radish Cake',
    visibility: 'public',
    recommendedProducts: [{ name: 'Radish Cake Flour', url: 'https://shop.merchant.example/flour?affiliate=abc' }]
  },
  recordClick = async () => undefined,
  redirectManifest = null,
  approvedDomains = APPROVED_DOMAINS
} = {}) => {
  const clicks = [];
  const response = createResponse();
  const handler = createPublicProductClickHandler({
    approvedDomains,
    loadPublicRecipe: async () => recipe,
    loadRedirectManifest: async () => redirectManifest,
    recordClick: async click => {
      clicks.push(click);
      return recordClick(click);
    },
    serverTimestamp: () => 'SERVER_TIMESTAMP'
  });

  await handler({ method, path, url }, response);
  return { response, clicks };
};

test('accepts exact approved domains and their subdomains only', () => {
  assert.equal(isApprovedMerchantHostname('merchant.example', APPROVED_DOMAINS), true);
  assert.equal(isApprovedMerchantHostname('shop.merchant.example', APPROVED_DOMAINS), true);
  assert.equal(isApprovedMerchantHostname('merchant.example.evil.test', APPROVED_DOMAINS), false);
  assert.equal(isApprovedMerchantHostname('notmerchant.example', APPROVED_DOMAINS), false);
});

test('records the approved projection product and redirects to its stored URL', async () => {
  const { response, clicks } = await runHandler();

  assert.equal(response.statusCode, 302);
  assert.equal(response.redirectLocation, 'https://shop.merchant.example/flour?affiliate=abc');
  assert.deepEqual(clicks, [{
    recipeId: 'recipe_123',
    recipeSlug: 'radish-cake',
    productId: 'radish-cake-flour',
    productName: 'Radish Cake Flour',
    destinationHostname: 'shop.merchant.example',
    clickedAt: 'SERVER_TIMESTAMP',
    source: 'public_recipe'
  }]);
});

test('does not accept a browser-supplied destination URL', async () => {
  const { response, clicks } = await runHandler({
    url: '/go/recipes/recipe_123/products/0?url=https://evil.test'
  });

  assert.equal(response.statusCode, 302);
  assert.equal(response.redirectLocation, 'https://shop.merchant.example/flour?affiliate=abc');
  assert.equal(clicks.length, 1);
});

test('returns 404 for an invalid route or product index', async () => {
  const invalidRoute = await runHandler({ path: '/go/recipes/recipe_123/other/0' });
  const invalidIndex = await runHandler({ path: '/go/recipes/recipe_123/products/1' });

  assert.equal(invalidRoute.response.statusCode, 404);
  assert.equal(invalidIndex.response.statusCode, 404);
  assert.equal(invalidIndex.clicks.length, 0);
});

test('blocks destinations outside the merchant allowlist', async () => {
  const { response, clicks } = await runHandler({
    recipe: {
      title: 'Radish Cake',
      visibility: 'public',
      recommendedProducts: [{ name: 'Unsafe Product', url: 'https://merchant.example.evil.test/item' }]
    }
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.redirectLocation, '');
  assert.equal(clicks.length, 0);
});

test('redirects a valid product when the tracking write fails', async () => {
  const { response } = await runHandler({
    recordClick: async () => { throw new Error('write failed'); }
  });

  assert.equal(response.statusCode, 302);
  assert.equal(response.redirectLocation, 'https://shop.merchant.example/flour?affiliate=abc');
});

test('uses a revision-matched private creator manifest without exposing the URL publicly', async () => {
  const publicRecipe = {
    title: 'Bread',
    visibility: 'public',
    recommendedProducts: [{ name: 'Bread Flour' }]
  };
  const products = [{
      attributionType: 'creator_affiliate',
      productIndex: 0,
      productName: 'Bread Flour',
      creatorCode: 'MC002',
      catalogProductId: 'bread_flour',
      destinationUrl: 'https://shop.merchant.example/creator',
      destinationHostname: 'shop.merchant.example'
    }];
  const revision = createPublicProductIntegrityRevision({
    recipeId: 'recipe_123',
    publicRecipe,
    redirectProducts: products
  });
  const recipe = { ...publicRecipe, revision };
  const redirectManifest = {
    revision,
    products
  };
  const { response, clicks } = await runHandler({ recipe, redirectManifest });
  assert.equal(response.statusCode, 302);
  assert.equal(response.redirectLocation, 'https://shop.merchant.example/creator');
  assert.deepEqual(clicks[0], {
    recipeId: 'recipe_123',
    recipeSlug: 'bread',
    productId: 'bread-flour',
    productName: 'Bread Flour',
    destinationHostname: 'shop.merchant.example',
    clickedAt: 'SERVER_TIMESTAMP',
    source: 'public_recipe',
    creatorCode: 'MC002',
    catalogProductId: 'bread_flour',
    attributionType: 'creator_affiliate'
  });
  assert.equal(JSON.stringify(recipe).includes('creator'), false);
  assert.equal(JSON.stringify(recipe).includes('merchant.example'), false);
});

test('fails closed when revision, index, name, or manifest length does not match', async () => {
  const publicRecipe = {
    title: 'Bread',
    visibility: 'public',
    recommendedProducts: [{ name: 'Bread Flour' }]
  };
  const validEntry = {
    attributionType: 'creator_affiliate',
    productIndex: 0,
    productName: 'Bread Flour',
    creatorCode: 'MC002',
    catalogProductId: 'bread_flour',
    destinationUrl: 'https://shop.merchant.example/creator'
  };
  const revision = createPublicProductIntegrityRevision({
    recipeId: 'recipe_123',
    publicRecipe,
    redirectProducts: [validEntry]
  });
  const recipe = { ...publicRecipe, revision };
  const cases = [
    { revision: 'other', products: [validEntry] },
    { revision, products: [{ ...validEntry, productIndex: 1 }] },
    { revision, products: [{ ...validEntry, productName: 'Yeast' }] },
    { revision, products: [validEntry, { ...validEntry, productIndex: 1 }] }
  ];
  for (const redirectManifest of cases) {
    const { response, clicks } = await runHandler({ recipe, redirectManifest });
    assert.equal(response.statusCode, 404);
    assert.equal(clicks.length, 0);
  }
});

test('fails closed when a revised public recipe has no private manifest', async () => {
  const { response } = await runHandler({
    recipe: {
      title: 'Bread',
      visibility: 'public',
      revision: 'revision-1',
      recommendedProducts: [{ name: 'Bread Flour' }]
    }
  });
  assert.equal(response.statusCode, 404);
});

test('rejects non-public recipes, credentialed URLs, and non-GET requests', async () => {
  const privateRecipe = await runHandler({ recipe: { visibility: 'private', recommendedProducts: [] } });
  const credentialedUrl = await runHandler({
    recipe: {
      title: 'Radish Cake',
      visibility: 'public',
      recommendedProducts: [{ name: 'Unsafe Product', url: 'https://user:pass@merchant.example/item' }]
    }
  });
  const postRequest = await runHandler({ method: 'POST' });

  assert.equal(privateRecipe.response.statusCode, 404);
  assert.equal(credentialedUrl.response.statusCode, 404);
  assert.equal(postRequest.response.statusCode, 404);
});

test('normalizes product identifiers without including destination data', () => {
  assert.equal(normalizeProductIdentifier('  Crème brûlée Mix  '), 'creme-brulee-mix');
});
