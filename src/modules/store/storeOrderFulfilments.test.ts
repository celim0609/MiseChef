import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFulfilmentSchedule, selectionAllowsDate } from './storeOrderFulfilments';
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
