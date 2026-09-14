import type { StorePromotion, StorePromotionType } from './types';

export type StorePromotionDraft = Omit<StorePromotion, 'id' | 'storeId' | 'workspaceId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'startsAt' | 'endsAt'> & { startsAt: Date; endsAt: Date | null };
export const emptyPromotionDraft = (): StorePromotionDraft => ({ name: '', active: true, type: 'percentage', eligibleProductIds: [], percentageOff: 10, minimumQuantity: 0, minimumOrderAmount: 0, startsAt: new Date(), endsAt: null, priority: 0 });
export const promotionStatus = (promotion: Pick<StorePromotion, 'active' | 'startsAt' | 'endsAt'>, now = new Date()) => {
  const start = new Date(promotion.startsAt as string | Date); const end = promotion.endsAt ? new Date(promotion.endsAt as string | Date) : null;
  if (!promotion.active) return 'Inactive';
  if (end && end <= now) return 'Expired';
  if (start > now) return 'Scheduled';
  return 'Active';
};
export const promotionSummary = (draft: Pick<StorePromotionDraft, 'type' | 'percentageOff' | 'fixedAmountOff' | 'buyQuantity' | 'getQuantity'>) => draft.type === 'percentage'
  ? `${draft.percentageOff || 0}% OFF`
  : draft.type === 'fixed_amount' ? `RM${Number(draft.fixedAmountOff || 0).toFixed(2)} OFF per item`
    : `Buy ${draft.buyQuantity || 0}, Get ${draft.getQuantity || 0} Free`;
export const validatePromotionDraft = (draft: StorePromotionDraft) => {
  if (!draft.name.trim()) return 'Promotion name is required.';
  if (!draft.eligibleProductIds.length) return 'Choose at least one eligible product.';
  if (!(draft.startsAt instanceof Date) || Number.isNaN(draft.startsAt.getTime())) return 'Choose a valid start date and time.';
  if (draft.endsAt && (!(draft.endsAt instanceof Date) || Number.isNaN(draft.endsAt.getTime()) || draft.endsAt <= draft.startsAt)) return 'End date/time must be after the start date/time.';
  if (!Number.isInteger(draft.minimumQuantity) || draft.minimumQuantity < 0) return 'Minimum quantity cannot be negative.';
  if (!Number.isFinite(draft.minimumOrderAmount) || draft.minimumOrderAmount < 0) return 'Minimum order amount cannot be negative.';
  if (draft.type === 'percentage' && (!(draft.percentageOff! > 0) || draft.percentageOff! > 100)) return 'Percentage off must be between 1 and 100.';
  if (draft.type === 'fixed_amount' && !(draft.fixedAmountOff! > 0)) return 'RM off per item must be greater than zero.';
  if (draft.type === 'buy_x_get_y' && (!(draft.buyQuantity! > 0) || !(draft.getQuantity! > 0) || !Number.isInteger(draft.buyQuantity) || !Number.isInteger(draft.getQuantity))) return 'Buy and Get quantities must be whole numbers greater than zero.';
  return '';
};
export const toPromotionTypeLabel = (type: StorePromotionType) => type === 'percentage' ? 'Percentage Discount' : type === 'fixed_amount' ? 'Fixed Amount Discount' : 'Buy X Get Y';
