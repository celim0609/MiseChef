import type { StoreDeliveryProvider, StoreOrder } from '../store/types';

type OrderItem = Pick<StoreOrder['items'][number], 'quantity' | 'lineTotal' | 'weeklyPlanSnapshot'>  & Partial<Pick<StoreOrder['items'][number], 'productId' | 'productName' | 'basePrice'>>;
type Allocation = { itemIndex: number; quantity: number; componentDay?: string };

export interface DailySalesOrder {
  id: string;
  orderNumber?: string;
  orderSource?: StoreOrder['orderSource'];
  externalOrder?: StoreOrder['externalOrder'];
  paymentMethodId?: string;
  paymentMethodName?: string;
  total: number;
  items: OrderItem[];
  totals?: { discountedMerchandiseTotal?: number; deliveryFee?: number; discountTotal?: number; merchandiseSubtotal?: number };
  payment: { status: string; refundedAmountMinor?: number; refundStatus?: string };
  fulfilmentStatus: string;
  completedAt?: string;
  fulfilmentMethod?: StoreOrder['fulfilmentMethod'];
  pickupDate?: string;
  createdAt?: string;
  delivery?: StoreOrder['delivery'];
  posDeliveryPricing?: StoreOrder['posDeliveryPricing'];
  deliveryPricingSnapshot?: StoreOrder['deliveryPricingSnapshot'];
  promotionSnapshot?: StoreOrder['promotionSnapshot'];
  fulfilmentOperations?: StoreOrder['fulfilmentOperations'];
  fulfilments?: Array<{ id: string; date?: string; time?: string; method?: string; allocations: Allocation[] }>;
  fulfilmentCompletion?: Record<string, { completedAt: string }>;
  weeklyFulfilments?: Array<{ day: string; date?: string; quantity?: number }>;
  weeklyCompletion?: Partial<Record<string, { completedAt: string }>>;
}

export interface DailyDeliveryRecord {
  orderId: string;
  orderNumber?: string;
  fulfilmentId: string;
  date: string;
  provider?: StoreDeliveryProvider;
  status: string;
  trackingReference?: string;
  customerFeeMinor: number;
  actualCostMinor?: number;
  quotedCostMinor?: number;
  subsidyMinor?: number;
}

export interface DailySalesEntry {
  key: string;
  orderId: string;
  fulfilmentId: string;
  completedAt: string;
  scheduledDate?: string;
  orderDate?: string;
  orderNumber: string;
  source: 'Store' | 'POS' | 'Walk-in';
  paymentMethodId: string;
  paymentMethod: string;
  paymentStatus: string;
  refundStatus?: string;
  fulfilmentStatus: string;
  recognized: boolean;
  items: Array<{ name: string; quantity: number; focQuantity: number }>;
  focQuantity: number;
  grossMinor: number;
  discountMinor: number;
  itemQuantity: number;
  merchandiseMinor: number;
  deliveryMinor: number;
  refundMinor: number;
  totalMinor: number;
}

type SalesDay = {
  id: string;
  date?: string;
  time?: string;
  completedAt?: string;
  method?: string;
  allocations: Allocation[];
};

const minor = (value: number | undefined) => {
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) ? Math.max(0, amount) : 0;
};
const count = (value: number) => Number.isSafeInteger(value) ? Math.max(0, value) : 0;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const distribute = (amount: number, weights: number[]): number[] => {
  if (!weights.length) return [];
  const totalWeight = sum(weights);
  const denominator = BigInt(totalWeight || weights.length);
  const shares = weights.map((weight, index) => {
    const numerator = BigInt(amount) * BigInt(totalWeight ? weight : 1);
    return { index, base: Number(numerator / denominator), remainder: numerator % denominator };
  });
  const unallocated = amount - sum(shares.map(share => share.base));
  const result = shares.map(share => share.base);
  shares.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  shares.slice(0, unallocated).forEach(share => { result[share.index]++; });
  return result;
};

const getDays = (order: DailySalesOrder): SalesDay[] => {
  if (order.fulfilments?.length) {
    return [...new Map(order.fulfilments.map(day => [day.id, day])).values()]
      .map(day => ({ ...day, completedAt: order.fulfilmentCompletion?.[day.id]?.completedAt }));
  }
  if (order.weeklyFulfilments?.length) {
    return [...new Map(order.weeklyFulfilments.map(day => [day.day, day])).values()].map(day => ({
      id: day.day,
      date: day.date,
      completedAt: order.weeklyCompletion?.[day.day]?.completedAt,
      allocations: [{ itemIndex: 0, quantity: day.quantity ?? order.items[0]?.quantity ?? 1, componentDay: day.day }]
    }));
  }
  return [{
    id: 'single',
    date: order.delivery?.schedule?.date || order.pickupDate,
    completedAt: order.fulfilmentStatus === 'Completed' ? order.completedAt : undefined,
    allocations: order.items.map((item, itemIndex) => ({ itemIndex, quantity: item.quantity }))
  }];
};

const getSavedDeliveryDays = (order: DailySalesOrder) => (
  [order.posDeliveryPricing?.days, order.deliveryPricingSnapshot?.days, order.delivery?.pricing?.days]
    .find(days => days?.length)
);

const getLineAdjustment = (order: DailySalesOrder, index: number) => {
  const item = order.items[index];
  const adjustment = order.promotionSnapshot?.lineAdjustments?.[index];
  return adjustment && adjustment.productId === item.productId
    && adjustment.quantity === item.quantity && minor(adjustment.originalLineTotal) === minor(item.lineTotal)
    ? adjustment : undefined;
};

const getMerchandiseShares = (order: DailySalesOrder, days: SalesDay[], total: number) => {
  const pricing = getSavedDeliveryDays(order);
  const savedDays = days.map(day => pricing?.find(price => price.date === day.date));
  const savedShares = savedDays.map(day => minor(day?.merchandiseSubtotal));
  if (savedDays.every(day => day?.merchandiseSubtotal !== undefined) && sum(savedShares) === total) return savedShares;
  const lineWeights = order.items.map((item, index) => minor(getLineAdjustment(order, index)?.finalLineTotal ?? item.lineTotal));
  const lineAmounts = distribute(total, lineWeights);
  const shares = days.map(() => 0);
  order.items.forEach((item, itemIndex) => {
    const allocations = days.flatMap((day, index) => day.allocations
      .filter(allocation => allocation.itemIndex === itemIndex)
      .map(allocation => ({ ...allocation, index })));
    const extras = allocations.map(allocation => {
      const meal = item.weeklyPlanSnapshot?.meals.find(meal => meal.day === allocation.componentDay);
      return Math.round(meal?.optionSurchargeUnitMinor || 0) * count(allocation.quantity);
    });
    const base = lineAmounts[itemIndex] - sum(extras);
    const baseShares = distribute(Math.max(0, base), allocations.map(allocation => count(allocation.quantity)));
    allocations.forEach((allocation, index) => {
      shares[allocation.index] += Math.max(0, baseShares[index] + extras[index]);
    });
  });
  // Reconcile older snapshots with incomplete line details to the charged total.
  return sum(shares) === total ? shares : distribute(total, shares);
};

const getDeliveryShares = (order: DailySalesOrder, days: SalesDay[], total: number) => {
  const pricing = getSavedDeliveryDays(order);
  const charges = days.map(day => pricing?.find(price => price.date === day.date)?.customerDeliveryFee);
  const weights = charges.map(minor);
  const savedTotal = sum(weights);
  if (savedTotal === total) return weights;
  const deliveryDays = days.map(day => Number(day.method === 'delivery' || (!day.method && order.fulfilmentMethod === 'delivery')));
  const missing = deliveryDays.map((weight, index) => charges[index] === undefined ? weight : 0);
  if (savedTotal < total && sum(missing) > 0) {
    return distribute(total - savedTotal, missing).map((share, index) => share + weights[index]);
  }
  return distribute(total, savedTotal > 0 ? weights : deliveryDays);
};

const getDeliveryTotal = (order: DailySalesOrder) => Math.min(minor(order.total), minor(
  order.totals?.deliveryFee ?? order.posDeliveryPricing?.customerDeliveryFee
    ?? order.deliveryPricingSnapshot?.finalDeliveryTotal ?? order.delivery?.pricing?.customerDeliveryFee
    ?? order.deliveryPricingSnapshot?.customerDeliveryFee
    ?? (order.totals?.discountedMerchandiseTotal === undefined
      ? 0 : order.total - order.totals.discountedMerchandiseTotal)
));

const getLineFocQuantity = (order: DailySalesOrder, index: number) => {
  const item = order.items[index];
  const adjustment = getLineAdjustment(order, index);
  if (item.lineTotal === 0 || adjustment?.finalLineTotal === 0) return count(item.quantity);
  const promotion = order.promotionSnapshot?.appliedPromotions?.find(p => p.promotionId === adjustment?.promotionId);
  const buy = count(promotion?.terms.buyQuantity ?? 0);
  const free = count(promotion?.terms.getQuantity ?? 0);
  if (promotion?.type !== 'buy_x_get_y' || !buy || !free || minor(item.lineTotal) !== minor(item.basePrice) * item.quantity) return 0;
  return Math.floor(item.quantity / (buy + free)) * free;
};

const getSalesDetails = (order: DailySalesOrder, days: SalesDay[], netMerchandise: number[]) => {
  const products: DailySalesEntry['items'][] = days.map(() => []);
  const discountWeights = days.map(() => 0);
  order.items.forEach((item, itemIndex) => {
    const allocations = days.flatMap((day, index) => day.allocations
      .filter(allocation => allocation.itemIndex === itemIndex)
      .map(allocation => ({ ...allocation, index })));
    const weights = allocations.map(allocation => count(allocation.quantity));
    const discount = distribute(minor(getLineAdjustment(order, itemIndex)?.discountAmount), weights);
    const foc = distribute(Math.min(getLineFocQuantity(order, itemIndex), sum(weights)), weights);
    allocations.forEach((allocation, index) => {
      const meal = item.weeklyPlanSnapshot?.meals.find(entry => entry.day === allocation.componentDay);
      products[allocation.index].push({
        name: meal?.productName || item.productName || 'Unnamed item',
        quantity: weights[index],
        focQuantity: foc[index]
      });
      discountWeights[allocation.index] += discount[index];
    });
  });
  const savedDiscount = sum(discountWeights);
  const subtotal = order.totals?.merchandiseSubtotal;
  const totalDiscount = order.totals?.discountTotal ?? (subtotal === undefined ? undefined : subtotal - sum(netMerchandise) / 100);
  const discounts = distribute(totalDiscount === undefined ? savedDiscount : minor(totalDiscount),
    savedDiscount ? discountWeights : netMerchandise);
  return { products, discounts };
};

export const projectOrderSalesRecords = (order: DailySalesOrder): DailySalesEntry[] => {
  const days = getDays(order);
  const total = minor(order.total);
  const deliveryTotal = getDeliveryTotal(order);
  const merchandise = getMerchandiseShares(order, days, total - deliveryTotal);
  const delivery = getDeliveryShares(order, days, deliveryTotal);
  const refund = order.payment.refundStatus === 'refunded' ? total
    : Math.min(total, count(Math.round(order.payment.refundedAmountMinor || 0)));
  // Allocate refunds over the original charges so the adjustment stays on each completion date.
  const refunds = distribute(refund, [...merchandise, ...delivery]);
  const { products, discounts } = getSalesDetails(order, days, merchandise);
  const source = order.orderSource === 'pos' ? (order.externalOrder?.source === 'walk_in' ? 'Walk-in' : 'POS') : 'Store';
  return days.map((day, index) => {
    const completedAt = day.completedAt && /(?:Z|[+-]\d{2}:\d{2})$/i.test(day.completedAt)
      && Number.isFinite(Date.parse(day.completedAt)) ? day.completedAt : '';
    const fulfilmentStatus = order.fulfilmentStatus === 'Cancelled' ? 'Cancelled'
      : day.completedAt || order.fulfilmentStatus === 'Completed' ? 'Completed'
        : order.fulfilmentOperations?.[day.id]?.kitchenStatus || order.fulfilmentStatus || 'Pending';
    const recognized = Boolean(completedAt) && fulfilmentStatus === 'Completed' && order.payment.status === 'paid';
    const merchandiseMinor = recognized ? merchandise[index] - refunds[index] : 0;
    const deliveryMinor = recognized ? delivery[index] - refunds[index + days.length] : 0;
    return {
      key: JSON.stringify([order.id, day.id]),
      orderId: order.id,
      fulfilmentId: day.id,
      completedAt,
      scheduledDate: day.date,
      orderDate: order.createdAt,
      orderNumber: order.orderNumber || order.id,
      source,
      paymentMethodId: order.paymentMethodId || order.paymentMethodName || '',
      paymentMethod: order.paymentMethodName || order.paymentMethodId || 'Unknown',
      paymentStatus: order.payment.status,
      refundStatus: order.payment.refundStatus,
      fulfilmentStatus,
      recognized,
      items: products[index],
      focQuantity: sum(products[index].map(item => item.focQuantity)),
      grossMinor: merchandise[index] + delivery[index] + discounts[index],
      discountMinor: discounts[index],
      itemQuantity: sum(day.allocations.map(allocation => count(allocation.quantity))),
      merchandiseMinor,
      deliveryMinor,
      refundMinor: recognized ? refunds[index] + refunds[index + days.length] : 0,
      totalMinor: merchandiseMinor + deliveryMinor
    };
  });
};

export const projectDailySales = (order: DailySalesOrder) => projectOrderSalesRecords(order).filter(entry => entry.recognized);

export const projectDailyDeliveries = (order: DailySalesOrder): DailyDeliveryRecord[] => {
  const days = getDays(order);
  const fees = getDeliveryShares(order, days, getDeliveryTotal(order));
  const pricing = getSavedDeliveryDays(order);
  return days.flatMap((day, index) => {
    if ((day.method || order.fulfilmentMethod || order.delivery?.fulfilmentMethod) !== 'delivery') return [];
    const operation = order.fulfilmentOperations?.[day.id] ?? (days.length === 1 ? order.delivery : undefined);
    const providerOrder = operation?.providerOrder;
    const actualCost = providerOrder?.priceBreakdown?.total;
    const savedTrip = pricing?.find(price => price.date === day.date && (!price.time || price.time === day.time));
    const customerFeeMinor = savedTrip?.customerDeliveryFee === undefined ? fees[index] : minor(savedTrip.customerDeliveryFee);
    const quotedCost = savedTrip?.providerDeliveryFee
      ?? (days.length === 1 ? order.posDeliveryPricing?.providerDeliveryFee : undefined)
      ?? order.delivery?.pricing?.providerDeliveryFee ?? order.delivery?.quote?.fee;
    const actualCostMinor = actualCost != null && String(actualCost).trim() && Number.isFinite(Number(actualCost))
      ? minor(Number(actualCost)) : undefined;
    const quotedCostMinor = quotedCost === undefined ? undefined : minor(quotedCost);
    const cost = actualCostMinor ?? quotedCostMinor;
    return [{
      orderId: order.id,
      fulfilmentId: day.id,
      orderNumber: order.orderNumber,
      date: day.date || day.completedAt || (order.delivery?.fulfilmentMode === 'instant' ? order.createdAt : '') || '',
      provider: operation?.provider ?? order.delivery?.provider
        ?? (order.delivery?.quote?.quotationId ? 'lalamove' : undefined),
      status: order.fulfilmentStatus === 'Cancelled' ? 'Cancelled'
        : operation?.lifecycle?.state || providerOrder?.status || operation?.dispatch?.status
          || (day.completedAt ? 'Completed' : 'Pending'),
      trackingReference: providerOrder?.orderId,
      customerFeeMinor,
      actualCostMinor,
      quotedCostMinor,
      subsidyMinor: cost === undefined ? undefined : Math.max(0, cost - customerFeeMinor)
    }];
  });
};
