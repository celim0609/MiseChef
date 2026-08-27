import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setsPanel = readFileSync(new URL('./StoreSetsPanel.tsx', import.meta.url), 'utf8');
const storePage = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

test('activate and deactivate stay inside Store management', () => {
  assert.match(setsPanel, /const toggleAvailability = async \(set: StoreSet\)/);
  assert.match(setsPanel, /storeService\.updateSet\(set, \{ \.\.\.toDraft\(set\), available: !set\.available \}\)/);
  assert.match(setsPanel, /type="button" onClick=\{\(\) => toggleAvailability\(set\)\}/);
  assert.doesNotMatch(setsPanel, /window\.location|history\.(pushState|replaceState)|window\.history|onNavigate|setActiveTab/);
  assert.match(storePage, /type StoreView = 'products' \| 'sets' \| 'orders' \| 'pickup' \| 'settings'/);
  assert.match(storePage, /activeView === 'sets'/);
});

