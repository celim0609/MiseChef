import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildStoreSocialMetadata,
  createStoreSocialPreviewHandler,
  injectStoreSocialMetadata,
  resolveStoreRequestOrigin,
  STORE_SOCIAL_DEFAULTS
} from './storeSocialPreview.js';

const appShell = '<!doctype html><html><head><title>MiseChef</title><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';
const betaOrigin = 'https://misechef-beta-fa4bf.web.app';

const createResponse = () => ({
  statusCode: 0,
  headers: {},
  body: '',
  ended: false,
  status(code) { this.statusCode = code; return this; },
  set(name, value) { this.headers[name] = value; return this; },
  send(value = '') { this.body = value; return this; },
  end() { this.ended = true; return this; }
});

test('Store cover image has first priority and all crawler metadata is in the initial HTML', () => {
  const metadata = buildStoreSocialMetadata({
    origin: betaOrigin,
    slug: 'breakfast-store',
    store: {
      slug: 'breakfast-store',
      name: 'Breakfast Store',
      description: 'Morning Grab & Go · Pre-order & Pickup',
      coverImageUrl: 'https://firebasestorage.googleapis.com/cover.png',
      logoUrl: 'https://firebasestorage.googleapis.com/logo.png'
    }
  });
  const html = injectStoreSocialMetadata(appShell, metadata);

  assert.equal(metadata.image, 'https://firebasestorage.googleapis.com/cover.png');
  assert.match(html, /<title>Breakfast Store \| MiseChef<\/title>/);
  assert.match(html, /property="og:title" content="Breakfast Store"/);
  assert.match(html, /property="og:description" content="Morning Grab &amp; Go · Pre-order &amp; Pickup"/);
  assert.match(html, /property="og:image" content="https:\/\/firebasestorage\.googleapis\.com\/cover\.png"/);
  assert.match(html, /property="og:url" content="https:\/\/misechef-beta-fa4bf\.web\.app\/store\/breakfast-store"/);
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:site_name" content="MiseChef"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title" content="Breakfast Store"/);
  assert.match(html, /name="twitter:description" content="Morning Grab &amp; Go · Pre-order &amp; Pickup"/);
  assert.match(html, /name="twitter:image" content="https:\/\/firebasestorage\.googleapis\.com\/cover\.png"/);
  assert.match(html, /rel="canonical" href="https:\/\/misechef-beta-fa4bf\.web\.app\/store\/breakfast-store"/);
  assert.ok(html.indexOf('og:title') < html.indexOf('</head>'));
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\/assets\/app\.js"/);
});

test('logo is used when cover is missing or invalid', () => {
  const withMissingCover = buildStoreSocialMetadata({
    origin: betaOrigin,
    slug: 'logo-store',
    store: { slug: 'logo-store', name: 'Logo Store', description: '', coverImageUrl: '', logoUrl: 'https://cdn.example/logo.png' }
  });
  const withInvalidCover = buildStoreSocialMetadata({
    origin: betaOrigin,
    slug: 'logo-store',
    store: { slug: 'logo-store', name: 'Logo Store', description: '', coverImageUrl: 'javascript:alert(1)', logoUrl: 'https://cdn.example/logo.png' }
  });
  assert.equal(withMissingCover.image, 'https://cdn.example/logo.png');
  assert.equal(withInvalidCover.image, 'https://cdn.example/logo.png');
});

test('public absolute HTTPS default image is used when Store images are missing or invalid', () => {
  const metadata = buildStoreSocialMetadata({
    origin: betaOrigin,
    slug: 'plain-store',
    store: { slug: 'plain-store', name: 'Plain Store', description: '', coverImageUrl: 'http://example.com/cover.png', logoUrl: 'not-a-url' }
  });
  assert.equal(metadata.image, `${betaOrigin}${STORE_SOCIAL_DEFAULTS.imagePath}`);
  assert.match(metadata.image, /^https:\/\//);
  assert.equal(metadata.description, STORE_SOCIAL_DEFAULTS.description);
});

test('long and hostile Store text stays escaped without breaking the application shell', () => {
  const longDescription = `${'Fresh breakfast & pickup. '.repeat(40)}\"><script>alert(1)</script>`;
  const metadata = buildStoreSocialMetadata({
    origin: betaOrigin,
    slug: 'long-store',
    store: { slug: 'long-store', name: 'A very long Store <name> "quoted"', description: longDescription }
  });
  const html = injectStoreSocialMetadata(appShell, metadata);
  assert.match(html, /A very long Store &lt;name&gt; &quot;quoted&quot;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<div id="root"><\/div>/);
});

test('metadata reflects the latest Store branding data on each render', () => {
  const before = buildStoreSocialMetadata({ origin: betaOrigin, slug: 'updated-store', store: { slug: 'updated-store', name: 'Old name', description: 'Old description' } });
  const after = buildStoreSocialMetadata({ origin: betaOrigin, slug: 'updated-store', store: { slug: 'updated-store', name: 'New name', description: 'New description', coverImageUrl: 'https://cdn.example/new-cover.jpg?alt=media', updatedAt: '2026-08-24T01:02:03.000Z' } });
  assert.equal(before.title, 'Old name');
  assert.equal(after.title, 'New name');
  assert.equal(after.description, 'New description');
  assert.equal(after.image, 'https://cdn.example/new-cover.jpg?alt=media&misechef_store_v=2026-08-24T01%3A02%3A03.000Z');
  assert.notEqual(before.image, after.image);
});

test('request origin accepts only the current Firebase project hosts or configured origin', () => {
  assert.equal(resolveStoreRequestOrigin({ host: 'misechef-beta-fa4bf.web.app', projectId: 'misechef-beta-fa4bf' }), betaOrigin);
  assert.equal(resolveStoreRequestOrigin({ host: 'misechef-beta-fa4bf.firebaseapp.com', projectId: 'misechef-beta-fa4bf' }), 'https://misechef-beta-fa4bf.firebaseapp.com');
  assert.equal(resolveStoreRequestOrigin({ host: 'attacker.web.app', projectId: 'misechef-beta-fa4bf' }), betaOrigin);
  assert.equal(resolveStoreRequestOrigin({ host: 'shop.misechef.ai', projectId: 'misechef-fa4bf', configuredOrigin: 'https://shop.misechef.ai' }), 'https://shop.misechef.ai');
});

test('HTTP handler returns raw Store-specific HTML for GET and headers-only for HEAD', async () => {
  const loadedSlugs = [];
  const handler = createStoreSocialPreviewHandler({
    projectId: 'misechef-beta-fa4bf',
    loadStore: async slug => {
      loadedSlugs.push(slug);
      return { slug, name: "MiseChef's Grab&Go Store", description: 'Pre-order & pickup' };
    },
    loadAppShell: async () => appShell
  });
  const request = { method: 'GET', path: '/store/misechef-s-grab-go-store', get: name => name === 'host' ? 'misechef-beta-fa4bf.web.app' : '' };
  const getResponse = createResponse();
  await handler(request, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(getResponse.headers['Cache-Control'], /s-maxage=60/);
  assert.match(getResponse.body, /MiseChef&#39;s Grab&amp;Go Store/);
  assert.deepEqual(loadedSlugs, ['misechef-s-grab-go-store']);

  const headResponse = createResponse();
  await handler({ ...request, method: 'HEAD' }, headResponse);
  assert.equal(headResponse.statusCode, 200);
  assert.equal(headResponse.body, '');
  assert.equal(headResponse.ended, true);
});

test('HTTP handler rejects unsafe methods and non-Store paths without a Firestore read', async () => {
  let reads = 0;
  const handler = createStoreSocialPreviewHandler({
    loadStore: async () => { reads += 1; return null; },
    loadAppShell: async () => appShell
  });
  const postResponse = createResponse();
  await handler({ method: 'POST', path: '/store/a', get: () => '' }, postResponse);
  assert.equal(postResponse.statusCode, 405);
  assert.equal(postResponse.headers.Allow, 'GET, HEAD');

  const nestedResponse = createResponse();
  await handler({ method: 'GET', path: '/store/a/private', get: () => '' }, nestedResponse);
  assert.equal(nestedResponse.statusCode, 404);
  assert.equal(reads, 0);
});

test('Hosting sends Store routes to the metadata Function before the SPA catch-all', () => {
  const firebaseConfig = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.deepEqual(firebaseConfig.hosting.rewrites[0], {
    source: '/store/**',
    function: { functionId: 'renderPublicStore', region: 'us-central1' }
  });
  assert.deepEqual(firebaseConfig.hosting.rewrites.at(-1), { source: '**', destination: '/index.html' });
});
