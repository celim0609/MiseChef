import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFulfilmentSchedule, selectionAllowsDate, usesScheduledCheckout, commonPickupTimes, applySharedTime, checkoutDayGroups, scheduleDateLabel, deliveryFeeLabel } from './storeOrderFulfilments';
import type { StoreProduct } from './types';

test('same date meals share one fulfilment regardless of item count', () => {
  const entries = [{ date: '2026-10-12', time: '10:00', itemIndexes: [0] }, { date: '2026-10-16', time: '11:00', itemIndexes: [1] }, { date: '2026-10-12', time: '10:00', itemIndexes: [2] }];
  const result = groupFulfilmentSchedule(entries);
  assert.equal(result.length, 2); assert.deepEqual(result[0].itemIndexes, [0,2]);
  assert.deepEqual(entries[0].itemIndexes, [0]);
  assert.throws(() => groupFulfilmentSchedule([{ ...entries[0], time: '' }]), /date and time/);
  assert.throws(() => groupFulfilmentSchedule([entries[0], { ...entries[0], time: '11:00' }]), /same time/);
});
test('date controls hard-lock Monday and Friday while legacy products remain unrestricted', () => {
  const products = [{ id: 'm', availableDay: 'mon' }, { id: 'f', availableDay: 'fri' }, { id: 'all' }] as StoreProduct[];
  assert.equal(selectionAllowsDate({ productId: 'm', quantity: 1, selectedOptions: [] }, products, '2026-10-12'), true);
  assert.equal(selectionAllowsDate({ productId: 'm', quantity: 1, selectedOptions: [] }, products, '2026-10-16'), false);
  assert.equal(selectionAllowsDate({ productId: 'f', quantity: 1, selectedOptions: [] }, products, '2026-10-16'), true);
  assert.equal(selectionAllowsDate({ productId: 'all', quantity: 1, selectedOptions: [] }, products, '2026-10-14'), true);
});

test('weekly and selected-day carts apply one shared time without mutating allocations', () => {
  const entries = ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16'].map((date, index) => ({ date, time: '09:00', itemIndexes: [index] }));
  const result = groupFulfilmentSchedule(applySharedTime(entries, '13:30'));
  assert.equal(result.length, 5);
  assert.ok(result.every(entry => entry.time === '13:30'));
  assert.ok(entries.every(entry => entry.time === '09:00'));
  assert.deepEqual(result.map(entry => entry.itemIndexes), entries.map(entry => entry.itemIndexes));
  assert.deepEqual(commonPickupTimes(entries.map(entry => entry.date), date => date.endsWith('16') ? ['13:30'] : ['09:00','13:30']), ['13:30']);
  assert.deepEqual(commonPickupTimes(['2026-10-12','2026-10-16'], date => date.endsWith('16') ? [] : ['09:00']), []);
});

test('selected day groups merge meals but count dates rather than quantities', () => {
  const groups = checkoutDayGroups([
    { key: 'mon1', label: 'Monday meal', date: '2026-10-12', dates: ['2026-10-12'] },
    { key: 'fri', label: 'Friday meal', date: '2026-10-16', dates: ['2026-10-16'] },
    { key: 'mon2', label: 'Other meal', date: '2026-10-12', dates: ['2026-10-12','2026-10-16'] }
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].rows.map(row => row.label), ['Monday meal','Other meal']);
  assert.deepEqual(groups[0].dates, ['2026-10-12']);
  assert.deepEqual(groups[1].dates, ['2026-10-16']);
  assert.equal(scheduleDateLabel(groups[0].date), 'Mon 12 Oct');
  assert.equal(scheduleDateLabel(groups[1].date), 'Fri 16 Oct');
  assert.equal(deliveryFeeLabel(3), 'Delivery fee for 3 days');
  assert.equal(deliveryFeeLabel(5), 'Delivery fee for 5 days');
});

test('ordinary single-day a la carte bypasses scheduled/shared-time checkout and retains its actual quoted fee', async () => {
  assert.equal(usesScheduledCheckout(1, false, false, false), false);
  assert.equal(usesScheduledCheckout(1, false, false, true), false);
  assert.equal(usesScheduledCheckout(1, true, false, false), true);
  assert.equal(usesScheduledCheckout(2, false, false, false), true);
  assert.equal(usesScheduledCheckout(2, false, true, false), false);
  assert.equal(deliveryFeeLabel(1), 'Delivery fee');
  const { default: React } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: PaymentOrderSummary } = await import('./PaymentOrderSummary');
  const summary = { items: [{ productName: 'Lunch', quantity: 1, lineTotal: 10, selectedOptions: [] }], fulfilmentMethod: 'delivery', totals: { currency: 'MYR', merchandiseSubtotal: 10, discountTotal: 0, deliveryFee: 8.4, grandTotal: 18.4 } } as any;
  const single = renderToStaticMarkup(React.createElement(PaymentOrderSummary, { summary }));
  assert.match(single, /Delivery fee<\/dt>/);
  assert.match(single, /8.40/);
  assert.match(single, /1 × Lunch/);
  assert.doesNotMatch(single, /Weekly|Selected days|for [35] days/);
  for (const [count, fee] of [[3, 25.2], [5, 42]]) {
    const html = renderToStaticMarkup(React.createElement(PaymentOrderSummary, { summary: { ...summary, fulfilments: Array(count).fill({}), totals: { ...summary.totals, deliveryFee: fee, grandTotal: 10 + fee } } }));
    assert.ok(html.includes(`Delivery fee for ${count} days`));
    assert.ok(html.includes(fee.toFixed(2)));
    assert.doesNotMatch(html, /fulfilment|8.40|× [35]/);
  }
});
