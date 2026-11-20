import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import manifest from './weeklyPreviewImages.json' with { type: 'json' };
import { findWeeklyPreviewImage } from './weeklyPreviewImages.js';
import { buildProductSocialMetadata, createStoreSocialPreviewHandler, renderStoreSocialTags } from './storeSocialPreview.js';

const origin = 'https://misechef.ai';
const source = entry => `https://firebasestorage.googleapis.com/v0/b/${entry.bucket}/o/${encodeURIComponent(entry.objectPath)}?alt=media&token=public`;
const store = { slug: 'misechef-s-grab-go-store', name: 'GG Grab&Go', currency: 'MYR' };
const product = { productType: 'weekly_meal_plan', productSlug: manifest.productPath.split('/').at(-1),
  name: 'Weekly Menu', price: 60, updatedAt: '2026-11-20T06:07:32.180Z',
  rotationWeeks: Object.fromEntries(manifest.entries.map(entry => [entry.week, {
    coverPhotoUrl: source(entry), meals: { mon: { name: 'Monday meal', photoUrl: source(entry) } }
  }])) };

for (const entry of manifest.entries) {
  test(`${entry.week}: complete JPEG is packaged, bounded and matches its content hash`, async () => {
    const bytes = readFileSync(new URL(`../public${entry.assetPath}`, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.ok(bytes.length <= 280 * 1024);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.ok(entry.assetPath.endsWith(`${entry.sha256.slice(0, 20)}.jpg`));
    const info = await sharp(bytes).metadata();
    assert.equal(info.format, 'jpeg');
    assert.equal(info.width, entry.width); assert.equal(info.height, entry.height);
    assert.ok(info.width >= 300 && info.width / info.height <= 4);
    assert.ok(Math.abs(info.width / info.height - entry.sourceWidth / entry.sourceHeight) <= 1 / info.height,
      'original aspect ratio is preserved to pixel rounding without cropping or padding');
  });
  test(`${entry.week}: metadata uses the matching static image and preserves commerce data and URL`, () => {
    const before = structuredClone(product);
    const search = `?week=${entry.week}`;
    const metadata = buildProductSocialMetadata({ store, product, origin, search });
    assert.equal(metadata.image, origin + entry.assetPath);
    assert.equal(metadata.canonicalUrl, origin + manifest.productPath + search);
    assert.equal(metadata.title, 'Weekly Menu | GG Grab&Go');
    assert.match(metadata.description, /60\.00/);
    const html = renderStoreSocialTags(metadata);
    assert.ok(html.includes(`property="og:image" content="${metadata.image}"`));
    assert.ok(html.includes(`property="og:image:width" content="${entry.width}"`));
    assert.ok(html.includes(`property="og:image:height" content="${entry.height}"`));
    assert.match(html, /og:image:type" content="image\/jpeg/);
    const day = buildProductSocialMetadata({ store, product, origin, search: search + '&day=mon' });
    assert.equal(new URL(day.image).pathname, new URL(source(entry)).pathname);
    assert.deepEqual(product, before);
  });
}

test('new uploads, incorrect slots, unrelated products and untrusted URLs retain original fallback', () => {
  const entry = manifest.entries[0];
  const canonical = origin + manifest.productPath;
  for (const [url, page, slot] of [
    [source(entry).replace('meal-', 'new-meal-'), canonical, entry.week],
    [source(entry), canonical, 'week4'],
    [source(entry), origin + '/store/other/product/other', entry.week],
    [source(entry).replace('googleapis.com', 'googleapis.com.evil.test'), canonical, entry.week],
    [source(entry).replace('https:', 'http:'), canonical, entry.week],
    [source(entry).replace(entry.bucket, 'other.appspot.com'), canonical, entry.week],
    ['bad url', canonical, entry.week]
  ]) assert.equal(findWeeklyPreviewImage(url, page, slot), null);
  const changed = structuredClone(product);
  changed.rotationWeeks.week1.coverPhotoUrl = 'https://example.com/new-cover.jpg';
  const metadata = buildProductSocialMetadata({ store, product: changed, origin, search: '?week=week1' });
  assert.ok(metadata.image.startsWith('https://example.com/new-cover.jpg'));
  assert.equal(metadata.imageWidth, undefined);
  assert.equal(findWeeklyPreviewImage(source(entry).replace('token=public', 'token=renewed'), canonical, entry.week).image, origin + entry.assetPath);
});

test('public HTML handler emits the four static JPEGs using the unchanged entrypoint contract', async () => {
  const handler = createStoreSocialPreviewHandler({ projectId: 'misechef-fa4bf', configuredOrigin: origin,
    loadStore: async () => ({ id: 'store', ...store }), loadProduct: async () => product,
    loadAppShell: async () => '<html><head></head><body><div id="root"></div></body></html>' });
  for (const entry of manifest.entries) {
    const response = { headers: {}, status(code) { this.code = code; return this; },
      set(k, v) { this.headers[k] = v; return this; }, send(body) { this.body = body; }, end() { this.ended = true; } };
    await handler({ method: 'GET', path: manifest.productPath, url: `${manifest.productPath}?week=${entry.week}`, get: () => 'misechef.ai' }, response);
    assert.equal(response.code, 200);
    assert.ok(response.body.includes(origin + entry.assetPath));
    assert.ok(response.body.includes(`?week=${entry.week}`));
  }
});
