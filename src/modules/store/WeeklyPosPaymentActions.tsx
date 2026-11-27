import { useRef, useState, type ReactNode } from 'react';
import { storeOrderService } from './services';
import type { StoreOrder } from './types';

export type WeeklyPaymentWorkflow = 'pending' | 'manual' | 'link';

export type WeeklyLinkProvider = 'curlec' | 'stripe';

export default function WeeklyPosPaymentActions({ order, slug, providers, initialWorkflow = 'pending', compact = false, children }: {
  order: StoreOrder;
  slug: string;
  providers: WeeklyLinkProvider[];
  initialWorkflow?: WeeklyPaymentWorkflow;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [showManual, setShowManual] = useState(initialWorkflow === 'manual');
  const [method, setMethod] = useState('bank_transfer');
  const [received, setReceived] = useState(false);
  const [reference, setReference] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<WeeklyLinkProvider>();
  const [linkProvider, setLinkProvider] = useState<WeeklyLinkProvider>();
  const [customerEmail, setCustomerEmail] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'cancelled' | 'paid'>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const paid = order.payment.status === 'paid' || status === 'paid';
  const active = status === 'active' || (status !== 'cancelled' && Boolean(order.weeklyPosLink));
  const provider = active ? linkProvider || order.weeklyPosLink?.provider : selectedProvider || providers[0];
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
      orderId: order.id, action, expectedRevision: order.manualOrder?.revision,
      ...(action === 'generate' ? { provider, ...(provider === 'curlec' && !active ? { customerEmail } : {}), returnUrl: new URL(`/store/${encodeURIComponent(slug)}`, window.location.origin).toString() } : {}),
    });
    setStatus(result.status);
    if (result.status === 'active') setLinkProvider(provider);
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
  return <section aria-label="Weekly POS payment" className={compact ? "pos-pending-payment" : "mt-2 space-y-2 text-sm"}>
    {!compact && <>
    {order.payment.curlecEnvironment === 'test' && <p className="font-bold">Curlec Test Mode</p>}
    <p className="font-bold">{order.orderNumber} · {order.currency} {order.total.toFixed(2)} · {paid ? 'Paid' : 'Pending payment'}</p>
    </>}
    <details hidden={compact && !children && !(order.payment.curlecEnvironment === 'test' || (!paid && (active || error || providers.length > 1 || provider === 'curlec' || initialWorkflow === 'link')))} className={compact ? "pos-payment-options" : undefined} open={compact ? undefined : true}>
      <summary hidden={!compact}>{children ? <>More <span aria-hidden="true">⋯</span></> : 'Payment options'}</summary>
      {children && <div className="pos-payment-secondary">{children}</div>}
      {compact && order.payment.curlecEnvironment === 'test' && <p className="font-bold">Curlec Test Mode</p>}
    {!paid && !active && initialWorkflow === 'link' && <p>Generate the customer link from this saved order.</p>}
    {!paid && !active && providers.length > 1 && <label className="block">Payment provider
      <select className="ml-1 rounded border p-2" value={provider} disabled={busy}
        onChange={event => setSelectedProvider(event.target.value as WeeklyLinkProvider)}>
        {providers.map(option => <option key={option} value={option}>{option === 'curlec' ? 'Curlec' : 'Stripe'}</option>)}
      </select>
    </label>}
    {!paid && !active && provider === 'curlec' && <label className="block">Customer email for Curlec
      <input type="email" value={customerEmail} maxLength={254} onChange={event => setCustomerEmail(event.target.value)}
        className="ml-1 rounded border p-2" disabled={busy} />
    </label>}
      {compact && !paid && (active || error) && (providers.length > 0 || active) && <button type="button" className={button} disabled={busy} onClick={() => void link('cancel')}>Cancel Payment Link</button>}
    </details>
    {!paid && <div className="flex flex-wrap gap-2">
      {(providers.length > 0 || active) && <button type="button" className={button} disabled={busy || !slug || (!active && !error && provider === 'curlec' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()))} onClick={() => void link('generate')}>
        {active ? 'Retrieve Payment Link' : 'Generate Payment Link'}
      </button>}
      {!compact && (active || error) && (providers.length > 0 || active) && <button type="button" className={button} disabled={busy} onClick={() => void link('cancel')}>Cancel Payment Link</button>}
      {!active && order.payment.curlecEnvironment !== 'test' && <button type="button" className={button} disabled={busy} onClick={() => setShowManual(value => !value)}>Manual Payment</button>}
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
    {showManual && !paid && !active && order.payment.curlecEnvironment !== 'test' && <div className="flex flex-wrap items-end gap-2">
      <label>Payment method
        <select className="ml-1 rounded border p-2" value={method} onChange={event => setMethod(event.target.value)}>
          <option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option>
          <option value="tng">Touch ’n Go</option><option value="fpx">FPX</option><option value="other">Other</option>
        </select>
      </label>
      <label>Payment reference<input className="ml-1 rounded border p-2" value={reference} onChange={event => setReference(event.target.value)} maxLength={120} /></label>
      <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> I received {compact && order.currency === 'MYR' ? 'RM' : order.currency} {order.total.toFixed(2)}</label>
      <button type="button" className={button} disabled={busy || !received || !reference.trim()} onClick={() => void confirm()}>Confirm Payment Received</button>
    </div>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
