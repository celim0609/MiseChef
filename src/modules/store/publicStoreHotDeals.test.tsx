import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('Hot Deals is conditional, uses the public projection, and excludes Store Sets', () => {
  assert.match(publicStorePage, /publicPromotionService\.list\(slug\)/);
  assert.match(publicStorePage, /promotionProducts\.length > 0/);
  assert.match(publicStorePage, /🔥 Hot Deals/);
  assert.match(publicStorePage, /Special offers available now/);
  assert.match(publicStorePage, /\(data\?\.products \|\| \[\]\)\.filter\(product => promotionByProduct\.has\(product\.id\)\)/);
  assert.doesNotMatch(publicStorePage, /\(data\?\.sets \|\| \[\]\)\.filter\(set => promotionByProduct/);
});
