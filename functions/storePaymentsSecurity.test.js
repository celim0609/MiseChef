import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const functionsIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const paymentService = readFileSync(new URL('./storePayments.js', import.meta.url), 'utf8');
const stripeAdapter = readFileSync(
  new URL('./paymentProviders/stripeSingleMerchant.js', import.meta.url),
  'utf8'
);
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const paymentForm = readFileSync(
  new URL('../src/modules/store/StripePaymentForm.tsx', import.meta.url),
  'utf8'
);
const paymentCheckout = readFileSync(
  new URL('../src/modules/store/StorePaymentCheckout.tsx', import.meta.url),
  'utf8'
);
const publicStorePage = readFileSync(
  new URL('../src/modules/store/PublicStorePage.tsx', import.meta.url),
  'utf8'
);
const paymentProviderRegistry = readFileSync(
  new URL('./paymentProviders/index.js', import.meta.url),
  'utf8'
);
const clientPaymentProviderRegistry = readFileSync(
  new URL('../src/modules/store/paymentProviders/index.ts', import.meta.url),
  'utf8'
);
const stripeClientAdapter = readFileSync(
  new URL('../src/modules/store/paymentProviders/stripeClientAdapter.tsx', import.meta.url),
  'utf8'
);

test('Stripe secrets stay server-side and webhook verification uses the raw signed body', () => {
  assert.match(functionsIndex, /defineSecret\('STRIPE_SECRET_KEY'\)/);
  assert.match(functionsIndex, /defineSecret\('STRIPE_WEBHOOK_SECRET'\)/);
  assert.match(functionsIndex, /request\.rawBody/);
  assert.match(functionsIndex, /request\.get\('stripe-signature'\)/);
  assert.match(functionsIndex, /constructWebhookEvent/);
  assert.doesNotMatch(paymentForm, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
  assert.match(stripeAdapter, /charge\.refunded/);
  assert.match(stripeAdapter, /refund\./);
});

test('single-merchant routing is server configured and client orders cannot name a merchant', () => {
  assert.match(functionsIndex, /defineString\('SELLING_WORKSPACE_ID'/);
  assert.match(paymentService, /assertSellingWorkspace\(checkoutData\.store, sellingWorkspaceId\)/);
  assert.doesNotMatch(paymentService, /draft\.(workspaceId|storeId|currency|total|providerMode)/);
  assert.match(paymentService, /timingSafeEqual/);
  assert.match(paymentService, /checkoutAccessTokenHash/);
});

test('clients cannot create or mutate Store orders and payment events', () => {
  const orderRulesStart = firestoreRules.indexOf('match /storeOrders/{orderId}');
  const orderRulesEnd = firestoreRules.indexOf('match /publicChefProfileOwnership', orderRulesStart);
  const rules = firestoreRules.slice(orderRulesStart, orderRulesEnd);
  assert.match(rules, /allow create: if false/);
  assert.match(rules, /allow update, delete: if false/);
  assert.match(rules, /match \/storePaymentEvents\/\{eventId\}/);
});

test('Payment Element keeps email optional and payment methods account-driven', () => {
  assert.match(paymentForm, /email: 'auto'/);
  assert.doesNotMatch(paymentForm, /email: 'never'/);
  assert.match(paymentForm, /address: 'if_required'/);
  assert.match(stripeAdapter, /automatic_payment_methods: \{ enabled: true \}/);
});

test('Payment Element recovers from rejected confirmations so customers can retry', () => {
  assert.match(paymentForm, /try \{\s+confirmation = await stripe\.confirmPayment/);
  assert.match(paymentForm, /catch \{\s+setErrorMessage\(PAYMENT_RETRY_MESSAGE\)/);
  assert.match(paymentForm, /finally \{\s+setIsPaying\(false\)/);
  assert.match(paymentForm, /Check your payment details and try again\./);
});

test('Store checkout and order flow depend on provider-neutral payment sessions', () => {
  assert.match(paymentCheckout, /getPaymentProviderClientAdapter\(session\.provider\)/);
  assert.doesNotMatch(paymentCheckout, /Stripe|stripe_payment_element|provider_redirect/);
  assert.doesNotMatch(publicStorePage, /Stripe|PaymentIntent|clientSecret/);
  assert.doesNotMatch(paymentService, /Stripe|PaymentIntent|clientSecret/);
  assert.doesNotMatch(paymentService, /draft\.(provider|providerMode)/);
  assert.match(paymentProviderRegistry, /createPaymentAdapter/);
  assert.match(paymentProviderRegistry, /PRIMARY_PAYMENT_PROVIDER/);
  assert.match(clientPaymentProviderRegistry, /stripeClientPaymentAdapter/);
  assert.match(stripeClientAdapter, /StripePaymentForm/);
  assert.match(stripeClientAdapter, /stripe_payment_element/);
});
