import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('a recognized Curlec Payment Link return opens the checkout confirmation context', () => {
  assert.match(page, /const isCurlecPaymentLinkReturn = returnedProvider === 'curlec' && query\.has\('razorpay_payment_link_id'\)/);
  assert.match(page, /if \(isCurlecPaymentLinkReturn \|\| isWeeklyPosPaymentReturn\) \{[\s\S]*setIsCheckoutOpen\(true\)/);
  assert.match(page, /if \(\['paid', 'pending_verification'\]\.includes\(result\.paymentStatus\)\) \{[\s\S]*setPlacedOrder\(result\)/);
  assert.match(page, /placedOrder\.paymentStatus === 'paid' \? 'Payment Successful'/);
});

test('a pending Payment Link return visibly reconciles until the signed webhook result is paid', () => {
  assert.match(page, /Checking payment status…/);
  assert.match(page, /CURLEC_RETURN_POLL_INTERVAL_MS = 2_000/);
  assert.match(page, /CURLEC_RETURN_MAX_POLLS = 30/);
  assert.match(page, /await storePaymentService\.getResult\([\s\S]*returnedPaymentSessionId/);
  assert.match(page, /setPaymentReturnReconciliation\(null\)/);
});

test('reconciliation cannot restore a duplicate-payment CTA', () => {
  assert.match(page, /setPaymentSession\(null\);[\s\S]*setPaymentReturnReconciliation\(/);
  assert.match(page, /\{paymentReturnReconciliation && !placedOrder && \(/);
  assert.match(page, /Please do not pay again\./);
});

test('an incomplete or unrecognized return is ignored safely', () => {
  assert.match(page, /if \(!returnedProvider \|\| !returnedPaymentSessionId \|\| !returnedCheckoutAccessToken\) return/);
  assert.match(page, /query\.has\('razorpay_payment_link_id'\)\) return;/);
});


test('Weekly POS Stripe returns reuse polling and leaving checkout does not cancel the provider link', () => {
  assert.match(page, /const isWeeklyPosPaymentReturn = returnedProvider === 'stripe' && query.get\('weekly_pos_payment'\) === '1'/);
  assert.match(page, /if \(isWeeklyPosPaymentReturn && wasCancelled\) \{[\s\S]*abandoned: true[\s\S]*return;/);
  assert.match(page, /paymentReturnReconciliation\?\.weeklyPos \? null : paymentSession/);
  assert.ok(page.indexOf('if (isWeeklyPosPaymentReturn && wasCancelled)') < page.indexOf('const cancelReturnedPayment'));
});
