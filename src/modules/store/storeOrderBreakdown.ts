import { canonicalFulfilmentMethod, canonicalOrderFulfilmentLabel } from '../../../functions/storeFulfilmentCanonical.js';
import { getOrderTickets } from './orderTickets';
import type { StoreOrder } from './types';

export const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const minor = (value: number) => Math.round(value * 100);

export function getStoreOrderBreakdown(order: StoreOrder) {
  const { totals, deliveryPricingSnapshot: snapshot } = order;
  const pricing = order.delivery?.pricing;
  const savedDays = snapshot?.days ?? pricing?.days ?? [];
  const isPickup = canonicalOrderFulfilmentLabel(order) === 'Pickup';
  const scheduledDays = isPickup ? [] : order.fulfilments?.length ? order.fulfilments : getOrderTickets(order);
  const deliveryDates = scheduledDays.filter(day => canonicalFulfilmentMethod(order, day) === 'delivery').map(day => day.date);
  const dates = isPickup ? [] : [...new Set([...deliveryDates, ...savedDays.map(day => day.date)].filter(Boolean))].sort();
  const deliveryFee = isPickup ? 0 : [
    totals?.deliveryFee, snapshot?.finalDeliveryTotal, pricing?.customerDeliveryFee, snapshot?.customerDeliveryFee
  ].find(isAmount);
  const subtotal = isAmount(totals?.merchandiseSubtotal) ? totals.merchandiseSubtotal
    : order.items.length && order.items.every(item => isAmount(item.lineTotal))
      ? order.items.reduce((sum, item) => sum + minor(item.lineTotal), 0) / 100
      : undefined;
  return {
    subtotal, deliveryFee, deliveryDates, dates, savedDays,
    discount: isAmount(totals?.discountTotal) ? totals.discountTotal : undefined,
    finalTotal: order.hasSavedCommunicationTotal !== false && isAmount(order.total) ? order.total : undefined,
    currency: totals?.currency ?? order.currency
  };
}
