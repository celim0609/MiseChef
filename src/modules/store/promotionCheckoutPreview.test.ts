import assert from 'node:assert/strict';
import test from 'node:test';
import { getPromotionOfferLabel, getPromotionSavingsEstimate } from './promotionCheckoutPreview';

const b1f1 = { productId: 'muffin', name: 'Buy 1 Get 1 Free', type: 'buy_x_get_y' as const, savings: 6, terms: { buyQuantity: 1, getQuantity: 1, minimumOrderAmount: 0 }, originalPrice: 6, estimatedPrice: null };

test('B1F1 checkout preview shows a separate RM6 saving for two RM6 products', () => {
  assert.equal(getPromotionOfferLabel(b1f1), 'Buy 1 Get 1 Free');
  assert.equal(getPromotionSavingsEstimate({ promotion: b1f1, quantity: 2, baseProductPrice: 6, merchandiseSubtotal: 12 }), 6);
});

test('checkout preview keeps option adjustments undiscounted and observes minimum requirements', () => {
  assert.equal(getPromotionSavingsEstimate({ promotion: b1f1, quantity: 2, baseProductPrice: 6, merchandiseSubtotal: 14 }), 6);
  assert.equal(getPromotionSavingsEstimate({ promotion: { ...b1f1, terms: { ...b1f1.terms, minimumQuantity: 3 } }, quantity: 2, baseProductPrice: 6, merchandiseSubtotal: 12 }), 0);
  assert.equal(getPromotionSavingsEstimate({ promotion: { ...b1f1, terms: { ...b1f1.terms, minimumOrderAmount: 15 } }, quantity: 2, baseProductPrice: 6, merchandiseSubtotal: 12 }), 0);
});
