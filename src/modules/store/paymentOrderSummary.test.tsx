import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import PaymentOrderSummary from './PaymentOrderSummary';
import type { StorePaymentOrderSummary } from './types';

test('intermediate payment screen renders the immutable delivery order breakdown', () => {
  const summary: StorePaymentOrderSummary = {
    fulfilmentMethod: 'delivery',
    items: [{ productName: 'Testing', quantity: 1, lineTotal: 0.1, selectedOptions: [{ groupName: 'Size', optionName: 'Regular', priceAdjustment: 0 }], setSnapshot: { setName: 'Testing Set', selectedGroups: [{ groupName: 'Drink', productName: 'Tea', priceAdjustment: 0.5 }] } }],
    totals: { merchandiseSubtotal: 0.1, discountTotal: 0.2, discountedMerchandiseTotal: 0.1, deliveryFee: 4, grandTotal: 4.1, currency: 'MYR' }
  };
  const html = renderToStaticMarkup(<PaymentOrderSummary summary={summary} />);
  for (const text of ['1 × Testing', 'Drink: Tea (+MYR 0.50)', 'Size: Regular', 'Items subtotal', 'MYR 0.10', 'Discount', '−MYR 0.20', 'Delivery fee', 'MYR 4.00', 'Total', 'MYR 4.10']) assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('pickup order summary omits the delivery fee row', () => {
  const html = renderToStaticMarkup(<PaymentOrderSummary summary={{ fulfilmentMethod: 'pickup', items: [{ productName: 'Testing', quantity: 1, lineTotal: 0.1, selectedOptions: [] }], totals: { merchandiseSubtotal: 0.1, discountTotal: 0, discountedMerchandiseTotal: 0.1, deliveryFee: 0, grandTotal: 0.1, currency: 'MYR' } }} />);
  assert.doesNotMatch(html, /Delivery fee|Discount/);
});

test('Curlec payment CTA uses the immutable summary total and retains its legacy fallback', () => {
  const curlec = readFileSync(new URL('./paymentProviders/curlecClientAdapter.tsx', import.meta.url), 'utf8');
  assert.match(curlec, /session\.orderSummary\.totals\.grandTotal/);
  assert.match(curlec, /Continue to Payment · \$\{formatRegionCurrency/);
  assert.match(curlec, /: 'Continue to Payment'/);
});
