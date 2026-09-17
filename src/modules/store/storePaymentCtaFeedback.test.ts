import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('the first valid payment tap synchronously locks the CTA before provider creation', () => {
  assert.match(page, /const paymentStartRef = useRef\(false\)/);
  assert.match(page, /if \(!data \|\| isPlacingOrder \|\| paymentStartRef\.current\) return;/);
  assert.match(page, /paymentStartRef\.current = true;[\s\S]*setIsPlacingOrder\(true\);[\s\S]*storePaymentService\.createPayment/);
  assert.match(page, /finally \{\s*paymentStartRef\.current = false;\s*setIsPlacingOrder\(false\);/);
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
