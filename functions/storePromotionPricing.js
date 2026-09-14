// Promotion V1 is deliberately product-base-price only.  This module has no
// Firestore dependency so checkout and delivery quoting use identical rules.
const asString = value => typeof value === 'string' ? value.trim() : '';
const asInt = value => Number.isInteger(value) ? value : 0;
const moneyToMinor = value => Math.round((Number(value) + Number.EPSILON) * 100);
const minorToMoney = value => value / 100;

export const PROMOTION_TYPES = Object.freeze(['percentage', 'fixed_amount', 'buy_x_get_y']);

export const normalizePromotion = (id, value = {}) => ({
  id: asString(value.id) || asString(id),
  storeId: asString(value.storeId),
  workspaceId: asString(value.workspaceId),
  name: asString(value.name),
  active: value.active === true,
  type: asString(value.type),
  eligibleProductIds: [...new Set((Array.isArray(value.eligibleProductIds) ? value.eligibleProductIds : []).map(asString).filter(Boolean))],
  percentageOff: Number(value.percentageOff),
  fixedAmountOff: Number(value.fixedAmountOff),
  buyQuantity: asInt(value.buyQuantity),
  getQuantity: asInt(value.getQuantity),
  minimumQuantity: asInt(value.minimumQuantity),
  minimumOrderAmount: Number(value.minimumOrderAmount),
  startsAt: value.startsAt?.toDate instanceof Function ? value.startsAt.toDate() : new Date(value.startsAt),
  endsAt: value.endsAt == null ? null : (value.endsAt?.toDate instanceof Function ? value.endsAt.toDate() : new Date(value.endsAt)),
  priority: asInt(value.priority)
});

export const isValidPromotion = promotion => {
  if (!promotion.id || !promotion.storeId || !promotion.workspaceId || !promotion.name || !PROMOTION_TYPES.includes(promotion.type)
    || !promotion.active || !promotion.eligibleProductIds.length || !Number.isFinite(promotion.startsAt.getTime())
    || (promotion.endsAt && !Number.isFinite(promotion.endsAt.getTime())) || (promotion.endsAt && promotion.endsAt <= promotion.startsAt)
    || promotion.minimumQuantity < 0 || !Number.isFinite(promotion.minimumOrderAmount) || promotion.minimumOrderAmount < 0) return false;
  if (promotion.type === 'percentage') return Number.isFinite(promotion.percentageOff) && promotion.percentageOff > 0 && promotion.percentageOff <= 100;
  if (promotion.type === 'fixed_amount') return Number.isFinite(promotion.fixedAmountOff) && promotion.fixedAmountOff > 0;
  return promotion.buyQuantity > 0 && promotion.getQuantity > 0;
};

const promotionSavingMinor = ({ promotion, item, merchandiseSubtotalMinor }) => {
  if (item.itemType === 'set' || !promotion.eligibleProductIds.includes(asString(item.productId)) || item.quantity < promotion.minimumQuantity) return 0;
  const minimumOrderMinor = Number.isFinite(promotion.minimumOrderAmount) ? moneyToMinor(promotion.minimumOrderAmount) : 0;
  if (merchandiseSubtotalMinor < minimumOrderMinor) return 0;
  // Options are intentionally excluded: only the base product unit price is promotable.
  const baseUnitMinor = Math.max(0, moneyToMinor(item.basePrice));
  const baseLineMinor = baseUnitMinor * item.quantity;
  if (promotion.type === 'percentage') return Math.min(baseLineMinor, Math.round(baseLineMinor * promotion.percentageOff / 100));
  if (promotion.type === 'fixed_amount') return Math.min(baseLineMinor, moneyToMinor(promotion.fixedAmountOff) * item.quantity);
  const freeQuantity = Math.floor(item.quantity / (promotion.buyQuantity + promotion.getQuantity)) * promotion.getQuantity;
  return Math.min(baseLineMinor, freeQuantity * baseUnitMinor);
};

export const calculatePromotionPricing = ({ items, promotions = [], now = new Date(), excluded = false }) => {
  const merchandiseSubtotalMinor = (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Math.max(0, moneyToMinor(item.lineTotal)), 0);
  if (excluded) return {
    merchandiseSubtotal: minorToMoney(merchandiseSubtotalMinor), discountTotal: 0,
    discountedMerchandiseTotal: minorToMoney(merchandiseSubtotalMinor), promotionSnapshot: { version: 1, appliedPromotions: [], lineAdjustments: [] }
  };
  const active = promotions.map(item => normalizePromotion(item.id, item)).filter(promotion => isValidPromotion(promotion)
    && promotion.startsAt <= now && (!promotion.endsAt || now < promotion.endsAt));
  const lineAdjustments = (Array.isArray(items) ? items : []).map(item => {
    const candidates = active.map(promotion => ({ promotion, savingMinor: promotionSavingMinor({ promotion, item, merchandiseSubtotalMinor }) }))
      .filter(candidate => candidate.savingMinor > 0)
      .sort((a, b) => b.savingMinor - a.savingMinor || b.promotion.priority - a.promotion.priority || a.promotion.id.localeCompare(b.promotion.id));
    const winner = candidates[0];
    const originalLineTotalMinor = Math.max(0, moneyToMinor(item.lineTotal));
    return {
      productId: asString(item.productId), productName: asString(item.productName), quantity: item.quantity,
      originalLineTotal: minorToMoney(originalLineTotalMinor), discountAmount: minorToMoney(winner?.savingMinor || 0),
      finalLineTotal: minorToMoney(originalLineTotalMinor - (winner?.savingMinor || 0)),
      ...(winner ? { promotionId: winner.promotion.id } : {})
    };
  });
  const discountMinor = lineAdjustments.reduce((sum, line) => sum + moneyToMinor(line.discountAmount), 0);
  const appliedPromotions = [...new Map(active.map(promotion => [promotion.id, promotion])).values()]
    .filter(promotion => lineAdjustments.some(line => line.promotionId === promotion.id))
    .map(promotion => ({ promotionId: promotion.id, name: promotion.name, type: promotion.type, terms: {
      ...(promotion.type === 'percentage' ? { percentageOff: promotion.percentageOff } : {}),
      ...(promotion.type === 'fixed_amount' ? { fixedAmountOff: promotion.fixedAmountOff } : {}),
      ...(promotion.type === 'buy_x_get_y' ? { buyQuantity: promotion.buyQuantity, getQuantity: promotion.getQuantity } : {}),
      ...(promotion.minimumQuantity ? { minimumQuantity: promotion.minimumQuantity } : {}),
      ...(Number.isFinite(promotion.minimumOrderAmount) ? { minimumOrderAmount: promotion.minimumOrderAmount } : {})
    }, savings: minorToMoney(lineAdjustments.filter(line => line.promotionId === promotion.id).reduce((sum, line) => sum + moneyToMinor(line.discountAmount), 0)) }));
  return { merchandiseSubtotal: minorToMoney(merchandiseSubtotalMinor), discountTotal: minorToMoney(discountMinor), discountedMerchandiseTotal: minorToMoney(merchandiseSubtotalMinor - discountMinor), promotionSnapshot: { version: 1, appliedPromotions, lineAdjustments } };
};
