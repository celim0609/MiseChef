import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCurlecWebhookRejectionLog,
  getCurlecWebhookSignatureDiagnostics
} from './curlecWebhookDiagnostics.js';
import { curlecStorePaymentWebhookHandler } from './index.js';
import { handleStorePaymentWebhook } from './storePayments.js';

const sensitiveValue = 'must-not-appear-in-diagnostics';

test('missing and invalid Curlec signatures record only signature diagnostics', () => {
  const missing = createCurlecWebhookRejectionLog({
    rejectionStage: 'signature',
    error: new Error('Invalid Curlec webhook signature.'),
    signatureDiagnostics: getCurlecWebhookSignatureDiagnostics({ signature: undefined, rawBody: Buffer.from('{}') })
  });
  const invalid = createCurlecWebhookRejectionLog({
    rejectionStage: 'signature',
    error: new Error('Invalid Curlec webhook signature.'),
    signatureDiagnostics: getCurlecWebhookSignatureDiagnostics({ signature: 'invalid-signature', rawBody: Buffer.from('{}') })
  });
  assert.deepEqual(missing, {
    rejectionStage: 'signature', errorCategory: 'Error', errorMessage: 'Invalid Curlec webhook signature.',
    signaturePresent: false, rawBodyPresent: true, rawBodyByteLength: 2
  });
  assert.equal(invalid.rejectionStage, 'signature');
  assert.equal(invalid.signaturePresent, true);
  assert.equal(invalid.rawBodyByteLength, 2);
});

test('missing Curlec raw body records the signature stage without body content', () => {
  const diagnostic = createCurlecWebhookRejectionLog({
    rejectionStage: 'signature',
    error: new TypeError('raw body was unavailable'),
    signatureDiagnostics: getCurlecWebhookSignatureDiagnostics({ signature: 'present', rawBody: undefined })
  });
  assert.deepEqual(diagnostic, {
    rejectionStage: 'signature', errorCategory: 'TypeError', errorMessage: 'Curlec webhook signature rejected.',
    signaturePresent: true, rawBodyPresent: false, rawBodyByteLength: 0
  });
});

test('Curlec webhook handler catch scope returns its generic 400 response', async () => {
  let statusCode = 0;
  let responseBody = '';
  await curlecStorePaymentWebhookHandler({
    method: 'POST',
    rawBody: undefined,
    get: () => undefined
  }, {
    status: code => {
      statusCode = code;
      return { send: body => { responseBody = body; } };
    }
  });
  assert.equal(statusCode, 400);
  assert.equal(responseBody, 'Webhook rejected');
});

test('later webhook validation failures retain their stage and only safe messages', () => {
  const captured = createCurlecWebhookRejectionLog({
    rejectionStage: 'captured_event_validation',
    error: new Error('Curlec paid event does not contain a captured payment.')
  });
  const resolution = createCurlecWebhookRejectionLog({
    rejectionStage: 'provider_order_resolution',
    error: new Error('Curlec payment has no unique MiseChef order.')
  });
  const dedupe = createCurlecWebhookRejectionLog({
    rejectionStage: 'event_dedupe_read',
    error: new Error(`provider failure ${sensitiveValue}`)
  });
  assert.equal(captured.rejectionStage, 'captured_event_validation');
  assert.equal(captured.errorMessage, 'Curlec paid event does not contain a captured payment.');
  assert.equal(resolution.rejectionStage, 'provider_order_resolution');
  assert.equal(resolution.errorMessage, 'Curlec payment has no unique MiseChef order.');
  assert.equal(dedupe.rejectionStage, 'event_dedupe_read');
  assert.equal(dedupe.errorMessage, 'Curlec webhook event_dedupe_read rejected.');
  assert.doesNotMatch(JSON.stringify(dedupe), new RegExp(sensitiveValue));
  assert.doesNotMatch(JSON.stringify(captured), /signature|payload|secret|paymentId/i);
});

test('shared webhook processing reports the stage that failed before reconciliation', async () => {
  const capturedStages = [];
  await assert.rejects(handleStorePaymentWebhook({
    db: {},
    adapter: { readWebhookUpdate: () => { throw new Error('Curlec paid event does not contain a captured payment.'); } },
    event: {},
    onRejectionStage: stage => capturedStages.push(stage)
  }));
  assert.deepEqual(capturedStages, ['captured_event_validation']);

  const resolutionStages = [];
  await assert.rejects(handleStorePaymentWebhook({
    db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ size: 0, docs: [] }) }) }) }) },
    adapter: { readWebhookUpdate: () => ({ kind: 'payment', payment: { providerPaymentId: 'gateway-order' } }) },
    event: { id: 'event-id', type: 'payment.captured' },
    onRejectionStage: stage => resolutionStages.push(stage)
  }));
  assert.deepEqual(resolutionStages, ['captured_event_validation', 'provider_order_resolution']);

  const dedupeStages = [];
  await assert.rejects(handleStorePaymentWebhook({
    db: { collection: () => ({ doc: () => ({ get: async () => { throw new Error('dedupe read failure'); } }) }) },
    adapter: { readWebhookUpdate: () => ({ kind: 'payment', payment: { providerPaymentId: 'gateway-order', orderId: 'mise-order' } }) },
    event: { id: 'event-id', type: 'payment.captured' },
    onRejectionStage: stage => dedupeStages.push(stage)
  }));
  assert.deepEqual(dedupeStages, ['captured_event_validation', 'event_dedupe_read']);
});
