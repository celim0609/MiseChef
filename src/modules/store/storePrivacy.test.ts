import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const firestoreRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8'
);
const publicStorePage = readFileSync(
  new URL('./PublicStorePage.tsx', import.meta.url),
  'utf8'
);

test('guest orders are writable without login but readable only by the correct Store team', () => {
  const orderRulesStart = firestoreRules.indexOf('match /storeOrders/{orderId}');
  const orderRulesEnd = firestoreRules.indexOf('match /publicChefProfileOwnership', orderRulesStart);
  const orderRules = firestoreRules.slice(orderRulesStart, orderRulesEnd);

  assert.match(orderRules, /allow create: if isValidStoreOrder\(request\.resource\.data, orderId\)/);
  assert.match(orderRules, /allow read: if isWorkspaceOwnerOrManager\(resource\.data\.workspaceId\)/);
  assert.doesNotMatch(orderRules, /allow read: if true/);
  assert.match(firestoreRules, /function hasValidStorePayment\(data, store\)/);
  assert.match(firestoreRules, /data\.orderNumber\.matches/);
});

test('the public Store UI does not render private contact details or internal order ids', () => {
  assert.doesNotMatch(publicStorePage, /store\.contactInformation/);
  assert.doesNotMatch(publicStorePage, /placedOrder\.id/);
  assert.match(publicStorePage, /placedOrder\.orderNumber/);
  assert.match(publicStorePage, /placedOrder\.pickupDate/);
  assert.match(publicStorePage, /placedOrder\.pickupLocationName/);
  assert.match(publicStorePage, /placedOrder\.pickupSession/);
  assert.match(publicStorePage, /placedOrder\.paymentMethodName/);
  assert.match(publicStorePage, /getBusinessWhatsAppUrl\(store\.businessWhatsApp\)/);
  assert.match(publicStorePage, /selectedPickupLocation\.address/);
  assert.match(publicStorePage, /Need a Bulk Order\?/);
  assert.match(publicStorePage, /Explore MiseChef/);
});
