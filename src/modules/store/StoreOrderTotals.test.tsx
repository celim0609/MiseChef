import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import StoreOrderTotals from './StoreOrderTotals';
import WhatsAppMessagePreview from './WhatsAppMessagePreview';
import { customerActionMessage } from './customerCommunicationModel';
import type { StoreOrder } from './types';

const render = (fields: Partial<StoreOrder>) => renderToStaticMarkup(
  <StoreOrderTotals currency="MYR" country="MY" order={{
    fulfilmentMethod: 'delivery',
    fulfilments: [
      { date: '2026-11-12', method: 'delivery' },
      { date: '2026-11-13', method: 'delivery' }
    ],
    items: [{ lineTotal: 50 }],
    total: 52,
    ...fields
  } as StoreOrder} />
);

test('renders saved date charges, discount and final total independently', () => {
  const html = render({
    totals: { merchandiseSubtotal: 50, discountTotal: 5, discountedMerchandiseTotal: 45, deliveryFee: 7, grandTotal: 52, currency: 'MYR' },
    deliveryPricingSnapshot: { days: [
      { date: '2026-11-12', customerDeliveryFee: 0 },
      { date: '2026-11-13', customerDeliveryFee: 7 }
    ] }
  });
  assert.match(html, /Subtotal.*RM50\.00/);
  assert.match(html, /Delivery Fee · [^<]*12 Nov.*RM0\.00/);
  assert.match(html, /Delivery Fee · [^<]*13 Nov.*RM7\.00/);
  assert.match(html, /Total Delivery Fee.*RM7\.00/);
  assert.match(html, /Discounts.*−RM5\.00/);
  assert.match(html, /Final Total.*RM52\.00/);
});

test('does not infer missing charges from the final total or a provider quote', () => {
  const html = render({ delivery: { fulfilmentMethod: 'delivery', quote: { fee: 2 } } });
  assert.equal(html.match(/Not available/g)?.length, 2);
  assert.match(html, /Final Total.*RM52\.00/);
});

test('shows a zero delivery fee on legacy pickup orders', () => {
  const html = render({ fulfilmentMethod: 'pickup', fulfilments: undefined });
  assert.match(html, /Delivery Fee<\/dt><dd[^>]*>RM0\.00/);
  assert.doesNotMatch(html, /Discounts|Not available/);
});

test('does not extrapolate the first-day charge to other dates', () => {
  const html = render({ deliveryPricingSnapshot: { firstDayFee: 4, fulfilmentCount: 2, finalDeliveryTotal: 8 } });
  assert.doesNotMatch(html, /RM4\.00/);
  assert.match(html, /Daily delivery breakdown.*Not available/);
  assert.match(html, /Total Delivery Fee.*RM8\.00/);
});

test('shows a saved order-level override without allocating it across dates', () => {
  const html = render({ deliveryPricingSnapshot: { customerDeliveryFee: 8 } });
  assert.equal(html.match(/Not available/g)?.length, 1);
  assert.match(html, /Total Delivery Fee.*RM8\.00/);
});


test('Order Details and WhatsApp agree on the saved charge and final total', () => {
  const order = {
    currency: 'MYR', orderSource: 'online', payment: { status: 'paid' },
    fulfilmentMethod: 'delivery', pickupDate: '2026-11-12', pickupTime: '12:00',
    items: [{ productName: 'Rice', quantity: 1, lineTotal: 40 }],
    totals: { currency: 'MYR', merchandiseSubtotal: 40, discountTotal: 6, deliveryFee: 9, grandTotal: 43 },
    total: 43
  } as StoreOrder;
  const html = renderToStaticMarkup(<StoreOrderTotals order={order} country="MY" currency="MYR" />);
  const message = customerActionMessage(order, 'confirm', '', '', 'Shop');
  for (const [label, amount] of [['Subtotal', '40.00'], ['Delivery Fee', '9.00'],
    ['Discounts', '6.00'], ['Final Total', '43.00']]) {
    assert.ok(html.includes(label) && html.includes(`RM${amount}`));
    assert.ok(message.includes(`${label}: ${label === 'Discounts' ? '−' : ''}MYR ${amount}`));
  }
});


test('external POS snapshots display saved daily charges in Order Details and WhatsApp', () => {
  const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
  const order = {
    currency: 'MYR', orderSource: 'pos', payment: { status: 'paid' }, fulfilmentMethod: 'delivery',
    phone: '0123456789', storeName: 'GG Grab&Go',
    items: [{ productName: 'Lunch', quantity: 5, lineTotal: 60 }],
    fulfilments: dates.map(date => ({ date, time: '16:00', method: 'delivery',
      allocations: [{ itemIndex: 0, quantity: 1 }] })),
    totals: { currency: 'MYR', merchandiseSubtotal: 60, discountTotal: 0, deliveryFee: 63 },
    total: 123
  } as StoreOrder;
  for (const hasDays of [true, false]) {
    const input = { ...order, posDeliveryPricing: {
      customerDeliveryFee: 63,
      ...(hasDays ? { days: dates.map(date => ({ date, customerDeliveryFee: 12.6 })) } : {})
    } };
    const html = render(input);
    const text = customerActionMessage(input, 'confirm', '', '', 'Shop');
    assert.match(html, /Total Delivery Fee.*RM63\.00/);
    assert.match(html, /Final Total.*RM123\.00/);
    assert.match(text, /Total Delivery Fee: MYR 63\.00/);
    assert.match(text, /Final Total: MYR 123\.00/);
    assert.match(text, /\*MiseChef \| GG Grab&Go\*$/);
    const preview = renderToStaticMarkup(<WhatsAppMessagePreview order={input} country="MY"
      message={text} onChange={() => {}} onClose={() => {}} />);
    const href = preview.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    assert.ok(href);
    const link = new URL(href);
    assert.equal(link.searchParams.get('phone'), '60123456789');
    assert.equal(link.searchParams.get('text'), text);
    assert.equal(html.match(/RM12\.60/g)?.length ?? 0, hasDays ? 5 : 0);
    assert.equal(text.match(/MYR 12\.60/g)?.length ?? 0, hasDays ? 5 : 0);
    assert.equal(/Daily delivery breakdown.*Not available/.test(html), !hasDays);
    assert.equal(text.includes('Daily delivery breakdown: Not available'), !hasDays);
  }
});

test('a partial saved breakdown keeps known dates, including zero, and marks missing dates', () => {
  const html = render({
    posDeliveryPricing: { customerDeliveryFee: 7, days: [{ date: '2026-11-12', customerDeliveryFee: 0 }] }
  });
  assert.match(html, /Delivery Fee · [^<]*12 Nov.*RM0\.00/);
  assert.match(html, /Delivery Fee · [^<]*13 Nov.*Not available/);
  assert.match(html, /Total Delivery Fee.*RM7\.00/);
});
