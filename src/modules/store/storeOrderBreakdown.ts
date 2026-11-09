import { canonicalFulfilmentMethod, canonicalOrderFulfilmentLabel } from '../../../functions/storeFulfilmentCanonical.js';
import { getOrderTickets } from './orderTickets';
import type { StoreOrder } from './types';

export const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const minor = (value: number) => Math.round(value * 100);

export function getStoreOrderBreakdown(order: StoreOrder) {
  const { totals, deliveryPricingSnapshot: snapshot } = order;
  const pricing = order.delivery?.pricing;
  const posPricing = order.posDeliveryPricing;
  const savedDays = [posPricing?.days, snapshot?.days, pricing?.days]
    .find(days => Array.isArray(days) && days.length > 0) ?? [];
  const isPickup = canonicalOrderFulfilmentLabel(order) === 'Pickup';
  const scheduledDays = isPickup ? [] : order.fulfilments?.length ? order.fulfilments : getOrderTickets(order);
  const deliveryDates = scheduledDays.filter(day => canonicalFulfilmentMethod(order, day) === 'delivery').map(day => day.date);
  const dates = isPickup ? [] : [...new Set([...deliveryDates, ...savedDays.map(day => day.date)].filter(Boolean))].sort();
  const deliveryFee = isPickup ? 0 : [
    totals?.deliveryFee, posPricing?.customerDeliveryFee, snapshot?.finalDeliveryTotal, pricing?.customerDeliveryFee, snapshot?.customerDeliveryFee
  ].find(isAmount);
  const subtotal = isAmount(totals?.merchandiseSubtotal) ? totals.merchandiseSubtotal
    : order.items.length && order.items.every(item => isAmount(item.lineTotal))
      ? order.items.reduce((sum, item) => sum + minor(item.lineTotal), 0) / 100
      : undefined;
  const dailyDeliveryFees = dates.length > 1 ? dates.map(date => {
    const charges = savedDays.filter(day => day.date === date).map(day => day.customerDeliveryFee);
    const expected = deliveryDates.filter(day => day === date).length;
    const amount = charges.length && (!expected || charges.length === expected) && charges.every(isAmount)
      ? charges.reduce((sum, charge) => sum + minor(charge), 0) / 100
      : undefined;
    return { date, amount };
  }) : [];
  return {
    subtotal, deliveryFee, dailyDeliveryFees,
    discount: isAmount(totals?.discountTotal) ? totals.discountTotal : undefined,
    finalTotal: order.hasSavedCommunicationTotal !== false && isAmount(order.total) ? order.total : undefined,
    currency: totals?.currency ?? order.currency
  };
}
