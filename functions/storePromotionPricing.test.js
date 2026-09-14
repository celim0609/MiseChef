import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePromotionPricing } from './storePromotionPricing.js';

const now = new Date('2026-09-14T10:00:00.000Z');
const item = ({ quantity = 1, basePrice = 10, lineTotal = basePrice * quantity, itemType = 'product' } = {}) => ({ itemType, productId: 'p1', productName: 'Product', quantity, basePrice, lineTotal });
const promotion = (overrides = {}) => ({ id: 'promo-a', storeId: 'store-a', workspaceId: 'store-a', name: 'Promotion', active: true, type: 'percentage', eligibleProductIds: ['p1'], percentageOff: 10, minimumQuantity: 0, minimumOrderAmount: 0, startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: null, priority: 0, ...overrides });

test('percentage discount uses minor units and snapshots immutable terms', () => {
  const result = calculatePromotionPricing({ items: [item({ basePrice: 19.99, lineTotal: 19.99 })], promotions: [promotion({ percentageOff: 15 })], now });
  assert.deepEqual(result, { merchandiseSubtotal: 19.99, discountTotal: 3, discountedMerchandiseTotal: 16.99, promotionSnapshot: { version: 1, appliedPromotions: [{ promotionId: 'promo-a', name: 'Promotion', type: 'percentage', terms: { percentageOff: 15, minimumOrderAmount: 0 }, savings: 3 }], lineAdjustments: [{ productId: 'p1', productName: 'Product', quantity: 1, originalLineTotal: 19.99, discountAmount: 3, finalLineTotal: 16.99, promotionId: 'promo-a' }] } });
});

test('fixed amount is per eligible unit and cannot make base product negative', () => {
  const result = calculatePromotionPricing({ items: [item({ quantity: 2, basePrice: 2, lineTotal: 7 })], promotions: [promotion({ type: 'fixed_amount', fixedAmountOff: 3, percentageOff: undefined })], now });
  assert.equal(result.discountTotal, 4); // add-on RM3 remains payable
  assert.equal(result.discountedMerchandiseTotal, 3);
});

test('B1F1 and buy two get one calculate free base-product units only', () => {
  const b1f1 = calculatePromotionPricing({ items: [item({ quantity: 5, basePrice: 10, lineTotal: 55 })], promotions: [promotion({ type: 'buy_x_get_y', buyQuantity: 1, getQuantity: 1, percentageOff: undefined })], now });
  const b2g1 = calculatePromotionPricing({ items: [item({ quantity: 8, basePrice: 10 })], promotions: [promotion({ type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1, percentageOff: undefined })], now });
  assert.equal(b1f1.discountTotal, 20);
  assert.equal(b1f1.discountedMerchandiseTotal, 35);
  assert.equal(b2g1.discountTotal, 20);
});

test('inactive, future, expired and minimum requirements do not apply', () => {
  for (const candidate of [
    promotion({ active: false }), promotion({ startsAt: new Date('2026-10-01T00:00:00Z') }), promotion({ endsAt: new Date('2026-09-01T00:00:00Z') }),
    promotion({ minimumQuantity: 3 }), promotion({ minimumOrderAmount: 20 })
  ]) assert.equal(calculatePromotionPricing({ items: [item()], promotions: [candidate], now }).discountTotal, 0);
});

test('highest saving wins with priority then promotion ID deterministic tie break', () => {
  const best = calculatePromotionPricing({ items: [item()], promotions: [promotion({ id: 'z', percentageOff: 10, priority: 0 }), promotion({ id: 'a', percentageOff: 20, priority: 0 })], now });
  const priority = calculatePromotionPricing({ items: [item()], promotions: [promotion({ id: 'z', percentageOff: 10, priority: 2 }), promotion({ id: 'a', percentageOff: 10, priority: 1 })], now });
  const id = calculatePromotionPricing({ items: [item()], promotions: [promotion({ id: 'z', percentageOff: 10 }), promotion({ id: 'a', percentageOff: 10 })], now });
  assert.equal(best.promotionSnapshot.appliedPromotions[0].promotionId, 'a');
  assert.equal(priority.promotionSnapshot.appliedPromotions[0].promotionId, 'z');
  assert.equal(id.promotionSnapshot.appliedPromotions[0].promotionId, 'a');
});

test('sets and explicit exclusion remain zero-promotion backward compatible', () => {
  assert.equal(calculatePromotionPricing({ items: [item({ itemType: 'set' })], promotions: [promotion()], now }).discountTotal, 0);
  const result = calculatePromotionPricing({ items: [item({ lineTotal: 10.01 })], promotions: [promotion()], now, excluded: true });
  assert.equal(result.discountTotal, 0);
  assert.equal(result.discountedMerchandiseTotal, 10.01);
  assert.deepEqual(result.promotionSnapshot.appliedPromotions, []);
});

test('the persisted snapshot does not depend on later mutable promotion edits', () => {
  const mutable = promotion({ percentageOff: 10 });
  const snapshot = calculatePromotionPricing({ items: [item()], promotions: [mutable], now }).promotionSnapshot;
  mutable.name = 'Changed later'; mutable.percentageOff = 90; mutable.active = false;
  assert.equal(snapshot.appliedPromotions[0].name, 'Promotion');
  assert.equal(snapshot.appliedPromotions[0].terms.percentageOff, 10);
  assert.equal(snapshot.lineAdjustments[0].finalLineTotal, 9);
});
