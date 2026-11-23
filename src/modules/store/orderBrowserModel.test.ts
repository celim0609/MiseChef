import assert from 'node:assert/strict';
import test from 'node:test';
import { browserRange, browserRows, moveBrowserDate } from './orderBrowserModel';
import type { StoreOrder } from './types';
const order = { id: 'a', orderNumber: 'MC123', customerName: 'Aisha', createdAt: '2025-01-01', items: [{ productName: 'Lunch', quantity: 2, selectedOptions: [] }], payment: { status: 'paid' }, fulfilmentStatus: 'New', fulfilments: [
  { id: 'one', date: '2026-11-19', time: '12:00', method: 'pickup', allocations: [{ itemIndex: 0, quantity: 1 }] },
  { id: 'two', date: '2026-11-21', time: '13:00', method: 'delivery', allocations: [{ itemIndex: 0, quantity: 1 }] }
] } as StoreOrder;
const range = browserRange('2026-11-20', 'Month');
test('groups by fulfilment date and retains future days independently', () => {
 assert.deepEqual(browserRows([order], 'History', '2026-11-20', range).map(row => row.date), ['2026-11-19']);
 assert.deepEqual(browserRows([order], 'Tomorrow', '2026-11-20', range).map(row => row.date), ['2026-11-21']);
});
test('deduplicates parent snapshots and same-date fulfilments', () => {
 const next = { ...order, fulfilments: [...order.fulfilments!, { ...order.fulfilments![0], id: 'three' }], fulfilmentStatus: 'Completed' } as StoreOrder;
 const rows = browserRows([next, next], 'History', '2026-11-20', range);
 assert.equal(rows.length, 2); assert.equal(new Set(rows.map(row => row.order.id)).size, 1);
 assert.deepEqual(rows.find(row => row.date === '2026-11-19')?.times, ['12:00']);
});
test('search and filters combine without dropping multi-day matches', () => {
 assert.equal(browserRows([order], 'Tomorrow', '2026-11-20', range, 'AISHA', 'paid', 'delivery').length, 1);
 assert.equal(browserRows([order], 'Tomorrow', '2026-11-20', range, 'mc123', 'pending').length, 0);
 assert.equal(browserRows([order], 'Tomorrow', '2026-11-20', range, '', '', 'pickup').length, 0);
});
test('ranges handle Monday weeks, leap years and month boundaries', () => {
 assert.deepEqual(browserRange('2026-11-22', 'Week'), { start: '2026-11-16', end: '2026-11-23' });
 assert.deepEqual(browserRange('2028-02-29', 'Month'), { start: '2028-02-01', end: '2028-03-01' });
 assert.equal(moveBrowserDate('2026-03-31', 'Month', -1), '2026-02-01');
 assert.equal(moveBrowserDate('2026-12-31', 'Month', 1), '2027-01-01');
});

test('Today and Tomorrow are fixed days; Upcoming and History use the selected range', async () => {
 const {selectedBrowserRange}=await import('./orderBrowserModel');
 assert.deepEqual(selectedBrowserRange('Today','2025-01-01','Month','2026-11-23'),{start:'2026-11-23',end:'2026-11-24'});
 assert.deepEqual(selectedBrowserRange('Tomorrow','2025-01-01','Week','2026-12-31'),{start:'2027-01-01',end:'2027-01-02'});
 assert.deepEqual(selectedBrowserRange('History','2026-11-23','Week','2026-11-23'),{start:'2026-11-23',end:'2026-11-30'});
});
