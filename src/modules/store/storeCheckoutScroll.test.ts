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

test('delivery quote is refreshed only when payment begins and never by an idle expiry timer', () => {
  assert.match(publicStorePage, /Refresh your delivery quote before checkout\./);
  assert.match(publicStorePage, /const checkoutAttemptIdRef = useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(publicStorePage, /checkoutAttemptId: checkoutAttemptIdRef\.current/);
  assert.match(publicStorePage, /disabled=\{isPlacingOrder \|\| !deliveryQuoteReady\}/);
  assert.match(publicStorePage, /deliveryQuoteHasSufficientLifetime/);
  assert.match(publicStorePage, /if \(!deliveryQuoteHasSufficientLifetime\) \{\s*const refreshed = await refreshDeliveryQuoteForPayment\(\)/);
  assert.match(publicStorePage, /const refreshDeliveryQuoteForPayment/);
  assert.match(publicStorePage, /customerDeliveryFeeChanged/);
  assert.match(publicStorePage, /Confirm updated total/);
  assert.doesNotMatch(publicStorePage, /scheduleDeliveryQuoteRefresh|deliveryQuoteRefreshAttemptsRef|checkoutTransitionRef/);
});

test('a re-quote keeps a stable fee eligible for one payment retry and requires confirmation only for a changed fee', () => {
  assert.match(publicStorePage, /let refreshedForPayment = false/);
  assert.match(publicStorePage, /if \(fulfilmentMethod !== 'delivery' \|\| refreshedForPayment \|\| !message\.includes\('Refresh your delivery quote before checkout\.'\)\) throw error/);
  assert.match(publicStorePage, /setDeliveryPriceConfirmation\(\{ previousFee: previousQuote\.quote\.customerDeliveryFee, currentFee: refreshedQuote\.quote\.customerDeliveryFee \}\)/);
  assert.match(publicStorePage, /if \(previousQuote\) setDeliveryQuote\(previousQuote\)/);
});

test('checkout pricing summary uses the validated delivery quote rather than a second delivery calculation', () => {
  assert.match(publicStorePage, /const checkoutMerchandiseSubtotal = hasDisplayableDeliveryQuote/);
  assert.match(publicStorePage, /deliveryQuote!\.merchandiseSubtotal/);
  assert.match(publicStorePage, /const checkoutTotal = checkoutMerchandiseSubtotal \+ customerDeliveryFee/);
  assert.match(publicStorePage, /Order Summary/);
  assert.match(publicStorePage, /\{line\.quantity\} × \{set\?\.name \|\| product\?\.name\}/);
  assert.match(publicStorePage, /Items subtotal/);
  assert.match(publicStorePage, /Delivery Fee/);
  assert.match(publicStorePage, /getPaymentActionLabel\(paymentMethodId\).*checkoutTotal/);
});
