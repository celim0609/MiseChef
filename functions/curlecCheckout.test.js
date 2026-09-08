import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
  CurlecOrderCreationError,
  createCurlecStandardCheckoutAdapter,
  getCurlecWebhookDedupeId,
  verifyCurlecWebhookSignature
} from './paymentProviders/curlecStandardCheckout.js';

const order = { id: 'mise-order-1', orderNumber: 'MC-0908-ABCD', storeName: 'MiseChef Kitchen', currency: 'MYR', payment: { amountMinor: 1590 } };

test('Curlec creates an order using only the authoritative minor amount and currency', async () => {
  const requests = [];
  const adapter = createCurlecStandardCheckoutAdapter('key_id', 'key_secret', { fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ id: 'order_curlec_1', amount: 1590, currency: 'MYR' }) };
  } });
  const result = await adapter.createPayment({ order });
  assert.equal(result.providerPaymentId, 'order_curlec_1');
  assert.equal(result.checkout.type, 'curlec_standard_checkout');
  assert.equal(result.checkout.keyId, 'key_id');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    amount: 1590, currency: 'MYR', receipt: 'MC-0908-ABCD',
    notes: { misechefOrderId: 'mise-order-1', misechefOrderNumber: 'MC-0908-ABCD' }
  });
  assert.doesNotMatch(requests[0].options.body, /total|client/i);
});

test('Curlec order failures retain only sanitized gateway diagnostics', async () => {
  const adapter = createCurlecStandardCheckoutAdapter('key_id', 'key_secret', {
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The amount must be at least 10.',
          metadata: { requestBody: 'must-not-be-retained' }
        }
      })
    })
  });

  await assert.rejects(adapter.createPayment({ order }), error => {
    assert.ok(error instanceof CurlecOrderCreationError);
    assert.equal(error.message, 'Curlec could not create a payment order.');
    assert.deepEqual({
      httpStatus: error.curlecHttpStatus,
      errorCode: error.curlecErrorCode,
      errorDescription: error.curlecErrorDescription
    }, {
      httpStatus: 400,
      errorCode: 'BAD_REQUEST_ERROR',
      errorDescription: 'The amount must be at least 10.'
    });
    assert.deepEqual(Object.keys(error).sort(), [
      'curlecErrorCode', 'curlecErrorDescription', 'curlecHttpStatus', 'name'
    ]);
    assert.doesNotMatch(JSON.stringify(error), /requestBody|key_secret|key_id/i);
    return true;
  });
});

test('Curlec webhook signatures use raw bytes and reject invalid values', () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const secret = 'webhook_secret_for_test_only';
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(verifyCurlecWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyCurlecWebhookSignature(rawBody, '0'.repeat(64), secret), false);
});

test('Curlec dedupe keys are stable without assuming a gateway event id', () => {
  const payload = { event: 'payment.captured', created_at: 100, payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } }, order: { entity: { id: 'order_1' } } } };
  assert.equal(getCurlecWebhookDedupeId(payload), getCurlecWebhookDedupeId(structuredClone(payload)));
  assert.match(getCurlecWebhookDedupeId(payload), /^curlec_[a-f0-9]{64}$/);
});

test('Curlec paid and failed webhooks normalize only valid gateway transitions', () => {
  const adapter = createCurlecStandardCheckoutAdapter('key_id', 'key_secret');
  const captured = adapter.readWebhookUpdate({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 1590, currency: 'MYR', status: 'captured', captured: true, notes: { misechefOrderId: 'mise-order-1' }, method: 'fpx' } } } });
  assert.equal(captured.payment.status, 'paid');
  assert.equal(captured.payment.orderId, 'mise-order-1');
  const failed = adapter.readWebhookUpdate({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 1590, currency: 'MYR', status: 'failed', notes: { misechefOrderId: 'mise-order-1' } } } } });
  assert.equal(failed.payment.status, 'failed');
  assert.throws(() => adapter.readWebhookUpdate({ event: 'payment.captured', payload: { payment: { entity: { status: 'authorized' } } } }), /does not contain a captured payment/);
});
