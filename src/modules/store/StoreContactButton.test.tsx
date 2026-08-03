import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import StoreContactButton from './StoreContactButton';

test('Store Contact button renders the shared customer label and order-aware wa.me URL', () => {
  const markup = renderToStaticMarkup(
    <StoreContactButton
      whatsapp="+60 12-3456789"
      storeName="Ce Lim Kitchen"
      orderNumber="MC-260803-ABC234"
    />
  );

  assert.match(markup, />Chat with Store</);
  assert.match(markup, /https:\/\/wa\.me\/60123456789\?text=/);
  assert.match(markup, /MC-260803-ABC234/);
  assert.match(markup, /bg-green-700/);
});

test('Store Contact button renders nothing when WhatsApp is unavailable', () => {
  assert.equal(renderToStaticMarkup(<StoreContactButton whatsapp="" />), '');
});

test('the shared button is reused across every requested Store surface', () => {
  const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  const paymentPage = readFileSync(new URL('./StorePaymentCheckout.tsx', import.meta.url), 'utf8');
  const orderDetails = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');

  assert.equal((publicStorePage.match(/<StoreContactButton/g) || []).length, 4);
  assert.match(paymentPage, /<StoreContactButton/);
  assert.match(paymentPage, /orderNumber=\{session\.orderNumber\}/);
  assert.match(orderDetails, /<StoreContactButton/);
  assert.match(orderDetails, /orderNumber=\{selectedOrder\.orderNumber\}/);
});
