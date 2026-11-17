import { useRef, useState } from 'react';
import { storeOrderService } from './services';
import type { StoreOrder } from './types';

export type WeeklyPaymentWorkflow = 'pending' | 'manual' | 'link';

export default function WeeklyPosPaymentActions({ order, slug, stripeEnabled, initialWorkflow = 'pending' }: {
  order: StoreOrder;
  slug: string;
  stripeEnabled: boolean;
  initialWorkflow?: WeeklyPaymentWorkflow;
}) {
  const [showManual, setShowManual] = useState(initialWorkflow === 'manual');
  const [method, setMethod] = useState('bank_transfer');
  const [received, setReceived] = useState(false);
  const [reference, setReference] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'cancelled' | 'paid'>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const paid = order.payment.status === 'paid' || status === 'paid';
  const active = status === 'active' || (status !== 'cancelled' && Boolean(order.weeklyPosLink));
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to update payment.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const link = (action: 'generate' | 'cancel') => run(async () => {
    const result = await storeOrderService.manageWeeklyPosPaymentLink({
      orderId: order.id, action,
      ...(action === 'generate' ? { returnUrl: new URL(`/store/${encodeURIComponent(slug)}`, window.location.origin).toString() } : {}),
    });
    setStatus(result.status);
    setUrl(result.url || '');
    if (result.status === 'cancelled') setMessage('Payment link closed. The order remains pending.');
    setShowManual(false);
  });
  const confirm = () => run(async () => {
    await storeOrderService.confirmManualPosPayment({
      orderId: order.id, expectedRevision: order.manualOrder?.revision,
      amountMinor: order.payment.amountMinor, method, received, reference,
    });
    setStatus('paid');
    setShowManual(false);
  });
  const button = 'rounded border px-3 py-2 font-bold disabled:opacity-50';
  return <section aria-label="Weekly POS payment" className="mt-2 space-y-2 text-sm">
    <p className="font-bold">{order.orderNumber} · {order.currency} {order.total.toFixed(2)} · {paid ? 'Paid' : 'Pending payment'}</p>
    {!paid && !active && initialWorkflow === 'link' && <p>Generate the customer link from this saved order.</p>}
    {!paid && <div className="flex flex-wrap gap-2">
      {(stripeEnabled || active) && <button type="button" className={button} disabled={busy || !slug} onClick={() => void link('generate')}>
        {active ? 'Retrieve Payment Link' : 'Generate Payment Link'}
      </button>}
      {(active || error) && (stripeEnabled || active) && <button type="button" className={button} disabled={busy} onClick={() => void link('cancel')}>Cancel Payment Link</button>}
      {!active && <button type="button" className={button} disabled={busy} onClick={() => setShowManual(value => !value)}>Manual Payment</button>}
    </div>}
    {url && !paid && <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1">Customer payment link
        <input className="mt-1 block w-full rounded border p-2" readOnly value={url} onFocus={event => event.target.select()} />
      </label>
      <button type="button" className={button} disabled={busy} onClick={() => void run(async () => {
        await navigator.clipboard.writeText(url);
        setMessage('Payment link copied.');
      })}>Copy link</button>
    </div>}
    {showManual && !paid && !active && <div className="flex flex-wrap items-end gap-2">
      <label>Payment method
        <select className="ml-1 rounded border p-2" value={method} onChange={event => setMethod(event.target.value)}>
          <option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option>
          <option value="tng">Touch ’n Go</option><option value="fpx">FPX</option><option value="other">Other</option>
        </select>
      </label>
      <label>Payment reference<input className="ml-1 rounded border p-2" value={reference} onChange={event => setReference(event.target.value)} maxLength={120} /></label>
      <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> I received {order.currency} {order.total.toFixed(2)}</label>
      <button type="button" className={button} disabled={busy || !received || !reference.trim()} onClick={() => void confirm()}>Confirm Payment Received</button>
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
