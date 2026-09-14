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

test('Hot Deals cards reuse the existing product image and retain the offer badge', () => {
  assert.match(publicStorePage, /product\.photoUrl && <img src=\{product\.photoUrl\} alt=\{product\.name\} className="h-48 w-full object-cover"/);
  assert.match(publicStorePage, /BUY \$\{promotion\.terms\.buyQuantity\} GET \$\{promotion\.terms\.getQuantity\} FREE/);
  assert.match(publicStorePage, /overflow-hidden rounded-3xl/);
});

test('checkout shows each promotion saving before the estimated pickup total and CTA', () => {
  assert.match(publicStorePage, /cartPromotionEstimates\.map\(estimate => <div key=\{estimate\.label\}/);
  assert.match(publicStorePage, /🔥 \{estimate\.label\}/);
  assert.match(publicStorePage, /checkoutMerchandiseSubtotal = hasDisplayableDeliveryQuote[\s\S]*: estimatedMerchandiseTotal/);
  assert.match(publicStorePage, /Continue to Secure Payment/);
});
