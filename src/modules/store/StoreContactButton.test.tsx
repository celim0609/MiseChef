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
      orderNumber="MC-0803-A7K2"
    />
  );

  assert.match(markup, />Chat with Store</);
  assert.match(markup, /https:\/\/wa\.me\/60123456789\?text=/);
  assert.match(markup, /MC-0803-A7K2/);
  assert.match(markup, /bg-green-700/);
});

test('Store Contact button renders nothing when WhatsApp is unavailable', () => {
  assert.equal(renderToStaticMarkup(<StoreContactButton whatsapp="" />), '');
});

test('generic Store chat is not reused in customer checkout or owner confirmation workflow', () => {
  const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
  const paymentPage = readFileSync(new URL('./StorePaymentCheckout.tsx', import.meta.url), 'utf8');
  const orderDetails = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(publicStorePage, /<StoreContactButton/);
  assert.doesNotMatch(paymentPage, /<StoreContactButton/);
  assert.doesNotMatch(orderDetails, /<StoreContactButton/);
  assert.match(orderDetails, /<WhatsAppCustomerButton/);
});
