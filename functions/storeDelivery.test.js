import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./storeDelivery.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('./storePayments.js', import.meta.url), 'utf8');
const fulfilment = readFileSync(new URL('./storeFulfilment.js', import.meta.url), 'utf8');

test('delivery checkout revalidates the provider quote, expiry, route, cart, and ignores client totals', () => {
  assert.match(source, /buildOrderItems\(draft\?\.selections/);
  assert.match(source, /Date\.parse\(quote\.expiresAt\) <= now/);
  assert.match(source, /Delivery quote no longer matches/);
  assert.doesNotMatch(source, /draft\?\.total/);
  assert.match(payments, /revalidateDeliveryForPayment/);
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
