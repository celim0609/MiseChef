import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatsAppCustomerActions from './WhatsAppCustomerActions';
import { customerActionMessage, customerActionUrl, plainText } from './customerCommunicationModel';
import type { StoreOrder } from './types';
const order = (extra: Partial<StoreOrder> = {}) => ({
  id: 'order', customerName: 'Aina &amp; Ali', phone: '0123456789', orderNumber: 'MC-1', storeName: 'Shop',
  pickupDate: '2026-10-29', pickupTime: '12:30', pickupLocationAddress: 'Counter A', fulfilmentStatus: 'Preparing',
  items: [{ productName: 'Rice', quantity: 2 }, { productName: 'Soup', quantity: 1 }],
  payment: { status: 'pending' }, ...extra
} as StoreOrder);
const message = (o: StoreOrder, action: 'confirm' | 'reminder' | 'delivery', date = '2026-10-29') => customerActionMessage(o, action, date, '2026-10-29', 'Shop');
const fulfilments = [
  { id: 'a', date: '2026-10-29', time: '12:30', method: 'delivery', allocations: [{ itemIndex: 0, quantity: 1 }] },
  { id: 'b', date: '2026-10-30', time: '18:00', method: 'pickup', pickupLocationAddress: 'Counter B', allocations: [{ itemIndex: 1, quantity: 1 }] }
] as StoreOrder['fulfilments'];
test('confirmation includes every date, allocated quantity and items without claiming unpaid payment', () => {
  const text = message(order({ fulfilments }), 'confirm');
  for (const value of ['2026-10-29', '2026-10-30', '1 x Rice', '1 x Soup', '12:30', '18:00', 'Counter B']) assert.ok(text.includes(value));
  assert.doesNotMatch(text, /Payment confirmed|[*_`]|&amp;|�/);
  assert.match(text, /Hi Aina & Ali,/);
  assert.match(message(order({ payment: { status: 'paid' } as StoreOrder['payment'] }), 'confirm'), /Payment confirmed: Paid/);
});
test('reminder uses only the selected date and quantities, and has no entire-week fallback', () => {
  const text = message(order({ fulfilments }), 'reminder');
  assert.match(text, /1 x Rice/); assert.doesNotMatch(text, /Soup|2026-10-30/);
  assert.equal(message(order({ fulfilments }), 'reminder', '2026-11-01'), '');
});
test('weekly-only schedules independently select meals and dates', () => {
  const weeklyFulfilments = [
    { day: 'thu', date: '2026-10-29', productName: 'Thursday meal', quantity: 3, pickupTime: '13:00', pickupLocationAddress: 'A' },
    { day: 'fri', date: '2026-10-30', productName: 'Friday meal', quantity: 2, pickupTime: '14:00', pickupLocationAddress: 'B' }
  ] as StoreOrder['weeklyFulfilments'];
  assert.match(message(order({ weeklyFulfilments }), 'confirm'), /Friday meal/);
  const text = message(order({ weeklyFulfilments }), 'reminder');
  assert.match(text, /3 x Thursday meal/); assert.doesNotMatch(text, /Friday meal|Rice/);
});
test('weekly components use allocated meal names instead of plan names', () => {
  const o = order({ items: [{ productName: 'Weekly Plan', weeklyPlanSnapshot: { meals: [{ day: 'thu', productName: 'Thursday curry' }] } }] as StoreOrder['items'], fulfilments: [{ ...fulfilments![0], allocations: [{ itemIndex: 0, quantity: 4, componentDay: 'thu' }] }] });
  assert.match(message(o, 'reminder'), /4 x Thursday curry/); assert.doesNotMatch(message(o, 'reminder'), /Weekly Plan/);
});
test('delivery always selects today and uses date-specific actual status and link', () => {
  const o = order({ fulfilments, delivery: { recipient: { address: 'Home' }, providerOrder: { shareLink: 'https://wrong.example/parent' }, lifecycle: { state: 'completed' } } as StoreOrder['delivery'], fulfilmentOperations: { a: { lifecycle: { state: 'picked_up' }, providerOrder: { shareLink: 'https://www.lalamove.com/track/a' } } } });
  const text = message(o, 'delivery', '2026-10-30');
  assert.match(text, /picked up/); assert.match(text, /https:\/\/www.lalamove.com\/track\/a/);
  assert.doesNotMatch(text, /Soup|completed|wrong.example|2026-10-30/);
  assert.doesNotMatch(message(order({ fulfilments }), 'delivery'), /Lalamove tracking/);
});
test('single delivery uses provider status without inventing delivery completion', () => {
  const text = message(order({ fulfilmentMethod: 'delivery', delivery: { fulfilmentMethod: 'delivery', schedule: { date: '2026-10-29', time: '17:00' }, recipient: { address: 'Home' }, lifecycle: { state: 'assigning_driver' }, providerOrder: { shareLink: 'javascript:alert(1)' } } }), 'delivery');
  assert.match(text, /assigning driver/); assert.match(text, /Home/); assert.doesNotMatch(text, /Lalamove tracking/);
});
test('WhatsApp Web link round-trips plain line breaks and international phone', () => {
  const o = order(); const text = message(o, 'confirm'); const url = new URL(customerActionUrl(o, 'MY', text));
  assert.equal(url.origin, 'https://web.whatsapp.com'); assert.equal(url.searchParams.get('phone'), '60123456789');
  assert.equal(url.searchParams.get('text'), text); assert.ok(text.includes('\n'));
  assert.equal(customerActionUrl(order({ phone: 'invalid' }), 'MY', text), '');
  assert.equal(plainText('<b>Hello</b> &#38; *World* �'), 'Hello & World');
});
test('order details show exactly three WhatsApp actions and no sent claim on initial render', () => {
  const html = renderToStaticMarkup(<WhatsAppCustomerActions order={order()} country="MY" storeName="Shop" canRecordReminder />);
  for (const label of ['Confirm Order', 'Order Reminder', 'Delivery Update', 'Not recorded']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Sent \(confirmed by owner\)/);
});
