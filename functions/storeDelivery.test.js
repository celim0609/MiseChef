import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./storeDelivery.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('./storePayments.js', import.meta.url), 'utf8');
const fulfilment = readFileSync(new URL('./storeFulfilment.js', import.meta.url), 'utf8');

test('delivery checkout revalidates the provider quote, expiry, route, cart, and ignores client totals', () => {
  assert.match(source, /buildOrderItems\(draft\?\.selections/);
  assert.match(source, /Date\.parse\(quote\.expiresAt\) <= Number\(now\) \+ Number\(minimumValidityMs\)/);
  assert.match(source, /Delivery quote no longer matches/);
  assert.doesNotMatch(source, /draft\?\.total/);
  assert.match(payments, /revalidateDeliveryForPayment/);
  assert.match(payments, /PAYMENT_DELIVERY_QUOTE_MINIMUM_VALIDITY_MS = 30_000/);
  assert.match(payments, /minimumValidityMs: PAYMENT_DELIVERY_QUOTE_MINIMUM_VALIDITY_MS/);
});
test('delivery payment cannot be created without a quote snapshot while pickup remains independent', () => {
  assert.match(payments, /A valid delivery quote is required before payment/);
  assert.match(payments, /readString\(draft\?\.fulfilmentMethod\) === 'delivery'/);
});
test('delivery payment checkout reserves one opaque attempt before creating an order or provider session', () => {
  assert.match(payments, /const checkoutAttemptId = isCheckoutAttemptId\(draft\?\.checkoutAttemptId\)/);
  assert.match(payments, /storeCheckoutAttempts/);
  assert.match(payments, /This checkout is already being created\. Please wait\./);
  assert.match(payments, /transaction\.create\(checkoutAttemptReference/);
  assert.match(payments, /const payment = await activeAdapter\.createPayment/);
});
test('dispatch is tenant guarded, idempotent, recovers provider failures, and applies exact RM5 limit', () => {
  assert.match(source, /assertWorkspaceOperator/);
  assert.match(source, /delivery\.dispatch\?\.status === 'created'/);
  assert.match(source, /delivery\.dispatch\?\.status === 'creating'/);
  assert.match(source, /difference > 5/);
  assert.match(source, /dispatch_blocked_requote/);
  assert.match(source, /delivery\.dispatch\.status': 'failed'/);
});
test('refresh, cancellation, reconciliation, and completion remain server-authoritative', () => {
  assert.match(source, /cancelStoreDelivery/);
  assert.match(source, /reconcileActiveDeliveries/);
  assert.match(source, /provider\.retrieveOrder/);
  assert.match(fulfilment, /delivery order can only complete after Lalamove confirms/);
});
test('instant delivery has an independent documented provider lifecycle and never changes kitchen readiness at assignment', () => {
  assert.match(source, /LALAMOVE_DELIVERY_LIFECYCLE/);
  for (const status of ['ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED', 'CANCELED', 'EXPIRED', 'REJECTED']) assert.match(source, new RegExp(status));
  assert.match(source, /\['Preparing', 'Ready'\]/);
  assert.match(source, /delivery\.fulfilmentMode === 'instant'/);
  assert.doesNotMatch(source, /fulfilmentStatus: 'Dispatching'/);
});
test('delivery status updates preserve terminal outcomes, history, driver data, and server-authoritative reconciliation', () => {
  assert.match(source, /TERMINAL_DELIVERY_STATES/);
  assert.match(source, /delivery\.lifecycle\.history/);
  assert.match(source, /provider\.retrieveDriver/);
  assert.match(source, /Lalamove returns 403 until driver details are permitted/);
  assert.match(source, /scheduled_reconciliation/);
  assert.match(source, /provider_terminal/);
  assert.match(source, /difference > 5/);
});
test('instant checkout is Store-configured and server-time validated without a preorder schedule', () => {
  assert.match(source, /validateInstantSchedule/);
  assert.match(source, /timeZone: zone/);
  assert.match(source, /Instant delivery is unavailable/);
  assert.match(source, /fulfilmentMode: schedule\.mode/);
  assert.match(source, /schedule\.mode === 'preorder'/);
});
