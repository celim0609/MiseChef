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
const storeOrderService = readFileSync(
  new URL('./services/storeOrderService.ts', import.meta.url),
  'utf8'
);
const storageRules = readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8');

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

test('product deletion is scoped to the same Owner-Manager authorization as create and edit', () => {
  const rulesStart = firestoreRules.indexOf('match /storeProducts/{productId}');
  const rulesEnd = firestoreRules.indexOf('match /storeOptionGroups/{groupId}', rulesStart);
  const productRules = firestoreRules.slice(rulesStart, rulesEnd);

  assert.match(productRules, /allow create: if isWorkspaceOwnerOrManager\(request\.resource\.data\.workspaceId\)/);
  assert.match(productRules, /allow update: if isWorkspaceOwnerOrManager\(resource\.data\.workspaceId\)/);
  assert.match(productRules, /allow delete: if isWorkspaceOwnerOrManager\(resource\.data\.workspaceId\)/);
  assert.doesNotMatch(productRules, /allow (create|update|delete): if true/);
});

test('Store Contact fields are schema-bounded and remain under existing Store team authorization', () => {
  const storeRulesStart = firestoreRules.indexOf('match /stores/{workspaceId}');
  const storeRulesEnd = firestoreRules.indexOf('match /storeProducts/{productId}', storeRulesStart);
  const storeRules = firestoreRules.slice(storeRulesStart, storeRulesEnd);

  assert.match(firestoreRules, /function isValidStoreContact\(contact\)/);
  assert.match(firestoreRules, /contact\.keys\(\)\.hasOnly/);
  assert.match(storeRules, /allow update: if isWorkspaceOwnerOrManager\(workspaceId\)/);
  assert.match(storeRules, /isValidStoreSettings\(request\.resource\.data, workspaceId\)/);
  assert.doesNotMatch(storeRules, /allow (create|update|delete): if true/);
});

test('order timelines and notifications are private server-created Store team data', () => {
  const rulesStart = firestoreRules.indexOf('match /storeOrderTimeline/{eventId}');
  const rulesEnd = firestoreRules.indexOf('match /publicChefProfileOwnership', rulesStart);
  const privateOrderRules = firestoreRules.slice(rulesStart, rulesEnd);

  assert.match(privateOrderRules, /allow read: if isWorkspaceOwnerOrManager\(resource\.data\.workspaceId\)/);
  assert.match(privateOrderRules, /allow create, update, delete: if false/);
  assert.match(privateOrderRules, /affectedKeys\(\)\.hasOnly\(\['readAt'\]\)/);
  assert.doesNotMatch(privateOrderRules, /allow read: if true/);
  assert.match(storeOrderService, /where\('workspaceId', '==', workspaceId\)/);
  assert.match(storeOrderService, /where\('orderId', '==', orderId\)/);
});

test('the public Store UI does not render private contact details or internal order ids', () => {
  assert.doesNotMatch(publicStorePage, /store\.contactInformation/);
  assert.doesNotMatch(publicStorePage, /placedOrder\.id/);
  assert.match(publicStorePage, /placedOrder\.orderNumber/);
  assert.match(publicStorePage, /placedOrder\.pickupDate/);
  assert.match(publicStorePage, /placedOrder\.pickupLocationName/);
  assert.match(publicStorePage, /placedOrder\.pickupSession/);
  assert.match(publicStorePage, /placedOrder\.paymentMethodName/);
  assert.match(publicStorePage, />Thank you</);
  assert.match(publicStorePage, /placedOrder\.paymentStatus/);
  assert.match(publicStorePage, />Pickup Time</);
  assert.match(publicStorePage, /store\.storeContact\.whatsapp/);
  assert.match(publicStorePage, /<StoreContactButton/);
  assert.match(publicStorePage, /orderNumber=\{placedOrder\.orderNumber\}/);
  assert.match(publicStorePage, /selectedPickupLocation\.address/);
  assert.match(publicStorePage, /Need a Bulk Order\?/);
  assert.match(publicStorePage, /Explore MiseChef/);
  assert.match(publicStorePage, /Customer Details/);
  assert.match(publicStorePage, /Payment Instructions/);
  assert.match(publicStorePage, /Place Order/);
  assert.doesNotMatch(publicStorePage, /Continue to Payment/);
  assert.doesNotMatch(publicStorePage, /setDoc\(orderRef/);
});

test('manual checkout is one customer-facing payment step', () => {
  assert.match(publicStorePage, /if \(session\.checkout\.type === 'manual_payment'\)/);
  assert.match(publicStorePage, /storePaymentService\.uploadReceipt\(slug, session, paymentReceipt\)/);
  assert.match(publicStorePage, /storePaymentService\.submitManual\(slug, session\)/);
  assert.match(publicStorePage, /setPaymentSession\(session\)/);
  assert.match(publicStorePage, /Continue to Secure Payment/);
});

test('checkout presents only enabled methods as polished cards in the requested hierarchy', () => {
  const sectionOrder = [
    'Order Summary',
    'Payment Method',
    'Customer Details',
    'Pickup Details',
    'Payment Instructions',
    'Receipt Upload'
  ].map(label => publicStorePage.indexOf(label));

  assert.ok(sectionOrder.every(index => index >= 0));
  assert.deepEqual([...sectionOrder].sort((a, b) => a - b), sectionOrder);
  assert.match(publicStorePage, /paymentMethods\.filter\(method => method\.enabled\)/);
  assert.match(publicStorePage, /<PaymentMethodIcon methodId=\{method\.id\}/);
  assert.match(publicStorePage, /getPaymentMethodDescription\(method\.id\)/);
  assert.match(publicStorePage, /getPaymentActionLabel\(paymentMethodId\)/);
  assert.match(publicStorePage, /return "I've Completed Payment"/);
  assert.match(publicStorePage, /sticky bottom-3/);
  assert.match(publicStorePage, /cartCount > 0 && !isCheckoutVisible/);
});

test('manual receipts remain private and customer order writes stay server-only', () => {
  const receiptStart = storageRules.indexOf('match /store-payment-receipts/');
  const receiptRules = storageRules.slice(receiptStart, storageRules.indexOf('match /users/', receiptStart));
  assert.match(receiptRules, /allow read: if canManageWorkspace\(workspaceId\)/);
  assert.match(receiptRules, /allow create, update, delete: if false/);
  assert.doesNotMatch(receiptRules, /allow read: if true/);
  assert.match(storeOrderService, /reviewStoreManualPayment/);
});
