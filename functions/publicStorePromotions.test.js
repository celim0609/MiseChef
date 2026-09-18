import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPublicStorePromotions } from './publicStorePromotions.js';
const now = new Date('2026-09-14T00:00:00Z');
const promotion = extra => ({ id: 'p', storeId: 's', workspaceId: 's', name: 'Offer', active: true, type: 'percentage', eligibleProductIds: ['a'], percentageOff: 20, minimumQuantity: 0, minimumOrderAmount: 0, startsAt: new Date('2026-09-01'), endsAt: null, priority: 0, ...extra });
test('public projection exposes only active winning normal product display data', () => {
  const result = projectPublicStorePromotions({ products: [{ id: 'a', price: 10 }, { id: 'b', price: 10 }], promotions: [promotion(), promotion({ id: 'better', percentageOff: 30 })], now });
  assert.deepEqual(result.promotions, [{ id: 'better', productId: 'a', name: 'Offer', type: 'percentage', savings: 3, terms: { percentageOff: 30, minimumOrderAmount: 0 }, originalPrice: 10, estimatedPrice: 7 }]);
  assert.equal(JSON.stringify(result).includes('workspaceId'), false);
});
test('scheduled expired and inactive promotions are hidden', () => {
  for (const extra of [{ active: false }, { startsAt: new Date('2026-10-01') }, { endsAt: new Date('2026-09-10') }]) assert.deepEqual(projectPublicStorePromotions({ products: [{ id: 'a', price: 10 }], promotions: [promotion(extra)], now }).promotions, []);
});
test('Buy 1 Get 1 appears using its first qualifying quantity', () => {
  const result = projectPublicStorePromotions({
    products: [{ id: 'a', price: 6 }],
    promotions: [promotion({ type: 'buy_x_get_y', buyQuantity: 1, getQuantity: 1 })],
    now
  });
  assert.deepEqual(result.promotions, [{
    id: 'p', productId: 'a', name: 'Offer', type: 'buy_x_get_y', savings: 6,
    terms: { buyQuantity: 1, getQuantity: 1, minimumOrderAmount: 0 }, originalPrice: 6, estimatedPrice: null
  }]);
});
test('Buy 2 Get 1 appears using its first qualifying quantity', () => {
  const result = projectPublicStorePromotions({
    products: [{ id: 'a', price: 6 }],
    promotions: [promotion({ type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1, minimumQuantity: 0 })],
    now
  });
  assert.deepEqual(result.promotions, [{
    id: 'p', productId: 'a', name: 'Offer', type: 'buy_x_get_y', savings: 6,
    terms: { buyQuantity: 2, getQuantity: 1, minimumOrderAmount: 0 }, originalPrice: 6, estimatedPrice: null
  }]);
});
