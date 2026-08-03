import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const functionsIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const paymentService = readFileSync(new URL('./storePayments.js', import.meta.url), 'utf8');
const fulfilmentService = readFileSync(new URL('./storeFulfilment.js', import.meta.url), 'utf8');
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
const manualPaymentService = readFileSync(new URL('./storeManualPayments.js', import.meta.url), 'utf8');
const manualClientAdapter = readFileSync(
  new URL('../src/modules/store/paymentProviders/manualClientAdapter.tsx', import.meta.url),
  'utf8'
);
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

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
  assert.match(rules, /match \/storeOrderTimeline\/\{eventId\}[\s\S]*allow create, update, delete: if false/);
  assert.match(rules, /match \/storeNotifications\/\{notificationId\}[\s\S]*allow create, delete: if false/);
});

test('fulfilment changes are server-owned, sequential, audited, and Owner-Manager only', () => {
  assert.match(functionsIndex, /export const updateStoreOrderStatus = onCall/);
  assert.match(fulfilmentService, /membership\.role === 'Manager'/);
  assert.match(fulfilmentService, /readString\(workspace\.ownerId\) === uid/);
  assert.match(fulfilmentService, /FieldValue\.serverTimestamp\(\)/);
  assert.match(fulfilmentService, /previousStatus: currentStatus/);
  assert.match(fulfilmentService, /actingUserId: uid/);
  assert.match(fulfilmentService, /refundStatus === 'refunded'/);
});

test('a paid Stripe payment creates one deterministic persistent order notification', () => {
  assert.match(paymentService, /new-paid-order_\$\{orderId\}/);
  assert.match(paymentService, /orderId}_payment-received/);
  assert.match(paymentService, /if \(isNewPaidOrder[\s\S]*!notificationSnapshot\.exists\)/);
  assert.match(paymentService, /readAt: null/);
  assert.match(paymentService, /createdAt: FieldValue\.serverTimestamp\(\)/);
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
  assert.match(clientPaymentProviderRegistry, /manualClientPaymentAdapter/);
  assert.match(manualClientAdapter, /manual_payment/);
});

test('manual payment receipts are private, bounded, and reviewed only by the Store team', () => {
  assert.match(manualPaymentService, /2 \* 1024 \* 1024/);
  assert.match(manualPaymentService, /checkoutAccessToken/);
  assert.match(manualPaymentService, /Only the Store Owner or Manager/);
  assert.match(manualPaymentService, /PAYMENT_STATUS\.pendingVerification/);
  assert.match(manualPaymentService, /FieldValue\.serverTimestamp\(\)/);
  assert.match(storageRules, /match \/store-payment-receipts\/\{workspaceId\}/);
  assert.match(storageRules, /allow read: if canManageWorkspace\(workspaceId\)/);
  assert.match(storageRules, /allow create, update, delete: if false/);
});
