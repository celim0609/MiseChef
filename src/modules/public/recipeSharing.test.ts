import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolvePublicRoute } from './publicRoutes';
import { STORE_QR_OPTIONS, STORE_QR_SIZE } from '../store/customerEntry';
import {
  createRecipeQrBlob,
  createRecipeQrDataUrl,
  getPublicRecipePath,
  getPublicRecipeUrl,
  getRecipeQrFileName,
  getRecipeShareData
} from './recipeSharing';

const shareDialogSource = readFileSync(new URL('../../components/RecipeShareDialog.tsx', import.meta.url), 'utf8');

test('Recipe sharing uses a stable public ID route outside the authenticated app', () => {
  const path = getPublicRecipePath('recipe 42/tea');
  assert.equal(path, '/recipes/recipe%2042%2Ftea');
  assert.deepEqual(resolvePublicRoute(path), { page: 'recipe', slug: 'recipe 42/tea' });
  assert.equal(
    getPublicRecipeUrl('https://misechef-beta-fa4bf.web.app', 'recipe-42'),
    'https://misechef-beta-fa4bf.web.app/recipes/recipe-42'
  );
  assert.doesNotMatch(path, /^\/app(?:\/|$)/);
});

test('title changes do not change the shared Recipe URL', () => {
  const first = getRecipeShareData('https://misechef.ai', { id: 'stable-id', title: 'First title' });
  const renamed = getRecipeShareData('https://misechef.ai', { id: 'stable-id', title: 'Renamed title' });
  assert.equal(first.url, renamed.url);
  assert.equal(first.url, 'https://misechef.ai/recipes/stable-id');
  assert.equal(renamed.title, 'Renamed title');
});

test('Recipe QR reuses the hardened Store PNG settings and produces a downloadable image', async () => {
  let receivedOptions = null as typeof STORE_QR_OPTIONS | null;
  const result = await createRecipeQrDataUrl('https://misechef.ai/recipes/stable-id', async (_url, options) => {
    receivedOptions = options;
    return 'data:image/png;base64,qa';
  });
  assert.equal(result, 'data:image/png;base64,qa');
  assert.deepEqual(receivedOptions, STORE_QR_OPTIONS);

  const dataUrl = await createRecipeQrDataUrl('https://misechef.ai/recipes/stable-id');
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const blob = createRecipeQrBlob(dataUrl);
  assert.equal(png.readUInt32BE(16), STORE_QR_SIZE);
  assert.equal(png.readUInt32BE(20), STORE_QR_SIZE);
  assert.equal(blob.type, 'image/png');
});

test('Recipe QR download name is readable and stable', () => {
  assert.equal(getRecipeQrFileName({ id: 'recipe-42', title: 'Teh Ice' }), 'teh-ice-recipe-qr.png');
});

test('Workspace-only Recipes expose no public link, QR, copy, download, or native share actions', () => {
  assert.match(shareDialogSource, /const isPublic = recipe\.visibility === 'public'/);
  assert.match(shareDialogSource, /No public link or QR code has been created here/);
  assert.match(shareDialogSource, /!isPublic \? \(/);
  assert.match(shareDialogSource, /Copy Link/);
  assert.match(shareDialogSource, /Download QR/);
  assert.match(shareDialogSource, /navigator\.share/);
});

