import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { classifyCurlecAttemptObservation, curlecAttemptReference, verifyHistoricalCurlecPayment } from './curlecAttemptSafety.js';
import { createCurlecPaymentLinkAdapter } from './paymentProviders/curlecPaymentLink.js';
import { handleStorePaymentWebhook, reconcileStorePayment } from './storePayments.js';
import { createCurlecStorePaymentWebhookHandler } from './index.js';

const id = 'a'.repeat(64);
const orderId = 'HistoricalQAOrder0001';
const copy = value => structuredClone(value);
const fingerprint = mode => createHash('sha256').update(`rzp_${mode}_Fixture`).digest('hex');
const attempt = (mode = 'test') => ({ id, orderId, storeId: 'store', provider: 'curlec', mode: 'payment_link', revision: 1,
  amountMinor: 1290, currency: 'MYR', expiresAt: 1795002226, merchantFingerprint: fingerprint(mode),
  providerPaymentId: 'plink_Old', curlecEnvironment: mode });
const link = () => ({ id: 'plink_Old', amount: 1290, amount_paid: 1290, currency: 'MYR', status: 'paid',
  reference_id: curlecAttemptReference(id), expire_by: 1795002226, accept_partial: false,
  customer: { email: 'private@example.test' }, short_url: 'https://rzp.io/private?secret=private',
  notes: { misechefOrderId: orderId, misechefWeeklyPosAttemptId: id, misechefOrderRevision: '1' },
  payments: [{ payment_id: 'pay_Old', amount: 1290, status: 'captured' }] });
const captured = () => ({ id: 'pay_Old', amount: 1290, currency: 'MYR', captured: true, status: 'captured', method: 'fpx' });
const payment = mode => ({ orderId, providerPaymentId: 'plink_Old', providerTransactionId: 'pay_Old', amountMinor: 1290,
  currency: 'MYR', status: 'paid', weeklyPosAttemptId: id, weeklyPosReference: curlecAttemptReference(id),
  weeklyPosRevision: 1, weeklyPosExpiresAt: 1795002226, curlecEnvironment: mode });
const order = mode => ({ id: orderId, storeId: 'store', workspaceId: 'workspace', weeklyDayPos: true,
  manualOrder: { revision: 2 }, weeklyPosLink: { attemptId: 'b'.repeat(64), expiresAt: 1795010000 },
  payment: { provider: 'curlec', providerMode: 'payment_link', providerPaymentId: 'plink_New', status: 'pending', amountMinor: 1500, curlecEnvironment: mode },
  currency: 'MYR', fulfilmentStatus: 'New', customerName: 'Private Customer' });

function memory(mode = 'test') {
  const rows = { storeOrders: { [orderId]: order(mode) }, storeCheckoutAttempts: { [id]: attempt(mode) },
    storePaymentAttemptVerifications: {}, storePaymentEvents: {}, storeOrderTimeline: {}, storeNotifications: {} };
  const snapshot = (collection, docId) => ({ id: docId, exists: rows[collection]?.[docId] !== undefined,
    data: () => copy(rows[collection]?.[docId]) });
  const document = (collection, docId) => ({ collection, docId, get: async () => snapshot(collection, docId),
    set: async value => { rows[collection][docId] = copy(value); } });
  const db = { collection: collection => ({ doc: docId => document(collection, docId),
    where: (path, op, value) => ({ limit: () => ({ query: true, collection, path, value }) }) }),
    runTransaction: async fn => fn({
      get: async ref => ref.query ? { docs: Object.entries(rows[ref.collection] || {}).filter(([, value]) =>
        ref.path.split('.').reduce((v, k) => v?.[k], value) === ref.value).map(([key]) => snapshot(ref.collection, key)) }
        : snapshot(ref.collection, ref.docId),
      create: (ref, value) => { assert.equal(rows[ref.collection][ref.docId], undefined); rows[ref.collection][ref.docId] = value; },
      update: () => { throw new Error('Historical processing must never update an order or attempt'); },
    }) };
  let providerLink = link(); let providerPayment = captured(); let unavailable = false;
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.ok(!options.method || options.method === 'GET', 'verification is GET-only'); requests.push(url);
    if (unavailable) throw new Error('private provider error');
    if (url.endsWith('/payment_links/plink_Old')) return new Response(JSON.stringify(providerLink));
    if (url.endsWith('/payments/pay_Old')) return new Response(JSON.stringify(providerPayment));
    throw new Error('Unexpected provider request');
  };
  const adapter = { ...createCurlecPaymentLinkAdapter(`rzp_${mode}_Fixture`, 'private-secret', { fetchImpl }), curlecEnvironment: mode };
  return { rows, db, adapter, requests, fetchImpl, setLink: value => { providerLink = value; },
    setPayment: value => { providerPayment = value; }, unavailable: () => { unavailable = true; } };
}
const event = (eventId = 'historical-event') => ({ id: eventId, type: 'payment_link.paid', event: 'payment_link.paid',
  payload: { payment_link: { entity: link() }, payment: { entity: captured() } } });

for (const [state, expected] of [['created', 'open_unpaid'], ['expired', 'terminal_unpaid_unconfirmed'],
  ['cancelled', 'terminal_unpaid_unconfirmed'], ['unknown', 'ambiguous']]) {
  test(`provider ${state} never authorizes a successor or assumes payment finality`, () => {
    const result = classifyCurlecAttemptObservation({ link: { ...link(), status: state, amount_paid: 0, payments: [] }, attempt: attempt(), orderId });
    assert.equal(result.outcome, expected); assert.equal(result.successorAllowed, false);
  });
}
test('empty lookup is ambiguous; only a matching provider-confirmed capture is verified', () => {
  assert.equal(classifyCurlecAttemptObservation({ link: null }).outcome, 'not_found_ambiguous');
  const result = classifyCurlecAttemptObservation({ link: link(), payment: captured(), attempt: attempt(), orderId });
  assert.equal(result.outcome, 'captured_verified'); assert.equal(result.successorAllowed, false);
});
for (const [name, change] of [
  ['amount', { amount: 1 }], ['currency', { currency: 'SGD' }], ['expiry', { expire_by: 1 }],
  ['reference', { reference_id: 'other' }], ['partial-payment setting', { accept_partial: true }],
  ['revision', { notes: { ...link().notes, misechefOrderRevision: '2' } }],
]) test(`provider ${name} mismatch fails closed`, () => {
  assert.equal(classifyCurlecAttemptObservation({ link: { ...link(), ...change }, attempt: attempt(), orderId }).outcome, 'inconsistent');
});
for (const [name, value] of [['authorized', { ...captured(), status: 'authorized', captured: false }],
  ['wrong transaction', { ...captured(), id: 'pay_Other' }], ['refunded', { ...captured(), amount_refunded: 1 }]]) {
  test(`${name} payment cannot establish a verified historical capture`, () => {
    assert.equal(classifyCurlecAttemptObservation({ link: link(), payment: value, attempt: attempt(), orderId }).outcome, 'review_required');
  });
}
test('partial and in-flight activity require review even when a link claims expiry', () => {
  for (const state of [{ amount_paid: 1, payments: [] }, { amount_paid: 0, payments: [{ status: 'authorized' }] }])
    assert.equal(classifyCurlecAttemptObservation({ link: { ...link(), status: 'expired', ...state }, attempt: attempt(), orderId }).outcome, 'review_required');
});

for (const mode of ['test', 'live']) test(`${mode} delayed capture creates one redacted review record and never modifies the current order`, async () => {
  const f = memory(mode); const initial = copy(f.rows.storeOrders); const original = copy(f.rows.storeCheckoutAttempts);
  assert.deepEqual(await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() }), { received: true, reviewRequired: true });
  assert.equal((await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() })).duplicate, true);
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event('different-delivery-id') });
  assert.deepEqual(f.rows.storeOrders, initial); assert.deepEqual(f.rows.storeCheckoutAttempts, original);
  assert.equal(Object.keys(f.rows.storePaymentAttemptVerifications).length, 1);
  const audit = Object.values(f.rows.storePaymentAttemptVerifications)[0];
  assert.equal(audit.financialEffect, 'none'); assert.equal(audit.requiresReview, true); assert.equal(audit.mode, mode);
  assert.doesNotMatch(JSON.stringify(audit), /private|Customer|https:|secret|plink_Old|pay_Old/);
  assert.deepEqual(f.rows.storeNotifications, {}); assert.deepEqual(f.rows.storeOrderTimeline, {});
});

test('historical legacy Live attempt without mode tag requires its original persisted provider reference', async () => {
  const f = memory('live'); delete f.rows.storeCheckoutAttempts[id].curlecEnvironment;
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() });
  assert.equal(Object.values(f.rows.storePaymentAttemptVerifications)[0].mode, 'live');
  delete f.rows.storeCheckoutAttempts[id].providerPaymentId;
  await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event('no-reference') }), /saved attempt/);
});

test('unknown creation response can be verified by canonical reference without binding or modifying the old attempt', async () => {
  const f = memory(); delete f.rows.storeCheckoutAttempts[id].providerPaymentId;
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() });
  assert.equal(f.rows.storeCheckoutAttempts[id].providerPaymentId, undefined);
  assert.equal(Object.keys(f.rows.storePaymentAttemptVerifications).length, 1);
});

test('unverified direct reconciliation cannot manufacture a historical payment', async () => {
  const f = memory();
  await assert.rejects(reconcileStorePayment({ db: f.db, payment: payment('test') }), /no server verification/);
  assert.deepEqual(f.rows.storePaymentAttemptVerifications, {});
});

for (const mutation of [a => { a.curlecEnvironment = 'live'; }, a => { a.merchantFingerprint = 'f'.repeat(64); },
  a => { a.orderId = 'another-order'; }, a => { a.storeId = 'another-store'; }, a => { a.revision = 2; }]) {
  test('saved mode, merchant, ownership and revision are checked before provider access', async () => {
    const f = memory(); mutation(f.rows.storeCheckoutAttempts[id]);
    await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() }), /saved attempt/);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.rows.storePaymentAttemptVerifications, {});
  });
}
test('provider outage or unverifiable capture leaves all payment state untouched and retryable', async () => {
  for (const unavailable of [true, false]) {
    const f = memory(); const initial = copy(f.rows.storeOrders);
    if (unavailable) f.unavailable(); else f.setPayment({ ...captured(), captured: false });
    await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() }), /provider verification/);
    assert.deepEqual(f.rows.storeOrders, initial); assert.deepEqual(f.rows.storePaymentAttemptVerifications, {});
    assert.deepEqual(f.rows.storePaymentEvents, {});
  }
});
test('attempt snapshot changes between provider verification and transaction cause rejection', async () => {
  const f = memory(); const verified = await verifyHistoricalCurlecPayment({ db: f.db, adapter: f.adapter, order: order('test'), payment: payment('test') });
  f.rows.storeCheckoutAttempts[id].providerPaymentId = undefined;
  await assert.rejects(reconcileStorePayment({ db: f.db, payment: verified }), /changed during verification/);
});
test('capture already bound to another order cannot be acknowledged as a historical capture', async () => {
  const f = memory(); f.rows.storeOrders.other = { payment: { providerTransactionId: 'pay_Old' } };
  await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() }), /already bound/);
  assert.deepEqual(f.rows.storePaymentAttemptVerifications, {});
});

test('real webhook wrapper verifies signatures before historical provider reads or audit writes', async () => {
  const f = memory(); const secret = 'disposable-signing-secret';
  const handler = createCurlecStorePaymentWebhookHandler({ webhookDb: f.db, curlecEnvironment: 'test',
    getCurlecKeyId: () => 'rzp_test_Fixture', getCurlecKeySecret: () => 'private-secret', getWebhookSecret: () => secret,
    createAdapter: (provider, opts) => createCurlecPaymentLinkAdapter(opts.curlecKeyId, opts.curlecKeySecret, { fetchImpl: f.fetchImpl }) });
  const rawBody = Buffer.from(JSON.stringify(event()));
  const invoke = async signature => {
    let status;
    await handler({ method: 'POST', rawBody, get: name => name.toLowerCase() === 'x-razorpay-signature' ? signature : 'signed-historical' },
      { status: code => ({ json: () => { status = code; }, send: () => { status = code; } }) });
    return status;
  };
  assert.equal(await invoke('invalid'), 400); assert.equal(f.requests.length, 0);
  assert.equal(await invoke(createHmac('sha256', secret).update(rawBody).digest('hex')), 200);
  assert.equal(Object.keys(f.rows.storePaymentAttemptVerifications).length, 1);
});

test('processed historical events remain idempotent during provider outages', async () => {
  const f = memory();
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() });
  const before = f.requests.length; f.unavailable();
  assert.equal((await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() })).duplicate, true);
  assert.equal(f.requests.length, before);
  await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event('new-outage-event') }), /provider verification/);
  assert.equal(Object.keys(f.rows.storePaymentAttemptVerifications).length, 1);
});
test('legacy untagged Live event receipts remain idempotent without provider access', async () => {
  const f = memory('live');
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() });
  delete f.rows.storePaymentEvents['historical-event'].curlecEnvironment;
  const before = f.requests.length; f.unavailable();
  assert.equal((await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() })).duplicate, true);
  assert.equal(f.requests.length, before);
});
test('verified historical proof cannot be altered or copied into a fabricated capture', async () => {
  const f = memory(); const verified = await verifyHistoricalCurlecPayment({ db: f.db, adapter: f.adapter, order: order('test'), payment: payment('test') });
  assert.throws(() => { verified.providerTransactionId = 'pay_Forged'; }, TypeError);
  await assert.rejects(reconcileStorePayment({ db: f.db, payment: { ...verified } }), /no server verification/);
});
test('a conflicting stored historical event receipt is not treated as a duplicate', async () => {
  const f = memory();
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() });
  f.rows.storePaymentEvents['curlec_test_historical-event'].providerTransactionId = 'pay_Another';
  const before = f.requests.length;
  await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() }), /conflicts/);
  assert.equal(f.requests.length, before);
});
test('a delayed second capture never replaces an already Paid current order', async () => {
  const f = memory(); Object.assign(f.rows.storeOrders[orderId].payment, { status: 'paid', providerTransactionId: 'pay_New' });
  const before = copy(f.rows.storeOrders);
  await handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() });
  assert.deepEqual(f.rows.storeOrders, before);
  assert.equal(Object.values(f.rows.storePaymentAttemptVerifications)[0].requiresReview, true);
});
test('an unavailable historical snapshot is not synthesized from provider notes', async () => {
  const f = memory(); delete f.rows.storeCheckoutAttempts[id];
  await assert.rejects(handleStorePaymentWebhook({ db: f.db, adapter: f.adapter, event: event() }), /unavailable/);
  assert.equal(f.requests.length, 0);
});
test('valid signature on the opposite mode endpoint cannot reach the provider or write audit records', async () => {
  const f = memory(); const secret = 'disposable-live-secret'; let status;
  const handler = createCurlecStorePaymentWebhookHandler({ webhookDb: f.db, curlecEnvironment: 'live',
    getCurlecKeyId: () => 'rzp_live_Fixture', getCurlecKeySecret: () => 'private-secret', getWebhookSecret: () => secret,
    createAdapter: (provider, opts) => createCurlecPaymentLinkAdapter(opts.curlecKeyId, opts.curlecKeySecret, { fetchImpl: f.fetchImpl }) });
  const rawBody = Buffer.from(JSON.stringify(event()));
  await handler({ method: 'POST', rawBody, get: name => name.toLowerCase() === 'x-razorpay-signature'
    ? createHmac('sha256', secret).update(rawBody).digest('hex') : 'cross-mode-historical' },
  { status: code => ({ json: () => { status = code; }, send: () => { status = code; } }) });
  assert.equal(status, 400); assert.equal(f.requests.length, 0); assert.deepEqual(f.rows.storePaymentAttemptVerifications, {});
});
for (const [label, body, status, expected] of [
  ['missing link', { payment_links: [] }, 200, 'not_found_ambiguous'],
  ['provider 404', { error: { description: 'private@example.test' } }, 404, 'ambiguous'],
  ['malformed lookup', { private: 'private@example.test' }, 200, 'ambiguous'],
  ['multiple links', { payment_links: [link(), link()] }, 200, 'ambiguous'],
  ['wrong reference', { payment_links: [{ ...link(), reference_id: 'unrelated' }] }, 200, 'inconsistent'],
]) test(`read-only reference inspection classifies ${label} without creating anything`, async () => {
  const a = attempt(); delete a.providerPaymentId;
  const requests = [];
  const adapter = createCurlecPaymentLinkAdapter('rzp_test_Fixture', 'private-secret', { fetchImpl: async (url, options) => {
    assert.ok(!options.method || options.method === 'GET'); requests.push(url);
    return new Response(JSON.stringify(body), { status });
  } });
  const result = await adapter.inspectWeeklyPosAttempt({ orderId, attempt: a });
  assert.equal(result.outcome, expected); assert.equal(result.successorAllowed, false);
  assert.equal(requests.length, 1); assert.ok(requests[0].endsWith('?reference_id=' + curlecAttemptReference(id)));
  assert.doesNotMatch(JSON.stringify(result), /private|https:|secret/);
});
