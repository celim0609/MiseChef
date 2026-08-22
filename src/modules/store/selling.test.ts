import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BULK_ORDER_MESSAGE,
  createCustomerOrderNumber,
  getBusinessWhatsAppUrl,
  getOrderPickupCode,
  getStoreChatWhatsAppUrl,
  isValidBusinessWhatsApp
} from './selling';

test('Business WhatsApp accepts international numbers without exposing other Store contacts', () => {
  assert.equal(isValidBusinessWhatsApp('+60 12-3456789'), true);
  assert.equal(isValidBusinessWhatsApp('not-a-number'), false);
  assert.equal(
    getBusinessWhatsAppUrl('+60 12-3456789'),
    `https://wa.me/60123456789?text=${encodeURIComponent(BULK_ORDER_MESSAGE)}`
  );
});

test('Store chat uses wa.me and automatically includes an existing order number', () => {
  const url = getStoreChatWhatsAppUrl({
    whatsapp: '+60 12-3456789',
    storeName: 'Ce Lim Kitchen',
    orderNumber: 'MC-0803-A7K2'
  });
  assert.equal(
    url,
    `https://wa.me/60123456789?text=${encodeURIComponent('Hi! I need help with my Ce Lim Kitchen order MC-0803-A7K2.')}`
  );
  assert.equal(getStoreChatWhatsAppUrl({ whatsapp: ' ', storeName: 'Ce Lim Kitchen' }), '');
});

test('bulk order enquiries contain only the approved blank enquiry template', () => {
  assert.equal(BULK_ORDER_MESSAGE, `Hi!

I'm interested in placing a bulk order.

Company:

Preferred Date:

Estimated Quantity:

Contact Name:

Thank you.`);
});

test('customer order preview uses Malaysia MMDD and a four-character readable suffix', () => {
  const orderNumber = createCustomerOrderNumber(
    new Date('2026-08-21T16:30:00.000Z'),
    () => 0
  );
  assert.equal(orderNumber, 'MC-0822-AAAA');
  assert.match(orderNumber, /^MC-\d{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(getOrderPickupCode(orderNumber), 'AAAA');
});

test('historical order numbers display unchanged and do not gain a misleading pickup code', () => {
  assert.equal(getOrderPickupCode('MC-260816-EHXQQX'), '');
  assert.equal(getOrderPickupCode('MC-0822-A7K2', 'A7K2'), 'A7K2');
});
