import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Load the pure formatter from the panel source without initializing Firebase,
// which is intentionally unavailable in this focused Node test environment.
const panelSource = readFileSync(new URL('./StorePromotionsPanel.tsx', import.meta.url), 'utf8');
const formatterStart = panelSource.indexOf('export const toDateTimeLocalValue');
const formatterEnd = panelSource.indexOf('\n};', formatterStart) + 3;
const formatterSource = panelSource.slice(formatterStart, formatterEnd)
  .replace('export const', 'const')
  .replace('(value: Date | null)', '(value)')
  .replace('(part: number)', '(part)');
const toDateTimeLocalValue: (value: Date | null) => string = Function(`${formatterSource}; return toDateTimeLocalValue;`)();

test('datetime-local values round-trip as local wall-clock time without UTC drift', () => {
  const selected = new Date(2026, 8, 15, 10, 45);
  const value = toDateTimeLocalValue(selected);

  assert.equal(value, '2026-09-15T10:45');
  assert.equal(toDateTimeLocalValue(new Date(value)), value);
});

test('datetime-local keeps a near-midnight local time on its original calendar date', () => {
  const localNearMidnight = new Date(2026, 8, 15, 0, 5);

  assert.equal(toDateTimeLocalValue(localNearMidnight), '2026-09-15T00:05');
});

test('editing an existing promotion preserves its intended local start time', () => {
  // The edit flow converts a Firestore timestamp to Date before this formatter runs.
  const existingPromotionStart = new Date(2026, 8, 20, 18, 0);

  assert.equal(toDateTimeLocalValue(existingPromotionStart), '2026-09-20T18:00');
});
