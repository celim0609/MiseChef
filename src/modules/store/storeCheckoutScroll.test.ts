import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('new payment and confirmation stages scroll their actual sections into view', () => {
  assert.match(publicStorePage, /const paymentStageKey = paymentSession\?\.paymentSessionId \|\| ''/);
  assert.match(publicStorePage, /const confirmationKey = placedOrder \? `\$\{placedOrder\.orderNumber\}:\$\{placedOrder\.paymentStatus\}` : ''/);
  assert.match(publicStorePage, /paymentStageRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(publicStorePage, /confirmationRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(publicStorePage, /ref=\{paymentStageRef\} aria-labelledby="payment-stage-heading" className="mt-5 scroll-mt-24"/);
  assert.match(publicStorePage, /ref=\{confirmationRef\} aria-labelledby="order-confirmation-heading" className="mt-5 scroll-mt-24/);
  assert.match(publicStorePage, /id="order-confirmation-heading"[\s\S]*confirmationCopy\?\.heading/);
});

test('checkout scrolling is keyed only to intentional stage transitions', () => {
  assert.match(publicStorePage, /useEffect\(\(\) => \{\s*if \(!paymentStageKey\) return;[\s\S]*\}, \[paymentStageKey\]\)/);
  assert.match(publicStorePage, /useEffect\(\(\) => \{\s*if \(!confirmationKey\) return;[\s\S]*\}, \[confirmationKey\]\)/);
  assert.equal((publicStorePage.match(/scrollIntoView/g) || []).length, 3);
  assert.equal((publicStorePage.match(/window\.requestAnimationFrame/g) || []).length, 2);
  assert.equal((publicStorePage.match(/window\.cancelAnimationFrame/g) || []).length, 2);
});

test('delivery quote expiry cannot overwrite an accepted payment session and server quote refresh errors recover safely', () => {
  assert.match(publicStorePage, /const checkoutTransitionRef = useRef\(false\)/);
  assert.match(publicStorePage, /checkoutTransitionRef\.current = true/);
  assert.match(publicStorePage, /if \(checkoutTransitionRef\.current\) return;/);
  assert.match(publicStorePage, /Refresh your delivery quote before checkout\./);
  assert.match(publicStorePage, /setDeliveryQuote\(null\);\s*void requestDeliveryQuote\(\);/);
  assert.match(publicStorePage, /const checkoutAttemptIdRef = useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(publicStorePage, /checkoutAttemptId: checkoutAttemptIdRef\.current/);
  assert.match(publicStorePage, /disabled=\{isPlacingOrder \|\| !deliveryQuoteReady\}/);
  assert.match(publicStorePage, /deliveryQuoteHasSufficientLifetime/);
  assert.match(publicStorePage, /expiresAt - Date\.now\(\) - deliveryQuoteMinimumValidityMs/);
  assert.match(publicStorePage, /requestDeliveryQuote\(\{ refresh: true \}\)/);
  assert.match(publicStorePage, /Refreshing delivery fee…/);
  assert.match(publicStorePage, /deliveryQuoteId: deliveryQuote\.quote\.quotationId/);
});
