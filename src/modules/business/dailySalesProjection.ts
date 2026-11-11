/**
 * Read-only daily sales projection. Does not write to orders or accounting.
 * Monetary values are allocated in integer sen to avoid rounding drift.
 */
export interface DailySalesItem {
  quantity: number;
  lineTotal: number;
}
export interface DailySalesFulfilment {
  id: string;
  allocations: Array<{ itemIndex: number; quantity: number; componentDay?: string }>;
}
export interface DailySalesOrder {
  id: string;
  total: number;
  items: DailySalesItem[];
  totals?: { discountedMerchandiseTotal?: number; deliveryFee?: number };
  payment: { status: string; refundedAmountMinor?: number };
  fulfilmentStatus: string;
  completedAt?: string;
  fulfilments?: DailySalesFulfilment[];
  fulfilmentCompletion?: Record<string, { completedAt: string }>;
  weeklyFulfilments?: Array<{ day: string; quantity?: number }>;
  weeklyCompletion?: Record<string, { completedAt: string }>;
}
export interface DailySalesEntry {
  key: string;
  orderId: string;
  fulfilmentId: string;
  completedAt: string;
  itemQuantity: number;
  merchandiseMinor: number;
  deliveryMinor: number;
  totalMinor: number;
}
const minor = (value: number) => Math.round(value * 100);
const distribute = (amount: number, weights: number[]): number[] => {
  if (!weights.length) return [];
  const safe = weights.map(weight => Math.max(0, weight));
  const sum = safe.reduce((a, b) => a + b, 0);
  const bases = sum ? safe.map(weight => Math.floor(amount * weight / sum)) : safe.map(() => Math.floor(amount / safe.length));
  let remainder = amount - bases.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % bases.length) { bases[i]++; remainder--; }
  return bases;
};
export const projectDailySales = (order: DailySalesOrder): DailySalesEntry[] => {
  if (order.payment.status !== 'paid' || order.fulfilmentStatus === 'Cancelled') return [];
  const deliveryMinor = minor(Math.max(0, order.totals?.deliveryFee ?? 0));
  const merchandiseMinor = minor(Math.max(0, order.totals?.discountedMerchandiseTotal ?? (order.total - deliveryMinor / 100)));
  const refundMinor = Math.min(merchandiseMinor + deliveryMinor, Math.max(0, order.payment.refundedAmountMinor ?? 0));
  const refundAllocation = distribute(refundMinor, [merchandiseMinor, deliveryMinor]);
  const netMerchandise = merchandiseMinor - refundAllocation[0];
  const netDelivery = deliveryMinor - refundAllocation[1];
  const source = order.fulfilments?.length
    ? order.fulfilments.map(day => ({
        id: day.id,
        completedAt: order.fulfilmentCompletion?.[day.id]?.completedAt,
        quantity: day.allocations.reduce((sum, a) => sum + Math.max(0, a.quantity), 0),
        weight: day.allocations.reduce((sum, a) => sum + Math.max(0, a.quantity) * Math.max(0, order.items[a.itemIndex]?.lineTotal ?? 0) / Math.max(1, order.items[a.itemIndex]?.quantity ?? 1), 0)
      }))
    : order.weeklyFulfilments?.length
      ? order.weeklyFulfilments.map(day => ({
          id: day.day, completedAt: order.weeklyCompletion?.[day.day]?.completedAt,
          quantity: Math.max(0, day.quantity ?? 1), weight: Math.max(0, day.quantity ?? 1)
        }))
      : [{ id: 'single', completedAt: order.fulfilmentStatus === 'Completed' ? order.completedAt : undefined,
           quantity: order.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0),
           weight: 1 }];
  // Allocate against ALL scheduled days, not just completed ones.
  const merch = distribute(netMerchandise, source.map(day => day.weight));
  const delivery = distribute(netDelivery, source.map(day => day.weight));
  return source.flatMap((day, index) => day.completedAt ? [{
    key: `${order.id}:${day.id}`, orderId: order.id, fulfilmentId: day.id,
    completedAt: day.completedAt, itemQuantity: day.quantity,
    merchandiseMinor: merch[index], deliveryMinor: delivery[index],
    totalMinor: merch[index] + delivery[index]
  }] : []);
};
