import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getOrderPickupCode } from './selling';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const paymentCheckout = readFileSync(new URL('./StorePaymentCheckout.tsx', import.meta.url), 'utf8');
const posPage = readFileSync(new URL('./StorePosPage.tsx', import.meta.url), 'utf8');
const ownerOrders = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');
const orderService = readFileSync(new URL('./services/storeOrderService.ts', import.meta.url), 'utf8');

test('customer confirmation and payment confirmation show the public order number and pickup code', () => {
  assert.match(publicStorePage, />Order Number</);
  assert.match(publicStorePage, /placedOrder\.orderNumber/);
  assert.match(publicStorePage, />Pickup Code</);
  assert.match(publicStorePage, /placedOrder\.pickupCode/);
  assert.doesNotMatch(publicStorePage, /placedOrder\.id/);
  assert.match(paymentCheckout, /session\.orderNumber/);
  assert.match(paymentCheckout, /session\.pickupCode/);
});

test('POS cards keep the full order number and emphasize the pickup code', () => {
  assert.match(posPage, /pos-card-title[^}]+\}\`\}>\{order\.orderNumber\}/);
  assert.match(posPage, /Pickup Code/);
  assert.match(posPage, /order\.pickupCode/);
});

test('Order History and owner views display historical and new order numbers unchanged', () => {
  assert.equal(getOrderPickupCode('MC-260816-EHXQQX'), '');
  assert.equal(getOrderPickupCode('MC-0822-A7K2'), 'A7K2');
  assert.match(posPage, /visibleHistoryOrders\.map/);
  assert.match(posPage, /\{order\.orderNumber\}/);
  assert.match(ownerOrders, /\{order\.orderNumber\}/);
  assert.match(ownerOrders, /\{selectedOrder\.orderNumber\}/);
  assert.match(ownerOrders, /order\.pickupCode/);
});

test('order hydration reads the stored pickup code without replacing the Firestore document id', () => {
  assert.match(orderService, /id: snapshot\.id/);
  assert.match(orderService, /orderNumber: readString\(data\.orderNumber\)/);
  assert.doesNotMatch(orderService, /orderNumber: readString\(data\.orderNumber, snapshot\.id\)/);
  assert.match(orderService, /readString\(data\.pickupCode\)/);
});
