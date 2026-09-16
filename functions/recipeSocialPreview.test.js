import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecipeSocialMetadata, createRecipeSocialPreviewHandler, readRecipeRequest } from './recipeSocialPreview.js';

const shell = '<!doctype html><html><head><title>MiseChef</title></head><body><div id="root"></div></body></html>';
const response = () => ({
  statusCode: 200, headers: {}, body: '', ended: false,
  status(code) { this.statusCode = code; return this; },
  set(key, value) { this.headers[key] = value; return this; },
  send(value) { this.body = value; return this; },
  end() { this.ended = true; }
});

test('recipe route accepts one public recipe segment only', () => {
  assert.deepEqual(readRecipeRequest('/recipes/recipe_123'), { recipeId: 'recipe_123' });
  assert.equal(readRecipeRequest('/recipes'), null);
  assert.equal(readRecipeRequest('/recipes/a/b'), null);
});

test('recipe metadata uses public title, story, cover image, and canonical URL', () => {
  const metadata = buildRecipeSocialMetadata({
    recipeId: 'recipe_123', origin: 'https://misechef.ai',
    recipe: { title: 'Banana Muffin', story: 'Soft and moist.', chefName: 'Chef C', coverImage: 'https://firebasestorage.googleapis.com/cover.jpg' }
  });
  assert.equal(metadata.title, 'Banana Muffin');
  assert.equal(metadata.description, 'Soft and moist.');
  assert.equal(metadata.image, 'https://firebasestorage.googleapis.com/cover.jpg');
  assert.equal(metadata.canonicalUrl, 'https://misechef.ai/recipes/recipe_123');
  assert.equal(metadata.type, 'article');
});

test('public recipe handler renders crawler metadata and private/missing recipes stay unavailable', async () => {
  const handler = createRecipeSocialPreviewHandler({
    projectId: 'misechef-fa4bf', configuredOrigin: 'https://misechef.ai', loadAppShell: async () => shell,
    loadRecipe: async id => id === 'recipe_public' ? { visibility: 'public', title: 'Public Recipe', story: 'Recipe story', coverImage: 'https://firebasestorage.googleapis.com/public.jpg' } : null
  });
  const ok = response();
  await handler({ method: 'GET', path: '/recipes/recipe_public', get: name => name === 'host' ? 'misechef.ai' : '' }, ok);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body, /property="og:title" content="Public Recipe"/);
  assert.match(ok.body, /property="og:image" content="https:\/\/firebasestorage\.googleapis\.com\/public\.jpg"/);
  assert.match(ok.body, /property="og:url" content="https:\/\/misechef\.ai\/recipes\/recipe_public"/);

  const missing = response();
  await handler({ method: 'GET', path: '/recipes/recipe_private', get: () => 'misechef.ai' }, missing);
  assert.equal(missing.statusCode, 404);
  assert.doesNotMatch(missing.body, /og:image/);
});
