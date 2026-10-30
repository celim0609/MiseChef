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

test('provider errors cross callable boundaries with safe actionable messages and diagnostic IDs', async () => {
 const previous=globalThis.fetch;
 try {
  for(const [status,providerCode,code,message] of [[401,'invalid api key','failed-precondition','authentication failed'],[422,'ERR_INVALID_SCHEDULE_TIME','invalid-argument','future delivery time'],[422,'ERR_OUT_OF_SERVICE_AREA','invalid-argument','does not serve'],[429,'ERR_RATE_LIMIT_EXCEEDED','unavailable','temporarily unavailable']]){
   globalThis.fetch=async()=>new Response(JSON.stringify({message:providerCode,meta:{requestId:'safe-request-id'}}),{status});
   await assert.rejects(createLalamoveSandboxProvider({apiKey:'private-key',apiSecret:'private-secret'}).getCityInfo('MY'),error=>{
    assert.equal(error.code,code);assert.ok(error.message.includes(message));assert.equal(error.details.providerCode,providerCode);assert.equal(error.requestId,'safe-request-id');assert.ok(!error.message.includes('private-key'));return true;
   });
  }
  globalThis.fetch=async()=>{throw new Error('network down');};
  await assert.rejects(createLalamoveSandboxProvider({apiKey:'key',apiSecret:'secret'}).getCityInfo('MY'),error=>error.code==='unavailable');
 } finally {globalThis.fetch=previous;}
});

test('missing-field rejection retains only safe field paths and request ID, never customer values', async()=>{
 const previous=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'ERR_MISSING_FIELD',errors:[{id:'ERR_MISSING_FIELD',detail:'recipients[0].phone absent, customer phone 0123456789'}],meta:{requestId:'test-correlation'}}),{status:422});
  await assert.rejects(createLalamoveSandboxProvider({apiKey:'key',apiSecret:'secret'}).getCityInfo('MY'),error=>{
   assert.equal(error.details.providerCode,'ERR_MISSING_FIELD');assert.deepEqual(error.details.fields,['recipients[0].phone']);assert.equal(error.requestId,'test-correlation');assert.ok(error.message.includes('recipients[0].phone'));assert.ok(!error.message.includes('0123456789'));return true;
  });
 } finally {globalThis.fetch=previous;}
});

test('insufficient wallet credit is actionable and only explicit 4xx rejections prove no booking',async()=>{
 const {isConfirmedProviderRejection}=await import('./lalamoveSandbox.js');const previous=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({errors:[{id:'ERR_INSUFFICIENT_CREDIT'}],meta:{requestId:'wallet-request'}}),{status:402});
  await assert.rejects(createLalamoveSandboxProvider({apiKey:'key',apiSecret:'secret'}).createOrder({market:'MY',data:{}}),error=>{
   assert.match(error.message,/wallet has insufficient credit/);assert.equal(isConfirmedProviderRejection(error),true);return true;
  });
  assert.equal(isConfirmedProviderRejection({status:500,details:{providerCode:'ERR_INSUFFICIENT_CREDIT'}}),false);
  assert.equal(isConfirmedProviderRejection({code:'unavailable',requestId:'timeout'}),false);
  assert.equal(isConfirmedProviderRejection({status:429,details:{providerCode:'ERR_RATE_LIMIT_EXCEEDED'}}),false);
 }finally{globalThis.fetch=previous;}
});
