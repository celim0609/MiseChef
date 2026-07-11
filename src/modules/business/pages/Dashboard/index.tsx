import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import { businessService } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import type { BusinessDashboardSummary } from '../../types';

interface BusinessDashboardPageProps {
  userId?: string;
  workspaceId?: string;
}

const emptySummary: BusinessDashboardSummary = {
  todaySales: 0,
  todayPurchases: 0,
  monthSales: 0,
  monthPurchases: 0,
  purchaseCostPercentage: null,
  monthlyTrend: [],
  topSuppliers: [],
  alerts: []
};

const formatMoney = (value: number) => `SGD ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value: number | null) => value === null ? 'No sales yet' : `${value.toFixed(1)}%`;

const getCostBadgeClass = (percentage: number | null) => {
  if (percentage === null) return 'bg-surface-container-high text-on-surface-variant';
  if (percentage <= 30) return 'bg-green-100 text-green-800';
  if (percentage <= 35) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const alertClassName = {
  info: 'border-primary/20 bg-primary/10 text-primary',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  danger: 'border-red-200 bg-red-50 text-red-800'
};

export default function BusinessDashboardPage({ userId, workspaceId }: BusinessDashboardPageProps) {
  const [summary, setSummary] = useState<BusinessDashboardSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadSummary = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const dashboardSummary = await businessService.getDashboardSummary(userId, workspaceId || userId);
        if (!isCancelled) setSummary(dashboardSummary);
      } catch (err) {
        if (!isCancelled) setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to load business dashboard.'));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadSummary();
    window.addEventListener('misechef:invoice-lifecycle-changed', loadSummary);

    return () => {
      isCancelled = true;
      window.removeEventListener('misechef:invoice-lifecycle-changed', loadSummary);
    };
  }, [userId, workspaceId]);

  const maxTrendValue = useMemo(() => Math.max(1, ...summary.monthlyTrend.flatMap(day => [day.sales, day.purchases])), [summary.monthlyTrend]);

  const kpiCards = [
    { label: "Today's Sales", value: formatMoney(summary.todaySales), icon: <WalletCards className="h-5 w-5" /> },
    { label: "Today's Purchases", value: formatMoney(summary.todayPurchases), icon: <ReceiptText className="h-5 w-5" /> },
    { label: 'Month Sales', value: formatMoney(summary.monthSales), icon: <TrendingUp className="h-5 w-5" /> },
    { label: 'Month Purchases', value: formatMoney(summary.monthPurchases), icon: <ReceiptText className="h-5 w-5" /> },
    { label: 'Purchase Cost %', value: formatPercent(summary.purchaseCostPercentage), icon: <BarChart3 className="h-5 w-5" />, badgeClass: getCostBadgeClass(summary.purchaseCostPercentage) }
  ];

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm">
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Business</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Restaurant KPI Dashboard</h2>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Monitor sales, processed invoice purchases, supplier spend, and purchase cost control.</p>
      </section>

      {errorMessage && <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{errorMessage}</p>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map(card => (
          <article key={card.label} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-primary/10 p-2 text-primary">{card.icon}</span>
              {card.badgeClass && <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${card.badgeClass}`}>{card.value}</span>}
            </div>
            <p className="mt-5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-primary">{isLoading ? 'Loading...' : card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Monthly Trend</p>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Daily sales, purchases, and purchase cost percentage.</p>
            </div>
            <div className="flex flex-wrap gap-3 font-sans text-xs font-extrabold text-on-surface-variant">
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-primary" />Sales</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-secondary" />Purchases</span>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <div className="flex min-w-[720px] items-end gap-2 rounded-2xl bg-surface-container-low p-4">
              {summary.monthlyTrend.length > 0 ? summary.monthlyTrend.map(day => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end justify-center gap-1">
                    <div title={`Sales ${formatMoney(day.sales)}`} className="w-3 rounded-t bg-primary" style={{ height: `${Math.max(4, (day.sales / maxTrendValue) * 160)}px` }} />
                    <div title={`Purchases ${formatMoney(day.purchases)}`} className="w-3 rounded-t bg-secondary" style={{ height: `${Math.max(4, (day.purchases / maxTrendValue) * 160)}px` }} />
                  </div>
                  <p className="font-sans text-[10px] font-extrabold text-outline">{day.date.slice(8)}</p>
                  <p className="font-sans text-[10px] font-bold text-on-surface-variant">{formatPercent(day.purchaseCostPercentage)}</p>
                </div>
              )) : (
                <p className="w-full py-16 text-center font-sans text-sm font-bold text-on-surface-variant">No trend data yet.</p>
              )}
            </div>
          </div>
        </article>

        <div className="space-y-6">
          <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Top Suppliers</p>
            <div className="mt-4 space-y-3">
              {summary.topSuppliers.length > 0 ? summary.topSuppliers.map(supplier => (
                <div key={supplier.supplier} className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-sans text-sm font-extrabold text-primary">{supplier.supplier}</p>
                    <p className="font-sans text-sm font-extrabold text-secondary">{formatMoney(supplier.totalSpend)}</p>
                  </div>
                  <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{supplier.invoiceCount} invoice{supplier.invoiceCount === 1 ? '' : 's'}</p>
                </div>
              )) : <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">No processed supplier invoices this month.</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Alerts</p>
            <div className="mt-4 space-y-3">
              {summary.alerts.length > 0 ? summary.alerts.map(alert => (
                <div key={alert.id} className={`flex gap-3 rounded-xl border p-4 ${alertClassName[alert.severity]}`}>
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="font-sans text-sm font-extrabold">{alert.message}</p>
                </div>
              )) : <p className="rounded-xl bg-green-50 p-4 font-sans text-sm font-extrabold text-green-800">No alerts right now.</p>}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
