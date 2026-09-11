import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('./services/deliveryService.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('instant delivery POS keeps kitchen and delivery controls independent', () => {
  assert.match(panel, /Preparing · Driver not requested/);
  assert.match(panel, /Finding driver…/);
  assert.match(panel, /Driver assigned/);
  assert.match(panel, /Picked up · On the way/);
  assert.match(panel, /No driver found \/ Expired/);
  assert.match(panel, /Find Driver/);
  assert.match(panel, /\['Preparing', 'Ready'\]/);
  assert.match(panel, /Merchant review required\. A replacement is never created automatically\./);
});

test('delivery quote expiry automatically re-quotes a retained address with a bounded retry', () => {
  assert.match(checkout, /deliveryQuoteRefreshAttemptsRef/);
  assert.match(checkout, /void requestDeliveryQuote\(\)/);
  assert.match(checkout, /deliveryQuoteRefreshAttemptsRef\.current >= 2/);
  assert.match(checkout, /setIsCalculatingDelivery\(true\)/);
  assert.match(checkout, /disabled=\{isPlacingOrder \|\| !deliveryQuoteReady\}/);
});

test('active delivery has a manual and bounded live server refresh path', () => {
  assert.match(panel, /Refresh delivery/);
  assert.match(panel, /20_000/);
  assert.match(service, /refreshStoreLalamoveDelivery/);
});
