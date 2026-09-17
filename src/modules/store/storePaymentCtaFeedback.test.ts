import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('the first valid payment tap synchronously locks the CTA before provider creation', () => {
  assert.match(page, /const paymentStartRef = useRef\(false\)/);
  assert.match(page, /if \(!data \|\| isPlacingOrder \|\| paymentStartRef\.current\) return;/);
  assert.match(page, /paymentStartRef\.current = true;[\s\S]*setIsPlacingOrder\(true\);[\s\S]*storePaymentService\.createPayment/);
  assert.match(page, /if \(!navigatingToProvider\) \{\s*paymentStartRef\.current = false;\s*setIsPlacingOrder\(false\);/);
});

test('a successful Payment Link navigation keeps the processing CTA locked until leaving MiseChef', () => {
  assert.match(page, /let navigatingToProvider = false;/);
  assert.match(page, /window\.location\.assign\(session\.checkout\.redirectUrl\);[\s\S]*navigatingToProvider = true;/);
  assert.match(page, /only a thrown navigation[\s\S]*should restore the retry state/);
});

test('a Safari back/forward-cache restore clears only the stale outbound payment lock', () => {
  assert.match(page, /window\.addEventListener\('pageshow', restorePaymentCtaAfterProviderBack\)/);
  assert.match(page, /if \(!event\.persisted \|\| paymentReturnReconciliation\) return;/);
  assert.match(page, /paymentStartRef\.current = false;\s*setIsPlacingOrder\(false\);/);
});

test('an active payment return reconciliation remains locked after lifecycle restoration', () => {
  assert.match(page, /if \(!event\.persisted \|\| paymentReturnReconciliation\) return;/);
  assert.match(page, /paymentReturnReconciliation && !placedOrder/);
  assert.match(page, /Checking payment status…/);
});

test('the checkout CTA immediately shows a spinner and processing state while disabled', () => {
  assert.match(page, /disabled=\{isPlacingOrder \|\| !deliveryQuoteReady\}/);
  assert.match(page, /<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" \/> Processing payment…/);
});

test('a returning pending Payment Link uses the status-checking copy without a payment CTA', () => {
  assert.match(page, /Checking payment status…/);
  assert.match(page, /\{paymentReturnReconciliation && !placedOrder && \(/);
  assert.match(page, /setPaymentSession\(null\);[\s\S]*setPaymentReturnReconciliation\(/);
});
