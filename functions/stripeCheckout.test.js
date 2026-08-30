import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStripeCheckoutUrls,
  createStripeSingleMerchantAdapter
} from './paymentProviders/stripeSingleMerchant.js';
import { validateStoreCheckoutReturnUrl } from './storePayments.js';

const order = {
  id: 'order-123',
  orderNumber: 'MC-1001',
  storeName: 'Ce Lim Kitchen',
  workspaceId: 'workspace-my',
  currency: 'MYR',
  payment: { amountMinor: 1210 }
};

const createFakeStripe = () => {
  const calls = { create: [], expire: [], retrieve: [] };
  const paidSession = {
    id: 'cs_test_123',
    amount_total: 1210,
    currency: 'myr',
    status: 'complete',
    payment_status: 'paid',
    metadata: { misechefOrderId: order.id },
    payment_intent: {
      id: 'pi_test_123',
      status: 'succeeded',
      metadata: { misechefOrderId: order.id },
      payment_method: { type: 'grabpay' }
    }
  };
  return {
    calls,
    stripe: {
      checkout: {
        sessions: {
          async create(params, options) {
            calls.create.push({ params, options });
            return { id: paidSession.id, url: 'https://checkout.stripe.test/c/pay/cs_test_123' };
          },
          async retrieve(id) {
            calls.retrieve.push(id);
            return paidSession;
          },
          async list() {
            return { data: [{ id: paidSession.id }] };
          },
          async expire(id) {
            calls.expire.push(id);
            return { ...paidSession, status: 'expired', payment_status: 'unpaid', payment_intent: null };
          }
        }
      },
      paymentIntents: {
        async retrieve(id) {
          return {
            id,
            amount: 1210,
            currency: 'myr',
            status: 'succeeded',
            metadata: { misechefOrderId: order.id },
            payment_method: { type: 'card' }
          };
        },
        async cancel(id) {
          return {
            id,
            amount: 1210,
            currency: 'myr',
            status: 'canceled',
            metadata: { misechefOrderId: order.id }
          };
        }
      },
      webhooks: { constructEvent: () => ({ id: 'evt_test' }) }
    }
  };
};

test('Checkout receives the exact server-authoritative MYR order total', async () => {
  const fake = createFakeStripe();
  const adapter = createStripeSingleMerchantAdapter('', { stripeClient: fake.stripe });
  const result = await adapter.createPayment({
    order,
    returnUrl: 'https://misechef-beta-fa4bf.web.app/store/ce-lim-kitchen',
    checkoutAccessToken: 'opaque-token'
  });
  const { params, options } = fake.calls.create[0];

  assert.equal(result.checkout.type, 'provider_redirect');
  assert.equal(result.providerPaymentId, 'cs_test_123');
  assert.equal(params.mode, 'payment');
  assert.equal(params.line_items.length, 1);
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(params.line_items[0].price_data.currency, 'myr');
  assert.equal(params.line_items[0].price_data.unit_amount, 1210);
  assert.equal(params.line_items[0].price_data.product_data.name, 'Ce Lim Kitchen order MC-1001');
  assert.equal('payment_method_types' in params, false);
  assert.equal(params.metadata.misechefOrderId, order.id);
  assert.equal(params.payment_intent_data.metadata.misechefWorkspaceId, order.workspaceId);
  assert.match(params.success_url, /payment_session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(params.success_url, /payment_access_token=opaque-token/);
  assert.match(params.cancel_url, /payment_cancelled=1/);
  assert.equal(options.idempotencyKey, `misechef-order-${order.id}`);
});

test('Checkout payment and webhook normalization preserve session and transaction references', async () => {
  const fake = createFakeStripe();
  const adapter = createStripeSingleMerchantAdapter('', { stripeClient: fake.stripe });
  const payment = await adapter.retrievePayment('cs_test_123');
  assert.deepEqual(payment, {
    providerPaymentId: 'cs_test_123',
    providerTransactionId: 'pi_test_123',
    orderId: order.id,
    amountMinor: 1210,
    currency: 'MYR',
    status: 'paid',
    providerStatus: 'paid',
    paymentMethod: 'grabpay',
    failureCode: ''
  });

  const update = await adapter.readWebhookUpdate({
    id: 'evt_checkout_completed',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_123' } }
  });
  assert.equal(update.kind, 'payment');
  assert.equal(update.payment.status, 'paid');
  assert.equal(update.payment.providerTransactionId, 'pi_test_123');
});

test('cancelled Checkout remains unpaid and legacy PaymentIntents remain readable', async () => {
  const fake = createFakeStripe();
  const adapter = createStripeSingleMerchantAdapter('', { stripeClient: fake.stripe });
  const cancelled = await adapter.cancelPayment('cs_test_123');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(fake.calls.expire[0], 'cs_test_123');

  const legacy = await adapter.retrievePayment('pi_legacy_123');
  assert.equal(legacy.providerPaymentId, 'pi_legacy_123');
  assert.equal(legacy.providerTransactionId, 'pi_legacy_123');
  assert.equal(legacy.status, 'paid');
});

test('failed and abandoned Checkout sessions never normalize as Paid', async () => {
  const fake = createFakeStripe();
  fake.stripe.checkout.sessions.retrieve = async id => ({
    id,
    amount_total: 1210,
    currency: 'myr',
    status: 'complete',
    payment_status: 'unpaid',
    metadata: { misechefOrderId: order.id },
    payment_intent: {
      id: 'pi_failed_123',
      status: 'requires_payment_method',
      metadata: { misechefOrderId: order.id },
      last_payment_error: { code: 'card_declined' }
    }
  });
  const adapter = createStripeSingleMerchantAdapter('', { stripeClient: fake.stripe });
  const failed = await adapter.retrievePayment('cs_failed_123');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureCode, 'card_declined');

  fake.stripe.checkout.sessions.retrieve = async id => ({
    id,
    amount_total: 1210,
    currency: 'myr',
    status: 'expired',
    payment_status: 'unpaid',
    metadata: { misechefOrderId: order.id },
    payment_intent: null
  });
  const abandoned = await adapter.retrievePayment('cs_expired_123');
  assert.equal(abandoned.status, 'cancelled');
});

test('Stripe Checkout URLs preserve only the approved return and opaque identifiers', () => {
  const urls = buildStripeCheckoutUrls({
    returnUrl: 'https://misechef.ai/store/ce-lim-kitchen',
    providerPaymentId: '{CHECKOUT_SESSION_ID}',
    checkoutAccessToken: 'access-token'
  });
  assert.match(urls.successUrl, /^https:\/\/misechef\.ai\/store\/ce-lim-kitchen\?/);
  assert.match(urls.successUrl, /payment_provider=stripe/);
  assert.doesNotMatch(urls.successUrl, /workspace-my|order-123/);
});

test('Checkout return URLs cannot redirect customers outside MiseChef', () => {
  assert.equal(
    validateStoreCheckoutReturnUrl('https://misechef-beta-fa4bf.web.app/store/ce-lim-kitchen?ignored=1#cart'),
    'https://misechef-beta-fa4bf.web.app/store/ce-lim-kitchen'
  );
  assert.throws(
    () => validateStoreCheckoutReturnUrl('https://attacker.example/store/ce-lim-kitchen'),
    /return URL is invalid/
  );
  assert.throws(
    () => validateStoreCheckoutReturnUrl('https://misechef-beta-fa4bf.web.app/app'),
    /return URL is invalid/
  );
});
