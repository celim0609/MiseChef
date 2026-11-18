import assert from 'node:assert/strict';
import test from 'node:test';
import { createCurlecPaymentLinkAdapter } from './paymentProviders/curlecPaymentLink.js';
import { annotateCurlecLinkError, emitCurlecLinkDiagnostic, getCurlecLinkFailures, preserveCurlecLinkFailures, recoverCurlecLinkCreation } from './curlecLinkDiagnostics.js';

const correlationId = 'a5b3c233-9fe4-4f03-9677-2774106b5201';
const privateText = 'private@example.test key-secret https://rzp.io/private?token=private Customer Name';
const order = { id: 'privateOrder', orderNumber: 'QA-PRIVATE', customerEmail: 'private@example.test',
  customerName: 'Customer Name', currency: 'MYR', payment: { amountMinor: 1290 } };
const args = { order, returnUrl: 'https://misechef-beta-fa4bf.web.app/store/qa', checkoutAccessToken: 'private-token',
  weeklyPosSession: { id: 'a'.repeat(64), revision: 1, expiresAt: 2000000000 } };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const valid = { id: 'plink_QA', short_url: 'https://rzp.io/i/private', amount: 1290, currency: 'MYR',
  reference_id: 'mcp_' + 'a'.repeat(32), accept_partial: false, expire_by: 2000000000,
  notes: { misechefOrderId: 'privateOrder', misechefWeeklyPosAttemptId: 'a'.repeat(64), misechefOrderRevision: '1' } };
const capture = error => {
  const records = [];
  emitCurlecLinkDiagnostic(x => records.push(x), { error, correlationId, mode: 'test', operation: 'create', durationMs: 3.2 });
  return records[0];
};

for (const status of [400, 401, 403, 422, 429, 500]) {
  test(`creation preserves upstream HTTP ${status} without logging its body`, async () => {
    const adapter = createCurlecPaymentLinkAdapter('private-key', 'key-secret', { fetchImpl: async () =>
      response({ error: { code: 'BAD_REQUEST_ERROR', description: privateText, metadata: { body: privateText } } }, status) });
    await assert.rejects(adapter.createPayment(args), error => {
      const record = capture(error);
      assert.equal(record.category, 'provider_http_rejection');
      assert.equal(record.httpStatus, status);
      assert.equal(record.providerCode, 'BAD_REQUEST_ERROR');
      assert.doesNotMatch(JSON.stringify(record), /private|Customer|token|key-secret/);
      assert.equal(error.curlecHttpStatus, status);
      return true;
    });
  });
}

for (const [name, category] of [['TimeoutError', 'timeout'], ['AbortError', 'timeout'], ['TypeError', 'transport_failure']]) {
  test(`creation classifies ${name} and retains its original cause privately`, async () => {
    const cause = Object.assign(new Error(privateText), { name });
    const adapter = createCurlecPaymentLinkAdapter('private-key', 'key-secret', { fetchImpl: async () => { throw cause; } });
    await assert.rejects(adapter.createPayment(args), error => {
      assert.equal(capture(error).category, category);
      assert.equal(capture(error).httpStatus, null);
      assert.equal(getCurlecLinkFailures(error).originalError, cause);
      assert.doesNotMatch(JSON.stringify(capture(error)), /private|Customer|token/);
      return true;
    });
  });
}

for (const [label, body, category] of [
  ['invalid JSON', null, 'malformed_response'],
  ['missing link fields', {}, 'malformed_response'],
  ['amount mismatch', { ...valid, amount: 1 }, 'validation_failure'],
  ['revision mismatch', { ...valid, notes: { ...valid.notes, misechefOrderRevision: '2' } }, 'validation_failure'],
  ['unsafe URL', { ...valid, short_url: 'https://evil.example/private' }, 'validation_failure'],
]) {
  test(`creation distinguishes ${label}`, async () => {
    const adapter = createCurlecPaymentLinkAdapter('private-key', 'key-secret', { fetchImpl: async () =>
      body === null ? new Response('not JSON ' + privateText, { status: 200 }) : response(body) });
    await assert.rejects(adapter.createPayment(args), error => {
      assert.equal(capture(error).category, category);
      assert.equal(capture(error).httpStatus, 200);
      return true;
    });
  });
}

test('recovery logs creation and lookup failures separately while preserving the thrown lookup error', async () => {
  const original = annotateCurlecLinkError(new Error(privateText), { category: 'provider_http_rejection', httpStatus: 403, providerCode: 'AUTHORIZATION_ERROR' });
  const records = [];
  const adapter = createCurlecPaymentLinkAdapter('private-key', 'key-secret', { fetchImpl: async () => response({ error: { code: 'SERVER_ERROR', description: privateText } }, 503) });
  await assert.rejects(recoverCurlecLinkCreation({ originalError: original, operation: 'create', correlationId, mode: 'test',
    onDiagnostic: x => records.push(x), lookup: () => adapter.findWeeklyPosPayment(args) }), error => {
    assert.equal(getCurlecLinkFailures(error).originalError, original);
    assert.equal(getCurlecLinkFailures(error).recoveryLookupError, error);
    return true;
  });
  assert.deepEqual(records.map(r => [r.operation, r.httpStatus, r.providerCode]),
    [['create', 403, 'AUTHORIZATION_ERROR'], ['recovery_lookup', 503, 'SERVER_ERROR']]);
  assert.equal(records[0].correlationId, records[1].correlationId);
  assert.doesNotMatch(JSON.stringify(records), /private|Customer|token/);
});

for (const [label, fetchImpl, category] of [
  ['timeout', async () => { throw Object.assign(new Error(privateText), { name: 'TimeoutError' }); }, 'timeout'],
  ['transport', async () => { throw new TypeError(privateText); }, 'transport_failure'],
  ['invalid JSON', async () => new Response('private bad JSON'), 'malformed_response'],
  ['invalid shape', async () => response({ private: privateText }), 'malformed_response'],
  ['wrong reference', async () => response({ payment_links: [{ ...valid, reference_id: 'private-other' }] }), 'validation_failure'],
]) {
  test(`lookup classifies ${label}`, async () => {
    const adapter = createCurlecPaymentLinkAdapter('private-key', 'key-secret', { fetchImpl });
    await assert.rejects(adapter.findWeeklyPosPayment(args), error => {
      assert.equal(capture(error).category, category);
      assert.doesNotMatch(JSON.stringify(capture(error)), /private|Customer|token/);
      return true;
    });
  });
}

test('not-found recovery retains the original failure on the unresolved error without changing lookup or retry behavior', async () => {
  const records = [];
  const original = new Error(privateText);
  let lookups = 0;
  assert.equal(await recoverCurlecLinkCreation({ originalError: original, operation: 'create', correlationId, mode: 'test',
    onDiagnostic: r => records.push(r), lookup: async () => { lookups++; return null; } }), null);
  const unresolved = preserveCurlecLinkFailures(new Error('unresolved'), original);
  assert.equal(getCurlecLinkFailures(unresolved).originalError, original);
  assert.equal(lookups, 1);
  assert.deepEqual(records.map(r => r.outcome), ['failed', 'not_found']);
  assert.equal(JSON.stringify(unresolved), '{}');
});

test('diagnostic sink failure cannot interrupt successful recovery', async () => {
  const result = { providerPaymentId: 'plink_QA' };
  assert.equal(await recoverCurlecLinkCreation({ originalError: new Error(privateText), operation: 'create', correlationId,
    mode: 'test', onDiagnostic: () => { throw new Error('logging failed'); }, lookup: async () => result }), result);
});

for (const [name, category] of [['TimeoutError', 'timeout'], ['TypeError', 'transport_failure']]) {
  test(`response-body ${name} is not misreported as invalid JSON`, async () => {
    const cause = Object.assign(new Error(privateText), { name });
    const adapter = createCurlecPaymentLinkAdapter('private-key', 'key-secret', { fetchImpl: async () => ({
      ok: true, status: 200, json: async () => { throw cause; },
    }) });
    for (const operation of [() => adapter.createPayment(args), () => adapter.findWeeklyPosPayment(args)]) {
      await assert.rejects(operation(), error => {
        assert.equal(capture(error).category, category);
        assert.equal(capture(error).httpStatus, 200);
        assert.doesNotMatch(JSON.stringify(capture(error)), /private|Customer|token/);
        return true;
      });
    }
  });
}

test('unexpected primitive throws remain unchanged by diagnostic bookkeeping', async () => {
  const original = new Error('creation');
  await assert.rejects(recoverCurlecLinkCreation({ originalError: original, operation: 'create', correlationId,
    mode: 'test', onDiagnostic: () => {}, lookup: async () => { throw 'provider failure'; } }), value => value === 'provider failure');
});

test('redaction uses an exact field allowlist and never copies arbitrary error or context properties', () => {
  const error = annotateCurlecLinkError(Object.assign(new Error(privateText), { body: privateText, credentials: privateText }),
    { category: privateText, httpStatus: privateText, providerCode: 'BAD_REQUEST_ERROR ' + privateText });
  const records = [];
  emitCurlecLinkDiagnostic(r => records.push(r), { error, correlationId: privateText, mode: privateText, operation: privateText,
    body: privateText, customerEmail: privateText, durationMs: Infinity });
  assert.deepEqual(records[0], { correlationId: 'unavailable', mode: 'unknown', operation: 'unknown', outcome: 'failed',
    durationMs: 0, category: 'validation_failure', httpStatus: null, providerCode: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(records), /private|Customer|token|credentials|body|email/i);
});
