import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./posWalkIn.ts', import.meta.url), 'utf8');

test('walk-in receipt writes complete HTML before printing', () => {
  assert.match(source, /popup\.document\.open\(\)/);
  assert.match(source, /popup\.document\.write\(receiptHtml\)/);
  assert.match(source, /popup\.document\.close\(\)/);
  assert.match(source, /popup\.print\(\)/);
  assert.ok(source.indexOf('popup.document.write(receiptHtml)') < source.indexOf('popup.print()'));
});

test('walk-in receipt does not request noopener in window features', () => {
  assert.match(source, /window\.open\('', '_blank', 'width=360,height=640'\)/);
  assert.doesNotMatch(source, /window\.open\('', '_blank', '[^']*noopener/);
});

test('walk-in receipt remains thermal and includes core order content', () => {
  assert.match(source, /size:80mm auto/);
  assert.match(source, /Order:/);
  assert.match(source, /Walk-in/);
  assert.match(source, /Payment: Paid \/ Walk-in/);
  assert.match(source, /selectedOptions/);
});
