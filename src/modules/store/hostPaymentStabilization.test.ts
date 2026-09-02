import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getCanonicalGroupUrl, getGroupShareData } from './groupSharing';
import { downloadConfiguredPaymentQr, isValidConfiguredPaymentQrUrl } from './paymentQrDownload';

const hostPage = readFileSync(new URL('./HostProgramPage.tsx', import.meta.url), 'utf8');
const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const paymentCheckout = readFileSync(new URL('./StorePaymentCheckout.tsx', import.meta.url), 'utf8');
const manualAdapter = readFileSync(new URL('./paymentProviders/manualClientAdapter.tsx', import.meta.url), 'utf8');

test('Copy Link builds only the canonical absolute Group URL', () => {
  assert.equal(
    getCanonicalGroupUrl('https://beta.misechef.com', 'group id/with spaces'),
    'https://beta.misechef.com/group/group%20id%2Fwith%20spaces'
  );
  assert.match(hostPage, /clipboard\.writeText\(getCanonicalGroupUrl\(window\.location\.origin, code\)\)/);
});

test('native Share keeps the canonical Group URL in the url field without concatenated text', () => {
  assert.deepEqual(
    getGroupShareData('https://beta.misechef.com', { shareCode: 'group-a', name: 'Friday Lunch' }),
    { title: 'Friday Lunch', url: 'https://beta.misechef.com/group/group-a' }
  );
  assert.match(hostPage, /navigator\.share\(shareData\)/);
  assert.doesNotMatch(hostPage, /navigator\.share\(\{[^}]*text:/s);
});

test('Host group cards view the attributed customer Group route rather than the generic Store', () => {
  assert.equal(
    getCanonicalGroupUrl('https://beta.misechef.com', 'opaque share/code'),
    'https://beta.misechef.com/group/opaque%20share%2Fcode'
  );
  assert.match(hostPage, /href=\{getCanonicalGroupUrl\(window\.location\.origin, group\.shareCode\)\}/);
  const viewStoreIndex = hostPage.indexOf('> View Store</a>');
  const shareIndex = hostPage.indexOf('> Share</button>', viewStoreIndex);
  const manageIndex = hostPage.indexOf('>Manage</button>', shareIndex);
  assert.ok(viewStoreIndex >= 0 && viewStoreIndex < shareIndex && shareIndex < manageIndex);
  assert.doesNotMatch(hostPage.slice(viewStoreIndex - 300, manageIndex), /\/store\//);
});

test('Group and normal Store checkouts pass the loaded canonical Store slug into manual payment calls', () => {
  assert.match(publicStorePage, /storeSlug=\{store\.slug\}/);
  assert.match(paymentCheckout, /storeSlug=\{storeSlug\}/);
  assert.match(manualAdapter, /uploadReceipt\(storeSlug, session, receipt\)/);
  assert.match(manualAdapter, /submitManual\(storeSlug, session\)/);
  assert.doesNotMatch(manualAdapter, /window\.location\.pathname|split\('\/store\/'\)/);
});

test('QR download preserves the configured image bytes and uses a download filename', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let downloadedBlob: Blob | null = null;
  let clicked = false;
  let removed = false;
  let revoked = '';
  const anchor = {
    href: '',
    download: '',
    click: () => { clicked = true; },
    remove: () => { removed = true; }
  };

  await downloadConfiguredPaymentQr('https://storage.test/merchant-qr.png', {
    fetch: async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } }),
    createObjectUrl: blob => { downloadedBlob = blob; return 'blob:merchant-qr'; },
    revokeObjectUrl: url => { revoked = url; },
    createAnchor: () => anchor,
    schedule: callback => callback()
  });

  assert.equal(clicked, true);
  assert.equal(removed, true);
  assert.equal(anchor.href, 'blob:merchant-qr');
  assert.equal(anchor.download, 'misechef-payment-qr.png');
  assert.equal(revoked, 'blob:merchant-qr');
  assert.deepEqual(new Uint8Array(await downloadedBlob!.arrayBuffer()), bytes);
  assert.equal(isValidConfiguredPaymentQrUrl('javascript:alert(1)'), false);
  assert.match(manualAdapter, /'Download QR'/);
});
