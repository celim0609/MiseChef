import React, { useState } from 'react';
import type { StoreOrder } from './types';
import DeliveryDispatchAction from './DeliveryDispatchAction';
import { storeDeliveryService, type MerchantDeliveryPreview } from './services/deliveryService';

export default function ManualDeliveryBooking({order, fulfilmentId, disabled = false, onUpdated}: {order: StoreOrder; fulfilmentId: string; disabled?: boolean; onUpdated?: () => void}) {
  const [preview, setPreview] = useState<MerchantDeliveryPreview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [bookingId, setBookingId] = useState('');
  const operation = order.fulfilmentOperations?.[fulfilmentId];
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch(e) { setError(e instanceof Error ? e.message : 'Unable to manage Lalamove. Refresh before trying again.'); } finally { setBusy(false); } };
  if (order.payment.status !== 'paid' || order.manualOrder) return null;
  return <div className="mt-3">
    <DeliveryDispatchAction order={order} fulfilmentId={fulfilmentId} isUpdating={busy || disabled} onDispatch={() => { void run(async () => { setPreview(null); setPreview(await storeDeliveryService.preview(order.id, fulfilmentId)); }); }} />
    {preview && <section role="dialog" aria-modal="true" aria-label="Review Lalamove booking" className="rounded-xl border-2 bg-white p-4 text-slate-950">
      <h3 className="font-bold">Review Lalamove booking</h3>
      <p>Service: {preview.serviceType}</p><p>Pickup: {preview.pickupAddress}</p><p>Drop-off: {preview.dropoffAddress}</p>
      <p>Delivery: {preview.date} {preview.time} MYT</p><p>Booking: {preview.bookingTime}</p>
      <p>Quotation: {preview.quotationId}</p><p>Estimated cost: {preview.currency} {preview.estimatedCost.toFixed(2)}</p><p>Expires: {new Date(preview.expiresAt).toLocaleString('en-MY', {timeZone: 'Asia/Kuala_Lumpur'})} MYT</p>
      <p>This books a paid delivery with Lalamove. The customer’s paid order total stays unchanged.</p>
      <button type="button" disabled={busy || disabled || Date.parse(preview.expiresAt) <= Date.now() + 5000} className="m-2 rounded-lg bg-blue-600 p-3 font-bold text-white disabled:opacity-50" onClick={() => { void run(async () => { const result = await storeDeliveryService.dispatch(order.id, fulfilmentId, preview.id); setPreview(null); onUpdated?.(); if (result.status === 'outcome_unknown') setError('Booking outcome is uncertain. Reconcile the existing request; do not submit a replacement.'); else if (result.status === 'dispatch_blocked_requote') setError('Booking blocked by the delivery fee absorption limit.'); }); }}>Confirm Lalamove booking</button>
      <button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
    </section>}
    {operation?.providerOrder?.orderId && <p>Booking ID: {operation.providerOrder.orderId}</p>}
    {operation?.dispatch?.status === 'outcome_unknown' && <div role="status"><p>Booking outcome uncertain. Do not submit a replacement. Reconcile the existing request first.</p>
      {operation.dispatch.providerCode === 'ERR_INSUFFICIENT_CREDIT' ? <p>Lalamove rejected this request: insufficient wallet credit. Reconciliation records that rejection; it does not book again.</p> : <><p>Find the existing booking in Lalamove history or ask support using Request ID: {operation.dispatch.requestId || 'not recorded'}. Enter its Booking ID to verify the exact quotation.</p><input aria-label="Existing Lalamove booking ID" value={bookingId} onChange={event => setBookingId(event.target.value)} /></>}
      <button type="button" disabled={busy || disabled} className="m-2 rounded-lg border p-3" onClick={() => { void run(async () => { await storeDeliveryService.reconcile(order.id, fulfilmentId, bookingId || undefined); onUpdated?.(); }); }}>Reconcile existing request</button>
    </div>}
    {operation?.dispatch?.providerCode === 'ERR_INSUFFICIENT_CREDIT' && operation.dispatch.status === 'failed' && <p role="alert">Lalamove wallet has insufficient credit. Top up the correct account before requesting a new quotation.</p>}
    {['created', 'outcome_unknown', 'cancel_requested'].includes(operation?.dispatch?.status || '') && <button type="button" disabled={busy || disabled} className="m-2 rounded-lg border p-3" onClick={() => { void run(async () => { await storeDeliveryService.refresh(order.id, fulfilmentId); onUpdated?.(); }); }}>Refresh Lalamove status</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
