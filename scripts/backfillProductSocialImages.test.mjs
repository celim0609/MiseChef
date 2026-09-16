import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import { BETA_PROJECT_ID, buildPublicStorageUrl, getStorageObjectPath, isMissingProductSocialImage, isSafeExternalImageUrl, optimizeProductSocialImage, PRODUCT_SOCIAL_IMAGE } from './backfillProductSocialImages.mjs';

test('legacy Product social-image selection skips existing derivatives and preserves trusted Storage paths', () => {
  const path = 'stores/store-a/products/product-a/photo.png';
  const url = buildPublicStorageUrl(`${BETA_PROJECT_ID}.firebasestorage.app`, path, 'token');
  assert.equal(getStorageObjectPath(url, `${BETA_PROJECT_ID}.firebasestorage.app`), path);
  assert.equal(isMissingProductSocialImage({}), true);
  assert.equal(isMissingProductSocialImage({ socialImageUrl: 'https://cdn.example/social.jpg' }), false);
  assert.equal(getStorageObjectPath('https://untrusted.example/photo.jpg', `${BETA_PROJECT_ID}.firebasestorage.app`), '');
  assert.equal(isSafeExternalImageUrl('https://placehold.co/600x400/png'), true);
  assert.equal(isSafeExternalImageUrl('http://placehold.co/photo.png'), false);
  assert.equal(isSafeExternalImageUrl('https://127.0.0.1/photo.png'), false);
});

test('Product social-image optimization emits an appropriately sized 1200 by 630 JPEG', async () => {
  const source = await sharp({ create: { width: 2200, height: 1400, channels: 3, background: '#d6a76a' } }).png().toBuffer();
  const result = await optimizeProductSocialImage(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, PRODUCT_SOCIAL_IMAGE.width);
  assert.equal(metadata.height, PRODUCT_SOCIAL_IMAGE.height);
  assert.ok(result.length <= PRODUCT_SOCIAL_IMAGE.maxBytes);
});

test('Product social-image backfill uses the guarded Beta collection reader', () => {
  const source = readFileSync(new URL('./backfillProductSocialImages.mjs', import.meta.url), 'utf8');
  assert.match(source, /This maintenance script is Beta-only/);
  assert.match(source, /FIREBASE_DEPLOY_TARGET !== 'beta'/);
  assert.match(source, /runBetaFirestoreRead/);
  assert.match(source, /createAuthenticatedBetaFirestoreRestClient/);
  assert.match(source, /reader => reader\.listCollection\('storeProducts'\)/);
  assert.doesNotMatch(source, /db\.collection\('storeProducts'\)/);
});
