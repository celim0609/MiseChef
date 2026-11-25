import { useEffect, useState } from 'react';
import { formatRegionCurrency } from '../../regions';
import type { StoreOrder } from './types';
import { deliveryPricingBreakdown, deliveryPricingTotals, type DeliveryPricingTrip } from './deliveryPricingBreakdown';

const balance = (value: number | undefined, money: (value?: number) => string) => value === undefined ? 'Pending / unavailable'
  : value === 0 ? `${money(0)} · balanced` : `${money(Math.abs(value))} ${value > 0 ? 'surplus' : 'subsidy'}`;

export function DeliveryPricingContent({ order }: { order: StoreOrder }) {
  const trips = deliveryPricingBreakdown(order);
  const money = (value?: number) => value === undefined ? 'Unavailable' : formatRegionCurrency(value / 100, order.currency);
  const time = (value?: string) => value ? new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' MYT' : 'Unavailable';
  const fields = (trip: Partial<ReturnType<typeof deliveryPricingTotals>>) => [
    ['Original Lalamove quotation', money(trip.originalMinor)], ['Applied buffer', money(trip.bufferMinor)],
    ['Customer delivery fee', money(trip.customerMinor)], ['Maximum extra cost', money(trip.maximumExtraMinor)],
    ['Latest saved quotation', money(trip.latestMinor)], ['Actual delivery cost', money(trip.actualMinor)],
    ['Estimated subsidy / surplus', balance(trip.estimatedBalanceMinor, money)], ['Final subsidy / surplus', balance(trip.finalBalanceMinor, money)]
  ];
  const grid = (rows: string[][]) => <dl className="grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-on-surface-variant">{label}</dt><dd className="break-words font-bold text-primary">{value}</dd></div>)}</dl>;
  const tripCard = (trip: DeliveryPricingTrip) => <section key={trip.id} className="min-w-0 space-y-3 rounded-xl border border-surface-container-high p-3">
    <h4 className="font-bold text-primary">{trip.date || 'Date unavailable'}</h4>
    {grid(fields(trip))}
    <p className="text-xs font-bold">Price protection: {trip.protection}</p>
    <p className="text-xs text-on-surface-variant">Estimate basis: {trip.estimateBasis || 'Unavailable'}.</p>
    <dl className="space-y-1 break-all text-xs text-on-surface-variant">
      <div><dt className="inline">Original quote ID: </dt><dd className="inline">{trip.quotationId || 'Unavailable'}</dd></div>
      <div><dt className="inline">Latest quote ID: </dt><dd className="inline">{trip.latestQuotationId || 'Unavailable'}</dd></div>
      <div><dt className="inline">Quotation timestamp: </dt><dd className="inline">{time(trip.latestQuotedAt)}</dd></div>
      {trip.latestRecordedAt && <div><dt className="inline">Booking submission recorded: </dt><dd className="inline">{time(trip.latestRecordedAt)} (not quotation time)</dd></div>}
      {trip.latestExpiresAt && <div><dt className="inline">Quote expires: </dt><dd className="inline">{time(trip.latestExpiresAt)}</dd></div>}
    </dl>
    {trip.latestAmbiguous && <p className="text-xs">Multiple saved quotes have no comparable timestamps; latest quotation cannot be determined.</p>}
  </section>;
  return <div className="mt-3 min-w-0 space-y-3 whitespace-normal">
    <p className="text-xs text-on-surface-variant">Accepted pricing snapshots only. Estimates use the latest identifiable saved quote, otherwise the original quote. Actual cost is the recorded provider order cost; final balance requires completed delivery. Missing data is never treated as zero.</p>
    {trips.length > 1 && <section className="space-y-2 rounded-xl bg-surface-container-low p-3"><h4 className="font-bold">All {trips.length} delivery dates · totals</h4>{grid(fields(deliveryPricingTotals(trips)))}<p className="text-xs">Totals are unavailable if any date is missing that value. Maximum extra cost is the sum of separate per-trip limits, not a pooled allowance. Price protection is assessed per date below.</p></section>}
    {trips.map(tripCard)}
    {!trips.length && <p className="text-sm">No saved delivery dates are available.</p>}
  </div>;
}

export default function MerchantDeliveryPricing({ order, orderId, workspaceId, canView = false }: {
  order?: StoreOrder; orderId?: string; workspaceId: string; canView?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<StoreOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoaded(null); setError(''); setLoading(false);
    if (!canView || !open || order || !orderId || !workspaceId) return;
    setLoading(true);
    import('./services').then(({ storeOrderService }) => storeOrderService.getOrder(orderId)).then(record => {
      if (!current) return;
      if (!record || record.workspaceId !== workspaceId) throw new Error('unavailable');
      setLoaded(record);
    }).catch(() => { if (current) setError('Delivery pricing is unavailable in this workspace.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [canView, open, orderId, workspaceId, order]);
  if (!canView || !workspaceId || (order && order.workspaceId !== workspaceId)) return null;
  const record = order || loaded;
  return <details className="my-3 min-w-0 max-w-xl rounded-xl border border-surface-container-high bg-white p-3" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-6 cursor-pointer text-sm font-bold text-primary">Delivery pricing breakdown</summary>
    {open && (loading ? <p role="status" className="mt-3 text-sm">Loading saved pricing…</p> : error ? <p role="alert" className="mt-3 text-sm">{error}</p> : record ? <DeliveryPricingContent order={record} /> : null)}
  </details>;
}
