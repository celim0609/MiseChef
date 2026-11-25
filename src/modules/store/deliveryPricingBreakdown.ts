import type { StoreOrder } from './types';

// Read-only projection of accepted snapshots. Never consult today's Store settings.
export interface PricingQuote {
  fee?: number;
  quotationId?: string;
  quotedAt?: string;
  createdAt?: string;
  expiresAt?: string;
}
export interface DeliveryPricingTrip {
  id: string;
  date: string;
  originalMinor?: number;
  quotationId?: string;
  bufferMinor?: number;
  customerMinor?: number;
  maximumExtraMinor?: number;
  latestMinor?: number;
  latestQuotationId?: string;
  latestQuotedAt?: string;
  latestRecordedAt?: string;
  latestExpiresAt?: string;
  latestAmbiguous: boolean;
  actualMinor?: number;
  estimatedBalanceMinor?: number;
  finalBalanceMinor?: number;
  estimateBasis?: 'Latest saved quotation' | 'Original quotation';
  protection: string;
}
const amount = (value: unknown): number | undefined => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? Math.round(n * 100) : undefined;
};
const sen = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;

export function deliveryPricingBreakdown(order: StoreOrder): DeliveryPricingTrip[] {
  const days = order.fulfilments?.length ? order.fulfilments : order.weeklyFulfilments?.length ? order.weeklyFulfilments.map(day => ({ id: day.day, date: day.date, time: day.pickupTime, method: order.fulfilmentMethod || order.delivery?.fulfilmentMethod })) : [{ id: 'single', date: order.delivery?.schedule?.date || order.pickupDate, time: order.delivery?.schedule?.time || order.pickupTime, method: order.fulfilmentMethod || order.delivery?.fulfilmentMethod }];
  return days.filter(day => day.method === 'delivery').map((day, index) => {
    const saved = order.deliveryPricingSnapshot?.days?.find(p => p.date === day.date && (!p.time || p.time === day.time))
      ?? order.delivery?.pricing?.days?.find(p => p.date === day.date && (!p.time || p.time === day.time))
      ?? order.posDeliveryPricing?.days?.find(p => p.date === day.date && (!p.time || p.time === day.time));
    const original = order.delivery?.dayQuotes?.find(q => q.date === day.date)?.quote
      ?? order.posDeliveryPricing?.dayQuotes?.find(q => q.date === day.date && (!q.time || q.time === day.time))?.quote
      ?? (days.length === 1 || index === 0 ? order.deliveryPricingSnapshot?.firstQuote ?? order.delivery?.quote : undefined);
    const originalMinor = amount(original?.fee) ?? amount(saved?.providerDeliveryFee)
      ?? (days.length === 1 ? amount(order.posDeliveryPricing?.providerDeliveryFee) ?? amount(order.delivery?.pricing?.providerDeliveryFee) : undefined);
    const customerMinor = amount(saved?.customerDeliveryFee) ?? (days.length === 1 ? amount(order.totals?.deliveryFee) ?? amount(order.delivery?.pricing?.customerDeliveryFee) ?? amount(order.posDeliveryPricing?.customerDeliveryFee) : undefined);
    const bufferMinor = sen(saved?.collectedBufferMinor);
    const maximumExtraMinor = sen(saved?.maximumExtraCostMinor);
    const operation = order.fulfilmentOperations?.[day.id] ?? (days.length === 1 ? order.delivery : undefined);
    const candidates = [
      operation?.bookingPreview?.quote && { quote: operation.bookingPreview.quote, recordedAt: timestamp(operation.bookingPreview.createdAt) },
      operation?.dispatch?.operationalQuote && { quote: operation.dispatch.operationalQuote, recordedAt: timestamp(operation.dispatch.submissionStartedAt) },
      operation?.dispatch?.requoteFee !== undefined && { quote: { fee: operation.dispatch.requoteFee }, recordedAt: undefined }
    ].filter((v): v is { quote: PricingQuote; recordedAt: string | undefined } => Boolean(v && amount(v.quote.fee) !== undefined));
    // A timestamp is not invented from expiry. Multiple unorderable quotes stay unknown.
    const timed = candidates.map(c => ({ ...c, time: timestamp(c.quote.quotedAt) ?? timestamp(c.quote.createdAt) ?? c.recordedAt }));
    const sameId = candidates.length > 0 && candidates.every(c => c.quote.quotationId && c.quote.quotationId === candidates[0].quote.quotationId);
    const latestAmbiguous = candidates.length > 1 && !sameId && timed.some(c => !c.time);
    const latest = latestAmbiguous ? undefined : [...timed].sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''))[0];
    const latestMinor = amount(latest?.quote.fee);
    const actualMinor = amount(operation?.providerOrder?.priceBreakdown?.total);
    const completed = operation?.lifecycle?.state === 'completed' || operation?.providerOrder?.status === 'COMPLETED';
    const estimate = latestAmbiguous ? undefined : latestMinor ?? originalMinor;
    const protectionCost = actualMinor ?? latestMinor;
    const protection = bufferMinor === undefined || maximumExtraMinor === undefined || originalMinor === undefined
      ? 'Saved protection policy unavailable'
      : protectionCost === undefined ? 'Awaiting latest quotation'
      : protectionCost - originalMinor - bufferMinor > maximumExtraMinor ? `Exceeds saved limit (${actualMinor === undefined ? 'estimate' : 'provider cost'})`
      : `Within saved limit (${actualMinor === undefined ? 'estimate' : 'provider cost'})`;
    return { id: day.id, date: day.date, originalMinor, quotationId: original?.quotationId, bufferMinor, customerMinor, maximumExtraMinor,
      latestMinor, latestQuotationId: latest?.quote.quotationId, latestQuotedAt: timestamp(latest?.quote.quotedAt) ?? timestamp(latest?.quote.createdAt),
      latestRecordedAt: latest?.recordedAt, latestExpiresAt: timestamp(latest?.quote.expiresAt), latestAmbiguous, actualMinor,
      estimatedBalanceMinor: customerMinor !== undefined && estimate !== undefined ? customerMinor - estimate : undefined,
      finalBalanceMinor: completed && actualMinor !== undefined && customerMinor !== undefined ? customerMinor - actualMinor : undefined,
      estimateBasis: estimate === undefined ? undefined : latestMinor !== undefined ? 'Latest saved quotation' : 'Original quotation', protection };
  });
}

export function deliveryPricingTotals(trips: DeliveryPricingTrip[]) {
  const total = (key: keyof DeliveryPricingTrip) => trips.length && trips.every(t => typeof t[key] === 'number')
    ? trips.reduce((sum, trip) => sum + (trip[key] as number), 0) : undefined;
  return { originalMinor: total('originalMinor'), bufferMinor: total('bufferMinor'), customerMinor: total('customerMinor'), maximumExtraMinor: total('maximumExtraMinor'), latestMinor: total('latestMinor'), actualMinor: total('actualMinor'), estimatedBalanceMinor: total('estimatedBalanceMinor'), finalBalanceMinor: total('finalBalanceMinor') };
}
