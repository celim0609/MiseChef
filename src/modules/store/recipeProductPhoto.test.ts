import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRecipePhotoForStoreProduct } from './recipeProductPhoto';

test('Recipe photo is copied into an uploadable Store Product file without retaining its URL', async () => {
  const photo = await loadRecipePhotoForStoreProduct({
    recipeId: 'recipe-laksa',
    photoUrl: 'https://private.example.test/recipe.jpg',
    fetchImage: async () => new Response(new Blob(['photo'], { type: 'image/jpeg' }))
  });

  assert.equal(photo.name, 'recipe-recipe-laksa.jpg');
  assert.equal(photo.type, 'image/jpeg');
  assert.equal(photo.size, 5);
});

test('Recipe photo handoff rejects unsupported source types before the public Store upload', async () => {
  await assert.rejects(
    loadRecipePhotoForStoreProduct({
      recipeId: 'recipe-laksa',
      photoUrl: 'https://private.example.test/recipe.gif',
      fetchImage: async () => new Response(new Blob(['photo'], { type: 'image/gif' }))
    }),
    /Choose a JPG, PNG, or WebP image/);
});

 test('network/CORS failures show actionable photo guidance instead of Failed to fetch', async () => {
  await assert.rejects(loadRecipePhotoForStoreProduct({
    recipeId: 'recipe', photoUrl: 'https://example.test/photo.jpg',
    fetchImage: async () => { throw new TypeError('Failed to fetch'); }
  }), /Unable to transfer the Recipe photo.*choose a Product photo manually/);
});

test('HTTP failures retain manual photo fallback', async () => {
  await assert.rejects(loadRecipePhotoForStoreProduct({
    recipeId: 'recipe', photoUrl: 'https://example.test/photo.jpg',
    fetchImage: async () => new Response('', { status: 403 })
  }), /Unable to load the Recipe photo.*choose a Product photo/);
});

test('unreadable photo bodies show clear fallback guidance', async () => {
  await assert.rejects(loadRecipePhotoForStoreProduct({
    recipeId: 'recipe', photoUrl: 'https://example.test/photo.jpg',
    fetchImage: async () => ({ ok: true, blob: async () => { throw new Error('network'); } }) as unknown as Response
  }), /Unable to read the Recipe photo.*choose a Product photo manually/);
});
