import { useEffect, useState } from 'react';
import { businessService } from '../../services';
import { storeOrderService } from '../../../store/services';
import type { StoreOrder } from '../../../store/types';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import { formatRegionCurrency, useWorkspaceRegion } from '../../../../regions';
import { getBusinessDashboardPeriodRange, type BusinessAccountingReport } from '../../accounting';
import { getBusinessDateKey } from '../../purchaseKpi';
import DeliveryRecords from './DeliveryRecords';

const headings = ['Order', 'Source', 'Order date', 'Scheduled fulfilment', 'Actual handover', 'Completion action', 'Products', 'Gross', 'Discounts', 'FOC quantity', 'Net merchandise', 'Net delivery', 'Refunds', 'Recognized sales', 'Payment method', 'Payment status', 'Fulfilment status'];
const controlClass = 'mt-1 block w-full rounded-xl border border-surface-container-high bg-white px-3 py-2';
const tableClass = 'w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3';
const displayStatus = (value: string) => value.replaceAll('_', ' ');

function OriginalOrder({ orderId, workspaceId, fulfilmentId, timeZone }: {
  orderId: string;
  workspaceId: string;
  fulfilmentId: string;
  timeZone: string;
}) {
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setOrder(null);
    storeOrderService.getOrder(orderId).then(record => {
      if (current && record?.workspaceId === workspaceId) setOrder(record);
    }).catch(() => undefined).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [orderId, workspaceId]);

  if (loading) return <p role="status">Loading original order…</p>;
  if (!order) return <p role="alert">The original order is unavailable in this workspace.</p>;
  const day = order.fulfilments?.find(entry => entry.id === fulfilmentId);
  const weekly = order.weeklyFulfilments?.find(entry => entry.day === fulfilmentId);
  const completion = day ? order.fulfilmentCompletion?.[day.id]?.completedAt
    : weekly ? order.weeklyCompletion?.[weekly.day]?.completedAt : order.completedAt;
  const formatTimestamp = new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: 'medium', timeStyle: 'long' });
  return (
    <section aria-labelledby="original-order" className="space-y-3 rounded-2xl border border-surface-container-high bg-white p-5">
      <h3 id="original-order" className="font-display text-xl font-bold text-primary">Original order {order.orderNumber || order.id}</h3>
      <p className="text-sm">Order ID {order.id} · Fulfilment {fulfilmentId || 'single'}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="font-bold">Scheduled date</dt><dd>{day?.date || weekly?.date || order.delivery?.schedule?.date || order.pickupDate || '—'}</dd></div>
        <div><dt className="font-bold">Completion action</dt><dd>{completion && Number.isFinite(Date.parse(completion)) ? <time dateTime={completion}>{formatTimestamp.format(new Date(completion))}</time> : '—'}</dd></div>
        <div><dt className="font-bold">Original order total</dt><dd>{formatRegionCurrency(order.total, order.currency)}</dd></div>
      </dl>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {order.items.map((item, index) => (
          <li key={index}>{item.quantity} × {item.productName} · {formatRegionCurrency(item.lineTotal, order.currency)}</li>
        ))}
      </ul>
    </section>
  );
}

export default function BusinessSalesPage({ userId, workspaceId }: { userId?: string; workspaceId?: string }) {
  const region = useWorkspaceRegion();
  const workspace = workspaceId || userId || '';
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const view = params.get('view') || 'sales';
  const [range, setRange] = useState(() => {
    const defaults = getBusinessDashboardPeriodRange({ period: 'this-month', now: new Date(), timeZone: region.timeZone })!;
    return { from: params.get('from') || defaults.from, to: params.get('to') || defaults.to };
  });
  const [report, setReport] = useState<BusinessAccountingReport | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let current = true;
    setReport(null);
    setError('');
    if (!workspace) return;
    const validRange = getBusinessDashboardPeriodRange({
      period: 'custom', now: new Date(), timeZone: region.timeZone, customFrom: range.from, customTo: range.to
    });
    if (!validRange) {
      setError('Choose a valid start and end date.');
      return;
    }
    businessService.getSalesReport(workspace, validRange, region.timeZone).then(result => {
      if (current) setReport(result);
    }).catch(err => {
      if (current) setError(getCustomerFriendlyErrorMessage(err, 'Unable to load sales records.'));
    });
    return () => { current = false; };
  }, [workspace, range.from, range.to, region.timeZone]);

  const link = (target: string, orderId = '', fulfilment = '') => {
    const query = new URLSearchParams({ ...range, view: target });
    if (orderId) {
      query.set('order', orderId);
      query.set('fulfilment', fulfilment);
    }
    return '/app/business/sales?' + query.toString();
  };
  const money = (amount: number) => formatRegionCurrency(amount, region.currency);
  const minor = (amount: number) => money(amount / 100);
  const timestamp = new Intl.DateTimeFormat(undefined, { timeZone: region.timeZone, dateStyle: 'medium', timeStyle: 'long' });
  const allRecords = report?.salesRecords || [];
  const methods = [...new Map(allRecords.map(entry => [entry.paymentMethodId || 'unknown', entry.paymentMethod])).entries()];
  const statuses = [...new Set(allRecords.map(entry => entry.fulfilmentStatus))].sort();
  const records = allRecords.filter(entry => (!source || entry.source === source)
    && (!paymentMethod || (entry.paymentMethodId || 'unknown') === paymentMethod)
    && (!status || entry.fulfilmentStatus === status));
  const selectedOrder = params.get('order');
  const legacyTotal = report?.salesTrend.reduce((total, day) => total + Math.round(day.legacySales * 100), 0) ?? 0;
  const recognizedTotal = records.reduce((total, entry) => total + entry.totalMinor, 0);

  return (
    <div className="space-y-5">
      <header className="space-y-3 rounded-2xl bg-surface-container-low p-6">
        <h2 className="font-display text-3xl font-bold text-primary">Sales Records</h2>
        <nav aria-label="Sales records views" className="flex flex-wrap gap-4 text-sm font-bold">
          {[['sales', 'Transactions'], ['deliveries', 'Delivery Records'], ['legacy', 'Legacy Manual Sales']].map(([id, label]) => (
            <a className="underline" key={id} href={link(id)} aria-current={view === id ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </header>

      <div className="grid gap-3 rounded-2xl border border-surface-container-high p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-bold">From<input className={controlClass} type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-sm font-bold">To<input className={controlClass} type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
        {view === 'sales' && <>
          <label className="text-sm font-bold">Order source<select className={controlClass} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All sources</option>{['Store', 'POS', 'Walk-in'].map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label className="text-sm font-bold">Payment method<select className={controlClass} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="">All methods</option>{methods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label className="text-sm font-bold">Fulfilment status<select className={controlClass} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}
          </select></label>
        </>}
      </div>

      {selectedOrder && workspace && <OriginalOrder orderId={selectedOrder} workspaceId={workspace} fulfilmentId={params.get('fulfilment') || ''} timeZone={region.timeZone} />}
      {error ? <p role="alert" className="text-error">{error}</p> : !report ? <p role="status">Loading sales records…</p> : view === 'deliveries' ? (
        <DeliveryRecords deliveries={report.deliveries} formatMoney={money} orderLink={(id, fulfilment) => link('deliveries', id, fulfilment)} />
      ) : view === 'legacy' ? (
        <section className="space-y-3 rounded-2xl border border-surface-container-high bg-white p-5">
          <h3 className="font-display text-xl font-bold">Legacy Manual Sales</h3>
          <p className="text-sm">Read-only entries included in the dashboard total for the selected dates. Total {minor(legacyTotal)}.</p>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-surface-container-low"><tr>{['Date', 'Amount', 'Notes'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{report.legacySales.map(sale => <tr key={sale.id} className="border-b border-surface-container-high"><td>{sale.date}</td><td>{minor(Math.round(sale.amount * 100))}</td><td>{sale.notes || '—'}</td></tr>)}</tbody>
            </table>
          </div>
          {report.legacySales.length === 0 && <p>No legacy manual sales in this period.</p>}
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-surface-container-high bg-white p-5">
          <h3 className="font-display text-xl font-bold">Transactions</h3>
          <p className="text-sm">Recognized transactions use the completion action date. Other rows use the saved schedule or order date.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold">
            <span>Recognized in filtered rows {minor(recognizedTotal)}</span>
            <a href={link('legacy')} className="underline">Legacy Manual Sales {minor(legacyTotal)}</a>
            <span>Dashboard total for period {money(report.totalSales)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-surface-container-low"><tr>{headings.map(label => <th key={label} scope="col" className="whitespace-nowrap">{label}</th>)}</tr></thead>
              <tbody>{records.map(entry => (
                <tr key={entry.key} className="border-b border-surface-container-high align-top">
                  <td><a className="whitespace-nowrap font-bold underline" href={link('sales', entry.orderId, entry.fulfilmentId)}>{entry.orderNumber}</a></td>
                  <td>{entry.source}</td>
                  <td>{entry.orderDate ? getBusinessDateKey(new Date(entry.orderDate), region.timeZone) || '—' : '—'}</td>
                  <td>{entry.scheduledDate || '—'}</td>
                  <td>{entry.fulfilmentStatus === 'Completed' ? (
                    <>Unverified{entry.completedAt && entry.scheduledDate && entry.date > entry.scheduledDate && <small className="block">Completion recorded after schedule</small>}</>
                  ) : '—'}</td>
                  <td>{entry.completedAt ? <time dateTime={entry.completedAt}>{timestamp.format(new Date(entry.completedAt))}</time> : entry.fulfilmentStatus === 'Completed' ? 'Missing timestamp' : '—'}</td>
                  <td className="min-w-40">{entry.items.length ? entry.items.map((item, index) => <div key={index}>{item.quantity} × {item.name}{item.focQuantity > 0 ? ` (${item.focQuantity} FOC)` : ''}</div>) : '—'}</td>
                  <td>{minor(entry.grossMinor)}</td><td>{minor(entry.discountMinor)}</td><td>{entry.focQuantity}</td>
                  <td>{entry.recognized ? minor(entry.merchandiseMinor) : '—'}</td>
                  <td>{entry.recognized ? minor(entry.deliveryMinor) : '—'}</td>
                  <td>{entry.recognized ? minor(entry.refundMinor) : '—'}</td>
                  <td>{entry.recognized ? minor(entry.totalMinor) : '—'}</td>
                  <td>{entry.paymentMethod}</td>
                  <td className="capitalize">{displayStatus(entry.paymentStatus)}{entry.refundStatus && entry.refundStatus !== 'none' ? ` · Refund ${displayStatus(entry.refundStatus)}` : ''}</td>
                  <td>{entry.fulfilmentStatus}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!records.length && <p>No transactions match these filters.</p>}
        </section>
      )}
    </div>
  );
}
