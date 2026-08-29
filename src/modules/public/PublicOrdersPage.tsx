import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ReceiptText, UsersRound } from 'lucide-react';
import { formatRegionCurrency } from '../../regions';
import { customerOrderService } from '../store/services';
import type { CustomerStoreOrderSummary } from '../store/types';

const formatOrderDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const paymentLabel = (value: string) => value.replaceAll('_', ' ');

export default function PublicOrdersPage({ currentUser }: { currentUser: User | null }) {
  const [orders, setOrders] = useState<CustomerStoreOrderSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setOrders([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    customerOrderService.listMine()
      .then(result => {
        if (!cancelled) {
          setOrders(result);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrders([]);
          setStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  if (!currentUser) {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-surface-container-high bg-white p-8 text-center shadow-sm">
        <ReceiptText className="mx-auto h-10 w-10 text-secondary" />
        <h1 className="mt-4 font-display text-4xl font-bold text-primary">My Orders</h1>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Sign in to view orders placed with your MiseChef account.</p>
        <a href={`/login?returnTo=${encodeURIComponent('/orders')}`} className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary">Login</a>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-3xl bg-primary p-7 text-on-primary">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-on-primary/70">MiseChef account</p>
        <h1 className="mt-2 font-display text-4xl font-bold">My Orders</h1>
        <p className="mt-2 font-sans text-sm font-bold text-on-primary/80">Orders placed while signed in to this account</p>
      </section>

      {status === 'loading' && <div className="h-48 animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading your orders" />}
      {status === 'error' && <p role="alert" className="rounded-3xl bg-surface-container-low p-7 font-sans text-sm font-bold text-error">Your orders could not be loaded. Please try again.</p>}
      {status === 'ready' && orders.length === 0 && <p className="rounded-3xl bg-surface-container-low p-7 font-sans text-sm font-bold text-on-surface-variant">No account-linked orders yet. Guest and historical orders are not claimed automatically.</p>}
      {status === 'ready' && orders.length > 0 && (
        <section aria-label="Your orders" className="grid gap-4 sm:grid-cols-2">
          {orders.map(order => (
            <article key={order.orderNumber} className="rounded-3xl border border-surface-container-high bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-sans text-xs font-extrabold uppercase tracking-wider text-secondary">{order.storeName}</p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-primary">{order.orderNumber}</h2>
                  <p className="mt-1 font-sans text-xs font-bold text-outline">{formatOrderDate(order.orderDate)}</p>
                </div>
                <ReceiptText className="h-5 w-5 shrink-0 text-secondary" />
              </div>
              {order.groupName && <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary/10 px-3 py-2 font-sans text-xs font-extrabold text-secondary"><UsersRound className="h-4 w-4" /> Ordering with {order.groupName}</p>}
              <dl className="mt-5 grid grid-cols-2 gap-4">
                <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Items</dt><dd className="font-sans text-sm font-extrabold text-primary">{order.itemCount}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Total</dt><dd className="font-sans text-sm font-extrabold text-primary">{formatRegionCurrency(order.total, order.currency)}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Payment</dt><dd className="font-sans text-sm font-extrabold capitalize text-primary">{paymentLabel(order.paymentStatus)}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Order status</dt><dd className="font-sans text-sm font-extrabold text-primary">{order.fulfilmentStatus || order.orderStatus}</dd></div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
