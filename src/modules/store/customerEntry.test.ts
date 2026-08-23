import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolvePublicRoute } from '../public/publicRoutes';
import {
  createStoreQrBlob,
  createStoreQrDataUrl,
  getPublicOrderingPath,
  getPublicOrderingUrl,
  getStoreShareData,
  getStoreQrFileName,
  STORE_QR_OPTIONS,
  STORE_QR_SIZE
} from './customerEntry';

const storePageSource = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

test('shared links and QR codes open the public Store without entering the authenticated app', () => {
  const path = getPublicOrderingPath('ce-lim-kitchen');

  assert.equal(path, '/store/ce-lim-kitchen');
  assert.deepEqual(resolvePublicRoute(path), {
    page: 'store',
    slug: 'ce-lim-kitchen'
  });
  assert.doesNotMatch(path, /^\/app(?:\/|$)/);
  assert.equal(
    getPublicOrderingUrl('https://misechef.ai', 'ce-lim-kitchen'),
    'https://misechef.ai/store/ce-lim-kitchen'
  );
});

test('Web Share uses the Store name, description, and the same canonical ordering URL', () => {
  assert.deepEqual(getStoreShareData('https://misechef-beta-fa4bf.web.app', {
    slug: 'misechef-s-grab-go-store',
    name: "MiseChef's Grab&Go Store",
    description: 'Morning Grab & Go · Pre-order & Pickup'
  }), {
    title: "MiseChef's Grab&Go Store",
    text: 'Morning Grab & Go · Pre-order & Pickup',
    url: 'https://misechef-beta-fa4bf.web.app/store/misechef-s-grab-go-store'
  });
  assert.match(storePageSource, /navigator\.share\(getStoreShareData\(window\.location\.origin, store\)\)/);
  assert.match(storePageSource, /Share Store/);
});

test('QR downloads use a stable Store-specific file name', () => {
  assert.equal(getStoreQrFileName('ce-lim-kitchen'), 'ce-lim-kitchen-order-qr.png');
});

test('QR generation receives the exact displayed public ordering URL, including special characters', async () => {
  const orderingUrl = getPublicOrderingUrl(
    'https://misechef-beta-fa4bf.web.app',
    "sara's café & kitchen"
  );
  let receivedUrl = '';
  let receivedOptions = null as typeof STORE_QR_OPTIONS | null;
  const result = await createStoreQrDataUrl(orderingUrl, async (value, options) => {
    receivedUrl = value;
    receivedOptions = options;
    return 'data:image/png;base64,qa';
  });

  assert.equal(receivedUrl, orderingUrl);
  assert.equal(
    orderingUrl,
    "https://misechef-beta-fa4bf.web.app/store/sara's%20caf%C3%A9%20%26%20kitchen"
  );
  assert.equal(result, 'data:image/png;base64,qa');
  assert.deepEqual(receivedOptions, STORE_QR_OPTIONS);
});

test('Store QR output is a high-resolution PNG with a white four-module quiet zone', async () => {
  const dataUrl = await createStoreQrDataUrl('https://misechef-beta-fa4bf.web.app/store/ce-lim-kitchen');
  const blob = createStoreQrBlob(dataUrl);
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');

  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), STORE_QR_SIZE);
  assert.equal(png.readUInt32BE(20), STORE_QR_SIZE);
  assert.equal(STORE_QR_OPTIONS.margin, 4);
  assert.equal(STORE_QR_OPTIONS.color?.light, '#ffffff');
  assert.equal(STORE_QR_OPTIONS.color?.dark, '#000000');
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, png.byteLength);
});
