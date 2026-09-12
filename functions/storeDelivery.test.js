import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { providerRoutingDestination, quoteMatchesDestination, sameDeliveryCoordinates } from './storeDelivery.js';

const source = readFileSync(new URL('./storeDelivery.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('./storePayments.js', import.meta.url), 'utf8');
const fulfilment = readFileSync(new URL('./storeFulfilment.js', import.meta.url), 'utf8');

test('delivery checkout revalidates the provider quote, expiry, route, cart, and ignores client totals', () => {
  assert.match(source, /buildOrderItems\(draft\?\.selections/);
  assert.match(source, /Date\.parse\(quote\.expiresAt\) <= Number\(now\) \+ Number\(minimumValidityMs\)/);
  assert.match(source, /Delivery quote no longer matches/);
  assert.doesNotMatch(source, /draft\?\.total/);
  assert.match(payments, /revalidateDeliveryForPayment/);
  assert.match(source, /DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS = 5_000/);
  assert.match(payments, /minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS/);
  assert.match(source, /minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS/);
  assert.match(source, /quoteMatchesDestination\(\{ quote, destination \}\)/);
  assert.match(source, /typeof value === 'number'/);
  assert.match(source, /config\.environment\) !== readString\(provider\?\.environment\)/);
  assert.match(source, /environment: provider\.environment/);
});
test('delivery operational calls cannot cross the persisted provider environment boundary', () => {
  assert.match(source, /assertDeliveryEnvironment/);
  assert.match(source, /Delivery environment does not match this Firebase project/);
  assert.match(source, /Legacy Sandbox orders pre-date the environment snapshot/);
  assert.match(source, /assertDeliveryEnvironment\(\{ delivery, provider \}\)/);
  assert.match(source, /assertDeliveryEnvironment\(\{ delivery: order\.delivery \|\| \{\}, provider \}\)/);
});
test('provider numeric coordinates and equivalent customer strings do not create a false destination mismatch', () => {
  assert.match(source, /String\(Number\(raw\)\)/);
  assert.match(source, /sameDeliveryCoordinates/);
  assert.equal(sameDeliveryCoordinates(4.6569255, '4.65692550'), true);
  assert.equal(sameDeliveryCoordinates(101.1172608, '101.1172608'), true);
  assert.equal(sameDeliveryCoordinates(4.6569255, '4.6569256'), false);
});
test('a quote returns Lalamove canonical routing coordinates while retaining the Google Places address', () => {
  const googleDestination = {
    address: 'Google Places formatted address', latitude: '4.6569255', longitude: '101.1172608', instructions: 'Unit / Floor: 3'
  };
  const providerQuote = {
    stops: [
      { coordinates: { lat: '4.641333', lng: '101.1420132' } },
      { coordinates: { lat: 4.65693, lng: 101.11726 } }
    ]
  };
  const routingDestination = providerRoutingDestination({ quote: providerQuote, destination: googleDestination });
  assert.deepEqual(routingDestination, {
    ...googleDestination, latitude: '4.65693', longitude: '101.11726'
  });
  assert.equal(quoteMatchesDestination({ quote: providerQuote, destination: routingDestination }), true);
});
test('a genuine destination change still fails provider route validation', () => {
  const providerQuote = { stops: [
    { coordinates: { lat: '4.641333', lng: '101.1420132' } },
    { coordinates: { lat: '4.65693', lng: '101.11726' } }
  ] };
  assert.equal(quoteMatchesDestination({ quote: providerQuote, destination: {
    address: 'Different selected place', latitude: '4.65694', longitude: '101.11726', instructions: ''
  } }), false);
});
test('a quotation without a canonical provider drop-off is rejected before payment can use it', () => {
  assert.throws(() => providerRoutingDestination({ quote: { stops: [] }, destination: {
    address: 'Google Places formatted address', latitude: '4.6569255', longitude: '101.1172608', instructions: ''
  } }), /invalid quotation/);
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
  assert.ok(payments.indexOf('deliverySnapshot: await revalidateDeliveryForPayment') < payments.indexOf('const checkoutAttemptReference'));
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
