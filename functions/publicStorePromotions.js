import { calculatePromotionPricing } from './storePromotionPricing.js';
export const projectPublicStorePromotions = ({ products, promotions, now = new Date() }) => {
  const visible = (products || []).map(product => {
    const result = calculatePromotionPricing({ items: [{ itemType: 'product', productId: product.id, productName: '', quantity: 1, basePrice: product.price, lineTotal: product.price }], promotions, now });
    const applied = result.promotionSnapshot.appliedPromotions[0];
    if (!applied) return null;
    return { productId: product.id, name: applied.name, type: applied.type, savings: applied.savings, terms: applied.terms, originalPrice: product.price, estimatedPrice: applied.type === 'buy_x_get_y' ? null : result.promotionSnapshot.lineAdjustments[0].finalLineTotal };
  }).filter(Boolean);
  return { promotions: visible };
};
