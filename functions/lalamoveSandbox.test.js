import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLalamoveProvider, createLalamoveSandboxProvider, resolveLalamoveEnvironment } from './lalamoveSandbox.js';

test('Lalamove client is sandbox-host-only and signs the exact serialized quotation body', async () => {
  const originalFetch = globalThis.fetch; let call;
  globalThis.fetch = async (url, options) => { call = { url, options }; return new Response(JSON.stringify({ data: { quotationId: 'q' } }), { status: 201 }); };
  try {
    const provider = createLalamoveSandboxProvider({ apiKey: 'pk_test_key', apiSecret: 'sk_test_secret' });
    await provider.createQuote({ market: 'MY', data: { serviceType: 'MOTORCYCLE', language: 'en_MY', stops: [] } });
    assert.equal(call.url, 'https://rest.sandbox.lalamove.com/v3/quotations');
    const body = call.options.body; const [, token] = call.options.headers.Authorization.split(' '); const [key, timestamp, signature] = token.split(':');
    assert.equal(key, 'pk_test_key');
    assert.equal(signature, createHmac('sha256', 'sk_test_secret').update(`${timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n${body}`).digest('hex'));
    assert.equal(call.options.headers.Market, 'MY');
  } finally { globalThis.fetch = originalFetch; }
});

test('Lalamove provider rejects missing sandbox credentials before any request', () => {
  assert.throws(() => createLalamoveSandboxProvider({ apiKey: '', apiSecret: '' }), /sandbox is not configured/);
});

test('Firebase project selects a fixed Lalamove host and unknown projects fail closed', async () => {
  assert.equal(resolveLalamoveEnvironment('misechef-beta-fa4bf'), 'sandbox');
  assert.equal(resolveLalamoveEnvironment('misechef-fa4bf'), 'production');
  assert.throws(() => resolveLalamoveEnvironment('unexpected-project'), /not configured/);

  const originalFetch = globalThis.fetch; const urls = [];
  globalThis.fetch = async url => { urls.push(url); return new Response(JSON.stringify({ data: {} }), { status: 200 }); };
  try {
    await createLalamoveProvider({ environment: resolveLalamoveEnvironment('misechef-beta-fa4bf'), apiKey: 'key', apiSecret: 'secret' }).getCityInfo('MY');
    await createLalamoveProvider({ environment: resolveLalamoveEnvironment('misechef-fa4bf'), apiKey: 'key', apiSecret: 'secret' }).getCityInfo('MY');
    assert.deepEqual(urls, [
      'https://rest.sandbox.lalamove.com/v3/cities',
      'https://rest.lalamove.com/v3/cities'
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider rejects caller-selected hosts and unknown environments', () => {
  assert.throws(() => createLalamoveProvider({ environment: 'https://rest.lalamove.com', apiKey: 'key', apiSecret: 'secret' }), /environment is not configured/);
  assert.throws(() => createLalamoveProvider({ environment: 'unknown', apiKey: 'key', apiSecret: 'secret' }), /environment is not configured/);
});
