import { useEffect, useState } from 'react';
import { businessService } from '../../../business/services';
import type { BusinessAccountingReport } from '../../../business/accounting';
import { formatPurchaseCostPercentage } from '../../../business/purchaseKpi';
import { formatRegionCurrency, useWorkspaceRegion } from '../../../../regions';

interface Props { userId?: string; workspaceId?: string; }
const today = new Date().toISOString().slice(0, 10);

export default function CostingReportsPage({ userId, workspaceId }: Props) {
  const region = useWorkspaceRegion();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<BusinessAccountingReport | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!userId || !from || !to || from > to) return;
    let cancelled = false;
    businessService.getAccountingReport(userId, workspaceId || userId, from, to, region.timeZone)
      .then(value => { if (!cancelled) { setReport(value); setError(''); } })
      .catch(() => { if (!cancelled) setError('Unable to load report.'); });
    return () => { cancelled = true; };
  }, [from, region.timeZone, to, userId, workspaceId]);
  const money = (value: number) => formatRegionCurrency(value, region.currency);
  return <div className="space-y-6">
    <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm"><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Costing</p><h2 className="mt-1 font-display text-3xl font-bold text-primary">Business report</h2><div className="mt-5 flex flex-wrap gap-3"><label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="ml-2 rounded border p-2" /></label><label>To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="ml-2 rounded border p-2" /></label></div></section>
    {error && <p className="rounded-xl bg-error/10 p-4 font-bold text-error">{error}</p>}
    {report && <><section className="grid gap-4 md:grid-cols-4">{[['Total Sales', money(report.totalSales)], ['Total Purchases', money(report.totalPurchases)], ['Net result', money(report.netResult)], ['Purchase Cost %', formatPurchaseCostPercentage(report.purchaseCostPercentage)]].map(([label, value]) => <article key={label} className="rounded-2xl border border-surface-container-high bg-white p-5"><p className="text-xs font-extrabold uppercase text-outline">{label}</p><p className="mt-2 text-2xl font-bold text-primary">{value}</p></article>)}</section>
      <section className="grid gap-6 xl:grid-cols-2"><article className="rounded-2xl border border-surface-container-high bg-white p-5"><h3 className="font-bold text-primary">Sales and purchase trend</h3><div className="mt-4 space-y-2">{report.salesTrend.map(day => <div key={day.date} className="grid grid-cols-3 gap-2 text-sm"><span>{day.date}</span><span>Sales {money(day.sales)}</span><span>Purchases {money(day.purchases)}</span></div>)}</div></article><article className="rounded-2xl border border-surface-container-high bg-white p-5"><h3 className="font-bold text-primary">Supplier spend</h3><div className="mt-4 space-y-2">{report.supplierSpend.length ? report.supplierSpend.map(supplier => <div key={supplier.supplier} className="flex justify-between text-sm"><span>{supplier.supplier} ({supplier.invoiceCount})</span><strong>{money(supplier.totalSpend)}</strong></div>) : <p className="text-sm text-on-surface-variant">No approved/imported invoices in this period.</p>}</div></article></section></>}
  </div>;
}
