import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getCurlecPrefill, isInstagramOrFacebookInAppBrowser, normalizeCurlecContact } from './curlecClientAdapter';

test('normalizes Malaysian Curlec contacts without changing stored-order input', () => {
  assert.equal(normalizeCurlecContact('0123456789'), '+60123456789');
  assert.equal(normalizeCurlecContact('60123456789'), '+60123456789');
  assert.equal(normalizeCurlecContact('+60123456789'), '+60123456789');
});

test('leaves non-Malaysian or unrecognized contacts unchanged', () => {
  assert.equal(normalizeCurlecContact('+14155552671'), '+14155552671');
  assert.equal(normalizeCurlecContact('not-a-phone'), 'not-a-phone');
});

test('passes an existing email to Curlec prefill without making it required', () => {
  assert.deepEqual(getCurlecPrefill('Celim', '0123456789', 'celim@example.com'), {
    name: 'Celim', contact: '+60123456789', email: 'celim@example.com'
  });
  assert.deepEqual(getCurlecPrefill('Celim', '0123456789', '  '), {
    name: 'Celim', contact: '+60123456789'
  });
});

test('leaves Curlec payment-method eligibility to the checkout service', () => {
  const adapter = readFileSync(new URL('./curlecClientAdapter.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(adapter, /hide:\s*\[\s*\{\s*method:\s*['\"]fpx['\"]\s*\}\s*,\s*\{\s*method:\s*['\"]card['\"]\s*\}\s*\]/);
});

test('shows the external-browser handoff only in Instagram and Facebook in-app browsers', () => {
  assert.equal(isInstagramOrFacebookInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 353.0.0.0.0'), true);
  assert.equal(isInstagramOrFacebookInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/482.0.0.0.0;]'), true);
  assert.equal(isInstagramOrFacebookInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isInstagramOrFacebookInAppBrowser('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'), false);
});

test('keeps the handoff ahead of Curlec checkout without introducing an unconfigured redirect callback', () => {
  const adapter = readFileSync(new URL('./curlecClientAdapter.tsx', import.meta.url), 'utf8');
  assert.match(adapter, /Open in your browser to pay with Touch ’n Go eWallet/);
  assert.match(adapter, /tap •••, then choose Open in Browser\. Start checkout in Safari or Chrome/);
  assert.doesNotMatch(adapter, /callback_url|redirect:\s*true/);
});
