import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatsAppCustomerButton from './WhatsAppCustomerButton';
import type { StoreOrder } from './types';
import {
  buildWhatsAppOrderConfirmationMessage,
  canWhatsAppCustomer,
  getWhatsAppOrderConfirmation,
  normalizeCustomerWhatsAppDestination
} from './whatsappOrderConfirmation';

const createOrder = (
  paymentStatus: StoreOrder['payment']['status'],
  overrides: Partial<StoreOrder> = {}
) => ({
  id: 'internal-firestore-id',
  orderNumber: 'MC-0822-A7K2',
  pickupCode: 'A7K2',
  customerName: 'Aina',
  phone: '0123456789',
  pickupDate: '2026-08-22',
  pickupSession: '2:00 PM – 3:00 PM',
  pickupLocationName: 'Main Counter',
  fulfilmentStatus: 'Paid',
  payment: { status: paymentStatus, refundStatus: 'none' },
  ...overrides
}) as StoreOrder;

test('WhatsApp Customer is unavailable before approval and available after payment is paid', () => {
  const pending = createOrder('pending_verification');
  const paid = createOrder('paid');
  assert.equal(canWhatsAppCustomer(pending), false);
  assert.equal(renderToStaticMarkup(<WhatsAppCustomerButton order={pending} country="MY" storeName="MiseChef Test Store" />), '');
  assert.equal(canWhatsAppCustomer(paid), true);
  assert.match(
    renderToStaticMarkup(<WhatsAppCustomerButton order={paid} country="MY" storeName="MiseChef Test Store" />),
    /WhatsApp Customer/
  );
});

test('confirmation message inserts every actual order field', () => {
  const message = buildWhatsAppOrderConfirmationMessage({
    customerName: 'Aina',
    orderNumber: 'MC-0822-A7K2',
    pickupDate: '22 Aug 2026',
    pickupTime: '2:00 PM – 3:00 PM',
    pickupLocation: 'Main Counter',
    pickupCode: 'A7K2',
    storeName: 'MiseChef Test Store'
  });
  assert.match(message, /Hi Aina, your order has been confirmed\./);
  assert.match(message, /Order: \*MC-0822-A7K2\*/);
  assert.match(message, /Pickup: \*22 Aug 2026\*/);
  assert.match(message, /Time: \*2:00 PM – 3:00 PM\*/);
  assert.match(message, /Location: \*Main Counter\*/);
  assert.match(message, /Pickup Code: \*A7K2\*/);
  assert.match(message, /\*MiseChef Test Store\*/);
});

test('old orders omit pickup code and blank fields without fake values', () => {
  const message = buildWhatsAppOrderConfirmationMessage({
    customerName: 'Aina',
    orderNumber: 'MC-260822-ER7ER9',
    pickupDate: '',
    pickupTime: '',
    pickupLocation: '',
    pickupCode: '',
    storeName: 'MiseChef Test Store'
  });
  assert.doesNotMatch(message, /Pickup Code:/);
  assert.doesNotMatch(message, /Location:/);
  assert.doesNotMatch(message, /undefined|null/);
  assert.match(message, /MC-260822-ER7ER9/);
});

test('Malaysian local, +60, and 60 phone formats normalize only for WhatsApp', () => {
  assert.deepEqual(normalizeCustomerWhatsAppDestination('0123456789', 'MY'), { ok: true, destination: '60123456789', error: '' });
  assert.deepEqual(normalizeCustomerWhatsAppDestination('+60123456789', 'MY'), { ok: true, destination: '60123456789', error: '' });
  assert.deepEqual(normalizeCustomerWhatsAppDestination('60123456789', 'MY'), { ok: true, destination: '60123456789', error: '' });
});

test('invalid or wrong-region phone numbers fail clearly', () => {
  assert.deepEqual(normalizeCustomerWhatsAppDestination('not-a-phone', 'MY'), {
    ok: false,
    destination: '',
    error: 'Customer phone number cannot be opened in WhatsApp.'
  });
  assert.equal(normalizeCustomerWhatsAppDestination('0123456789', 'SG').ok, false);
});

test('wa.me URL is encoded and building it does not mutate order or delivery state', () => {
  const order = createOrder('paid');
  const before = structuredClone(order);
  const confirmation = getWhatsAppOrderConfirmation({
    phone: order.phone,
    country: 'MY',
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    pickupCode: order.pickupCode,
    storeName: 'MiseChef Test Store'
  });
  assert.equal(confirmation.ok, true);
  assert.match(confirmation.url, /^https:\/\/wa\.me\/60123456789\?text=/);
  assert.equal(decodeURIComponent(confirmation.url.split('?text=')[1]), confirmation.message);
  assert.deepEqual(order, before);
  assert.equal('sent' in confirmation, false);
  assert.equal('delivered' in confirmation, false);
});

test('staff action performs no order/payment writes and customer Store keeps only Bulk Order WhatsApp', () => {
  const buttonSource = readFileSync(new URL('./WhatsAppCustomerButton.tsx', import.meta.url), 'utf8');
  const publicStoreSource = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  const posSource = readFileSync(new URL('./StorePosPage.tsx', import.meta.url), 'utf8');
  const ownerSource = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(buttonSource, /updateFulfilment|reviewManualPayment|updateDoc|httpsCallable|onClick/);
  assert.doesNotMatch(buttonSource, /WhatsApp Sent|delivered/);
  assert.doesNotMatch(publicStoreSource, /<StoreContactButton/);
  assert.match(publicStoreSource, /Need a Bulk Order\?/);
  assert.match(publicStoreSource, /> WhatsApp Us</);
  assert.match(posSource, /<WhatsAppCustomerButton/);
  assert.match(ownerSource, /<WhatsAppCustomerButton/);
});
