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

test('guest orders can only be created by trusted payment Functions and read by the correct Store team', () => {
  const orderRulesStart = firestoreRules.indexOf('match /storeOrders/{orderId}');
  const orderRulesEnd = firestoreRules.indexOf('match /publicChefProfileOwnership', orderRulesStart);
  const orderRules = firestoreRules.slice(orderRulesStart, orderRulesEnd);

  assert.match(orderRules, /allow create: if false/);
  assert.match(orderRules, /allow read: if isWorkspaceOwnerOrManager\(resource\.data\.workspaceId\)/);
  assert.doesNotMatch(orderRules, /allow read: if true/);
  assert.match(firestoreRules, /match \/storePaymentEvents\/\{eventId\}/);
});

test('option-group writes validate production selection fields and remain owner-manager scoped', () => {
  const rulesStart = firestoreRules.indexOf('match /storeOptionGroups/{groupId}');
  const rulesEnd = firestoreRules.indexOf('match /storeOrders/{orderId}', rulesStart);
  const optionRules = firestoreRules.slice(rulesStart, rulesEnd);

  assert.match(optionRules, /isWorkspaceOwnerOrManager\(request\.resource\.data\.workspaceId\)/);
  assert.match(optionRules, /isWorkspaceOwnerOrManager\(resource\.data\.workspaceId\)/);
  assert.match(optionRules, /isValidStoreOptionGroup\(request\.resource\.data, groupId\)/);
  assert.match(optionRules, /'selectionType'/);
  assert.match(optionRules, /'minimumSelections'/);
  assert.match(optionRules, /'maximumSelections'/);
  assert.match(optionRules, /'sortOrder'/);
  assert.match(optionRules, /'available'/);
  assert.doesNotMatch(optionRules, /allow (create|update|delete): if true/);
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
  assert.match(publicStorePage, /Continue to Payment/);
  assert.doesNotMatch(publicStorePage, /setDoc\(orderRef/);
});
