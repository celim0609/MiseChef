import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getValidatedPublicAccountReturnTo,
  replaceWithValidatedPublicAccountReturnTo
} from '../public/hostReturnNavigation';
import { resolvePublicRoute } from '../public/publicRoutes';

const accountMenu = readFileSync(new URL('../public/PublicAccountMenu.tsx', import.meta.url), 'utf8');
const ordersPage = readFileSync(new URL('../public/PublicOrdersPage.tsx', import.meta.url), 'utf8');
const publicLayout = readFileSync(new URL('../public/PublicLayout.tsx', import.meta.url), 'utf8');
const customerService = readFileSync(new URL('./services/customerOrderService.ts', import.meta.url), 'utf8');
const functionsIndex = readFileSync(new URL('../../../functions/index.js', import.meta.url), 'utf8');
const customerBackend = readFileSync(new URL('../../../functions/customerOrders.js', import.meta.url), 'utf8');
const indexes = JSON.parse(readFileSync(new URL('../../../firestore.indexes.json', import.meta.url), 'utf8'));
const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');

test('My Orders is an exact public account route and login return target', () => {
  assert.deepEqual(resolvePublicRoute('/orders'), { page: 'orders' });
  assert.deepEqual(resolvePublicRoute('/orders/'), { page: 'orders' });
  assert.equal(resolvePublicRoute('/orders/another-order'), null);
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2Forders'), '/orders');

  let destination = '';
  assert.equal(replaceWithValidatedPublicAccountReturnTo('?returnTo=%2Forders', value => { destination = value; }), true);
  assert.equal(destination, '/orders');
  for (const search of [
    '?returnTo=%2Forders%2Fother',
    '?returnTo=%2Forders%3Fuid%3Dother',
    '?returnTo=https%3A%2F%2Fevil.example%2Forders',
    '?returnTo=%2F%2Fevil.example%2Forders'
  ]) assert.equal(getValidatedPublicAccountReturnTo(search), '');
});

test('authenticated Account navigation exposes My Orders and PublicLayout renders the customer page', () => {
  assert.match(accountMenu, /href="\/orders"[\s\S]*My Orders/);
  assert.match(publicLayout, /route\.page === 'orders'[\s\S]*<PublicOrdersPage currentUser=\{currentUser\}/);
  assert.match(ordersPage, /\/login\?returnTo=\$\{encodeURIComponent\('\/orders'\)\}/);
  assert.match(ordersPage, /customerOrderService\.listMine\(\)/);
  assert.doesNotMatch(ordersPage, /checkoutAccessToken|storeOrderService|POS|point.?of.?sale/i);
});

test('customer order service uses only the authenticated owner-scoped callable', () => {
  assert.match(customerService, /httpsCallable<undefined, \{ orders: CustomerStoreOrderSummary\[\] \}>\([\s\S]*'listMyMiseChefStoreOrders'/);
  assert.match(functionsIndex, /listMyMiseChefStoreOrders = onCall/);
  assert.match(functionsIndex, /listCustomerOrders\(\{[\s\S]*?db,[\s\S]*?uid: request\.auth\?\.uid[\s\S]*?\}\)/);
  assert.match(customerBackend, /where\('customerUid', '==', customerUid\)/);
  assert.match(customerBackend, /throw new HttpsError\('unauthenticated'/);
  assert.doesNotMatch(customerBackend, /email|phone|checkoutAccessToken|hostId\s*===\s*uid/i);
});

test('My Orders renders each owned order item snapshot without mixing cards', () => {
  assert.match(ordersPage, /orders\.map\(order =>/);
  assert.match(ordersPage, /<article key=\{order\.orderNumber\}/);
  assert.match(ordersPage, /order\.items\.map\(\(item, itemIndex\)/);
  assert.match(ordersPage, /\{item\.quantity\} × \{item\.productName\}/);
  assert.match(ordersPage, /item\.setSelections\.map/);
  assert.match(ordersPage, /selection\.groupName/);
  assert.match(ordersPage, /selection\.productName/);
  assert.match(ordersPage, /item\.selectedOptions\.map/);
  assert.match(ordersPage, /option\.groupName/);
  assert.match(ordersPage, /option\.optionName/);
  assert.match(ordersPage, /Remark:/);
  assert.match(ordersPage, /Item details are unavailable for this order/);
  assert.match(ordersPage, /Ordering with \{order\.groupName\}/);
  assert.match(customerBackend, /items: \(Array\.isArray\(data\.items\)/);
  assert.match(customerBackend, /remarks: readString\(data\.notes\)/);
  assert.doesNotMatch(customerBackend, /productId:|setId:|optionId:|lineTotal:|receiptPath:/);
});

test('customer query has its exact index while direct Store order reads remain role-gated', () => {
  assert.ok(indexes.indexes.some((index: { collectionGroup?: string; fields?: Array<{ fieldPath?: string; order?: string }> }) =>
    index.collectionGroup === 'storeOrders'
    && index.fields?.[0]?.fieldPath === 'customerUid'
    && index.fields?.[0]?.order === 'ASCENDING'
    && index.fields?.[1]?.fieldPath === 'createdAt'
    && index.fields?.[1]?.order === 'DESCENDING'));
  assert.match(rules, /match \/storeOrders\/\{orderId\}[\s\S]*allow read: if canViewStoreOrders\(resource\.data\.workspaceId\)/);
  assert.doesNotMatch(rules, /resource\.data\.customerUid\s*==\s*request\.auth\.uid/);
});
