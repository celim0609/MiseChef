import assert from 'node:assert/strict';
import test from 'node:test';
import { createCurlecPaymentLinkAdapter } from './paymentProviders/curlecPaymentLink.js';

const order = {
  id: 'mise-order-link-1', orderNumber: 'MC-0917-ABCD', storeName: 'MiseChef Kitchen', currency: 'MYR',
  payment: { amountMinor: 1590 }
};

test('Curlec Payment Link uses the immutable server amount, unique MiseChef reference, and explicitly excludes Card', async () => {
  const requests = [];
  const adapter = createCurlecPaymentLinkAdapter('key_id', 'key_secret', { fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/i/test', amount: 1590, currency: 'MYR' }) };
  } });
  const result = await adapter.createPayment({ order, returnUrl: 'https://misechef-beta-fa4bf.web.app/store/test', checkoutAccessToken: 'opaque-token' });
  assert.deepEqual(result, { providerPaymentId: 'plink_1', checkout: { type: 'curlec_payment_link', redirectUrl: 'https://rzp.io/i/test' } });
  assert.equal(requests[0].url, 'https://api.razorpay.com/v1/payment_links');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    amount: 1590, currency: 'MYR', accept_partial: false, reference_id: 'mc_mise-order-link-1',
    description: 'Order MC-0917-ABCD', notify: { sms: false, email: false }, reminder_enable: false,
    callback_url: 'https://misechef-beta-fa4bf.web.app/store/test?payment_provider=curlec&payment_access_token=opaque-token', callback_method: 'get',
    notes: { misechefOrderId: 'mise-order-link-1', misechefOrderNumber: 'MC-0917-ABCD' },
    options: { checkout: { method: { fpx: true, card: false, wallet: true } } }
  });
  assert.doesNotMatch(requests[0].options.body, /grandTotal|clientTotal|clientAmount/i);
});

test('Curlec Payment Link rejects a gateway amount mismatch before returning a payable URL', async () => {
  const adapter = createCurlecPaymentLinkAdapter('key_id', 'key_secret', { fetchImpl: async () => ({
    ok: true, status: 200, json: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/i/test', amount: 1, currency: 'MYR' })
  }) });
  await assert.rejects(adapter.createPayment({ order, returnUrl: 'https://misechef-beta-fa4bf.web.app/store/test', checkoutAccessToken: 'opaque-token' }), /Curlec payment link amount validation failed/);
});

test('Curlec payment_link.paid maps only its persisted Payment Link ID and captured payment to the MiseChef order', () => {
  const adapter = createCurlecPaymentLinkAdapter('key_id', 'key_secret');
  const update = adapter.readWebhookUpdate({
    event: 'payment_link.paid', payload: {
      payment_link: { entity: { id: 'plink_1', notes: { misechefOrderId: 'mise-order-link-1' } } },
      payment: { entity: { id: 'pay_1', amount: 1590, currency: 'MYR', status: 'captured', captured: true, method: 'wallet' } }
    }
  });
  assert.deepEqual(update.payment, {
    providerPaymentId: 'plink_1', providerTransactionId: 'pay_1', orderId: 'mise-order-link-1',
    amountMinor: 1590, currency: 'MYR', status: 'paid', providerStatus: 'captured', paymentMethod: 'wallet', failureCode: ''
  });
  assert.throws(() => adapter.readWebhookUpdate({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_1' } }, payment: { entity: { status: 'authorized' } } } }), /does not contain a captured payment/);
});

test('Curlec Payment Link reference is deterministic across a retried provider call', async () => {
  const references = [];
  const adapter = createCurlecPaymentLinkAdapter('key_id', 'key_secret', { fetchImpl: async (_url, options) => {
    references.push(JSON.parse(options.body).reference_id);
    return { ok: true, status: 200, json: async () => ({ id: `plink_${references.length}`, short_url: 'https://rzp.io/i/test', amount: 1590, currency: 'MYR' }) };
  } });
  await adapter.createPayment({ order, returnUrl: 'https://misechef-beta-fa4bf.web.app/store/test', checkoutAccessToken: 'opaque-token' });
  await adapter.createPayment({ order, returnUrl: 'https://misechef-beta-fa4bf.web.app/store/test', checkoutAccessToken: 'opaque-token' });
  assert.deepEqual(references, ['mc_mise-order-link-1', 'mc_mise-order-link-1']);
});
