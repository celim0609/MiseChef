import type { PublicPromotion } from './services/publicPromotionService';

const toMinor = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100);
const fromMinor = (value: number) => value / 100;

export const getPromotionOfferLabel = (promotion: PublicPromotion) => promotion.name || (
  promotion.type === 'percentage' ? `${promotion.terms.percentageOff}% OFF`
    : promotion.type === 'fixed_amount' ? `RM${promotion.terms.fixedAmountOff} OFF`
      : `BUY ${promotion.terms.buyQuantity} GET ${promotion.terms.getQuantity} FREE`
);

// This is display-only. The checkout callable recalculates and persists prices.
export const getPromotionSavingsEstimate = ({
  promotion,
  quantity,
  baseProductPrice,
  merchandiseSubtotal
}: {
  promotion: PublicPromotion;
  quantity: number;
  baseProductPrice: number;
  merchandiseSubtotal: number;
}) => {
  const minimumQuantity = Math.max(0, Number(promotion.terms.minimumQuantity || 0));
  const minimumOrderAmount = Math.max(0, Number(promotion.terms.minimumOrderAmount || 0));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity < minimumQuantity || merchandiseSubtotal < minimumOrderAmount) return 0;

  const baseUnitMinor = Math.max(0, toMinor(baseProductPrice));
  const baseLineMinor = baseUnitMinor * quantity;
  if (promotion.type === 'percentage') return fromMinor(Math.min(baseLineMinor, Math.round(baseLineMinor * Number(promotion.terms.percentageOff || 0) / 100)));
  if (promotion.type === 'fixed_amount') return fromMinor(Math.min(baseLineMinor, toMinor(Number(promotion.terms.fixedAmountOff || 0)) * quantity));

  const buyQuantity = Math.max(0, Number(promotion.terms.buyQuantity || 0));
  const getQuantity = Math.max(0, Number(promotion.terms.getQuantity || 0));
  if (!Number.isInteger(buyQuantity) || !Number.isInteger(getQuantity) || buyQuantity < 1 || getQuantity < 1) return 0;
  const freeQuantity = Math.floor(quantity / (buyQuantity + getQuantity)) * getQuantity;
  return fromMinor(Math.min(baseLineMinor, freeQuantity * baseUnitMinor));
};
