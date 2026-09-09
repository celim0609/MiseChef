import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLalamoveSandboxProvider } from './lalamoveSandbox.js';

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
  assert.throws(() => createLalamoveSandboxProvider({ apiKey: '', apiSecret: '' }), /Sandbox is not configured/);
});
