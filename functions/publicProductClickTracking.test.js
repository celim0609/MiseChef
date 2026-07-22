import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVED_MERCHANT_DOMAINS,
  createPublicProductClickHandler,
  isApprovedMerchantHostname,
  normalizeProductIdentifier
} from './publicProductClickTracking.js';

const APPROVED_DOMAINS = ['merchant.example'];

test('production allowlist contains only the approved Shopee redirect domain', () => {
  assert.deepEqual(APPROVED_MERCHANT_DOMAINS, ['s.shopee.sg']);
  assert.equal(isApprovedMerchantHostname('s.shopee.sg'), true);
  assert.equal(isApprovedMerchantHostname('offers.s.shopee.sg'), true);
  assert.equal(isApprovedMerchantHostname('s.shopee.sg.evil.test'), false);
  assert.equal(isApprovedMerchantHostname('not-s.shopee.sg'), false);
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
  approvedDomains = APPROVED_DOMAINS
} = {}) => {
  const clicks = [];
  const response = createResponse();
  const handler = createPublicProductClickHandler({
    approvedDomains,
    loadPublicRecipe: async () => recipe,
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
