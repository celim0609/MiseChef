import { HttpsError } from 'firebase-functions/v2/https';

const readString = value => typeof value === 'string' ? value.trim() : '';
const readNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const hasNumber = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
const toIso = value => value?.toDate instanceof Function
  ? value.toDate().toISOString()
  : readString(value);

const customerOrderItem = value => {
  const item = value && typeof value === 'object' ? value : {};
  const productName = readString(item.setSnapshot?.setName) || readString(item.productName);
  const quantity = Math.max(0, readNumber(item.quantity));
  if (!productName || quantity < 1) return null;
  const adjustment = value?.promotionAdjustment && typeof value.promotionAdjustment === 'object' ? value.promotionAdjustment : null;
  return {
    productName,
    quantity,
    ...(hasNumber(item.lineTotal) ? { lineTotal: Math.max(0, readNumber(item.lineTotal)) } : {}),
    ...(adjustment && hasNumber(adjustment.discountAmount) ? { promotionAdjustment: {
      discountAmount: Math.max(0, readNumber(adjustment.discountAmount)),
      finalLineTotal: Math.max(0, readNumber(adjustment.finalLineTotal))
    } } : {}),
    setSelections: (Array.isArray(item.setSnapshot?.selectedGroups) ? item.setSnapshot.selectedGroups : [])
      .map(selection => ({
        groupName: readString(selection?.groupName),
        productName: readString(selection?.productName)
      }))
      .filter(selection => selection.productName),
    selectedOptions: (Array.isArray(item.selectedOptions) ? item.selectedOptions : [])
      .map(option => ({
        groupName: readString(option?.groupName),
        optionName: readString(option?.optionName)
      }))
      .filter(option => option.optionName)
  };
};

const customerOrder = document => {
  const data = document.data() || {};
  const totals = data.totals && typeof data.totals === 'object' ? data.totals : {};
  const promotionSnapshot = data.promotionSnapshot && typeof data.promotionSnapshot === 'object' ? data.promotionSnapshot : null;
  const adjustments = Array.isArray(promotionSnapshot?.lineAdjustments) ? promotionSnapshot.lineAdjustments : [];
  const items = (Array.isArray(data.items) ? data.items : []).map((item, index) => customerOrderItem({
    ...item,
    promotionAdjustment: adjustments[index]
  })).filter(Boolean);
  return {
    orderNumber: readString(data.orderNumber),
    orderDate: toIso(data.createdAt),
    storeName: readString(data.storeName) || 'Store',
    itemCount: Math.max(0, readNumber(data.itemCount)),
    items,
    remarks: readString(data.notes),
    total: Math.max(0, readNumber(data.total)),
    fulfilmentMethod: data.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
    ...(hasNumber(totals.grandTotal) ? { totals: {
      merchandiseSubtotal: Math.max(0, readNumber(totals.merchandiseSubtotal)),
      discountTotal: Math.max(0, readNumber(totals.discountTotal)),
      discountedMerchandiseTotal: Math.max(0, readNumber(totals.discountedMerchandiseTotal)),
      deliveryFee: Math.max(0, readNumber(totals.deliveryFee)),
      grandTotal: Math.max(0, readNumber(totals.grandTotal)),
      currency: data.currency === 'SGD' ? 'SGD' : 'MYR'
    } } : {}),
    ...(promotionSnapshot && Array.isArray(promotionSnapshot.appliedPromotions) ? { promotionSnapshot: {
      appliedPromotions: promotionSnapshot.appliedPromotions.flatMap(promotion => (
        readString(promotion?.name) && ['percentage', 'fixed_amount', 'buy_x_get_y'].includes(readString(promotion?.type)) && hasNumber(promotion?.savings)
          ? [{ name: readString(promotion.name), type: readString(promotion.type), savings: Math.max(0, readNumber(promotion.savings)), terms: promotion.terms && typeof promotion.terms === 'object' ? promotion.terms : {} }]
          : []
      ))
    } } : {}),
    currency: data.currency === 'SGD' ? 'SGD' : 'MYR',
    paymentStatus: readString(data.payment?.status) || 'pending',
    orderStatus: readString(data.status) || 'Awaiting Payment',
    fulfilmentStatus: readString(data.fulfilmentStatus) || 'New',
    ...(readString(data.groupOrder?.name) ? { groupName: readString(data.groupOrder.name) } : {})
  };
};

export const listCustomerOrders = async ({ db, uid }) => {
  const customerUid = readString(uid);
  if (!customerUid) throw new HttpsError('unauthenticated', 'Sign in to view your orders.');
  const snapshot = await db.collection('storeOrders')
    .where('customerUid', '==', customerUid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return { orders: snapshot.docs.map(customerOrder) };
};
