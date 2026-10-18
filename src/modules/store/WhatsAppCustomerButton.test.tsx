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
  assert.match(message, /Hi Aina! Thank you for your order!/);
  assert.match(message, /Order: \*MC-0822-A7K2\*/);
  assert.match(message, /22 Aug 2026 · 2:00 PM – 3:00 PM/);
  assert.match(message, /Pickup Address\*\nMain Counter/);
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


test('delivery confirmation uses recipient address and delivery schedule, without pickup code', () => {
  const message = buildWhatsAppOrderConfirmationMessage({
    customerName: 'Py', orderNumber: 'MC-1018-5RPA', storeName: 'GG Grab&Go',
    fulfilmentMethod: 'delivery', fullAddress: '12 Jalan Example, Ipoh',
    pickupDate: '19 Oct 2026', pickupTime: '12:30 PM', pickupCode: '5RPA', paymentAmount: 60
  });
  assert.match(message, /Delivery Schedule/);
  assert.match(message, /19 Oct 2026 · 12:30 PM/);
  assert.match(message, /Delivery Address\*\n12 Jalan Example, Ipoh/);
  assert.match(message, /RM60.00 · Paid/);
  assert.doesNotMatch(message, /Pickup Code/);
});

test('multiple dates are listed in the selected schedule order', () => {
  const message = buildWhatsAppOrderConfirmationMessage({
    fulfilmentMethod: 'delivery', storeName: 'GG Grab&Go',
    schedule: [{date:'Mon 19 Oct',time:'12:30 PM'}, {date:'Tue 20 Oct',time:'1:00 PM'}]
  });
  assert.ok(message.indexOf('Mon 19 Oct') < message.indexOf('Tue 20 Oct'));
});
