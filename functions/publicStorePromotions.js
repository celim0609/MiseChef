import { calculatePromotionPricing } from './storePromotionPricing.js';

const projectAppliedPromotion = ({ product, result }) => {
  const applied = result.promotionSnapshot.appliedPromotions[0];
  if (!applied) return null;
  return {
    productId: product.id,
    name: applied.name,
    type: applied.type,
    savings: applied.savings,
    terms: applied.terms,
    originalPrice: product.price,
    estimatedPrice: applied.type === 'buy_x_get_y' ? null : result.promotionSnapshot.lineAdjustments[0].finalLineTotal
  };
};

const pricingForQuantity = ({ product, promotions, quantity, now }) => calculatePromotionPricing({
  items: [{
    itemType: 'product',
    productId: product.id,
    productName: '',
    quantity,
    basePrice: product.price,
    lineTotal: product.price * quantity
  }],
  promotions,
  now
});

export const projectPublicStorePromotions = ({ products, promotions, now = new Date() }) => {
  const visible = (products || []).map(product => {
    // Percentage and fixed-amount offers have a valid one-item preview. Buy X Get Y
    // does not: its first possible saving is at its qualifying bundle quantity.
    const oneItemResult = pricingForQuantity({ product, promotions, quantity: 1, now });
    const oneItemProjection = projectAppliedPromotion({ product, result: oneItemResult });
    if (oneItemProjection) return oneItemProjection;

    const buyXGetYCandidates = (promotions || [])
      .filter(promotion => promotion?.type === 'buy_x_get_y')
      .map(promotion => {
        const qualifyingQuantity = Math.max(
          Number(promotion.buyQuantity || 0) + Number(promotion.getQuantity || 0),
          Number(promotion.minimumQuantity || 0)
        );
        const result = pricingForQuantity({ product, promotions: [promotion], quantity: qualifyingQuantity, now });
        const projection = projectAppliedPromotion({ product, result });
        return projection ? { projection, priority: Number(promotion.priority || 0), id: String(promotion.id || '') } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.projection.savings - a.projection.savings || b.priority - a.priority || a.id.localeCompare(b.id));

    return buyXGetYCandidates[0]?.projection || null;
  }).filter(Boolean);
  return { promotions: visible };
};
