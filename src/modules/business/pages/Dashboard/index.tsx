import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import { businessService } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import type { BusinessDashboardSummary } from '../../types';
import { formatRegionCurrency, useWorkspaceRegion } from '../../../../regions';
import { formatPurchaseCostPercentage } from '../../purchaseKpi';
import { getBusinessDashboardPeriodRange } from '../../accounting';
import type { BusinessDashboardPeriod } from '../../types';

interface BusinessDashboardPageProps {
  userId?: string;
  workspaceId?: string;
}

const emptySummary: BusinessDashboardSummary = {
  sales: 0,
  purchases: 0,
  netResult: 0,
  purchaseCostPercentage: null,
  trend: [],
  topSuppliers: [],
  alerts: [],
  availability: { sales: false, purchases: false }
};

const periodOptions: Array<{ value: BusinessDashboardPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'custom', label: 'Custom' }
];

const formatDateKey = (date: string) => date.split('-').reverse().join('/');

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
  const region = useWorkspaceRegion();
  const formatMoney = (value: number) => formatRegionCurrency(value, region.currency);
  const [summary, setSummary] = useState<BusinessDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [period, setPeriod] = useState<BusinessDashboardPeriod>('this-month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const periodRange = useMemo(() => getBusinessDashboardPeriodRange({
    period,
    now: new Date(),
    timeZone: region.timeZone,
    customFrom,
    customTo
  }), [customFrom, customTo, period, region.timeZone]);
  const periodLabel = periodOptions.find(option => option.value === period)?.label || 'Selected Period';

  useEffect(() => {
    let isCancelled = false;

    const loadSummary = async () => {
      if (!periodRange) {
        setSummary(null);
        setErrorMessage('Choose a valid From and To date for the custom period.');
        return;
      }
      setIsLoading(true);
      setErrorMessage('');
      try {
        const dashboardSummary = await businessService.getDashboardSummary(
          userId,
          workspaceId || userId,
          region.timeZone,
          periodRange
        );
        if (!isCancelled) setSummary(dashboardSummary);
      } catch (err) {
        if (!isCancelled) {
          setSummary(null);
          setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to load business dashboard.'));
        }
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
  }, [periodRange?.from, periodRange?.to, region.timeZone, reloadKey, userId, workspaceId]);

  const dashboardSummary = summary || emptySummary;
  const maxTrendValue = useMemo(() => Math.max(1, ...dashboardSummary.trend.flatMap(day => [day.sales, day.purchases])), [dashboardSummary.trend]);

  const kpiCards = [
    { label: 'Sales', value: formatMoney(dashboardSummary.sales), hasData: dashboardSummary.availability.sales, icon: <WalletCards className="h-5 w-5" /> },
    { label: 'Purchases', value: formatMoney(dashboardSummary.purchases), hasData: dashboardSummary.availability.purchases, icon: <ReceiptText className="h-5 w-5" /> },
    { label: 'Purchase Cost %', value: formatPurchaseCostPercentage(dashboardSummary.purchaseCostPercentage), hasData: dashboardSummary.availability.sales, icon: <BarChart3 className="h-5 w-5" />, badgeClass: getCostBadgeClass(dashboardSummary.purchaseCostPercentage) },
    { label: 'Net Result', value: formatMoney(dashboardSummary.netResult), hasData: dashboardSummary.availability.sales || dashboardSummary.availability.purchases, icon: <TrendingUp className="h-5 w-5" /> }
  ];

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Business</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Restaurant KPI Dashboard</h2>
            <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Monitor sales, approved invoice purchases, supplier spend, and purchase cost control.</p>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap gap-2" aria-label="Dashboard period">
              {periodOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  className={`rounded-full border px-3 py-2 font-sans text-xs font-extrabold transition-colors ${period === option.value ? 'border-primary bg-primary text-white' : 'border-surface-container-high bg-white text-on-surface-variant hover:border-primary/40'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="font-sans text-[10px] font-extrabold uppercase tracking-[0.12em] text-outline">From
                  <input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} className="mt-1 block rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary" />
                </label>
                <span className="pb-2 font-sans text-sm font-bold text-outline">→</span>
                <label className="font-sans text-[10px] font-extrabold uppercase tracking-[0.12em] text-outline">To
                  <input type="date" value={customTo} min={customFrom || undefined} onChange={event => setCustomTo(event.target.value)} className="mt-1 block rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary" />
                </label>
              </div>
            )}
            {periodRange && <p className="font-sans text-xs font-extrabold text-on-surface-variant">{periodLabel}: {formatDateKey(periodRange.from)} → {formatDateKey(periodRange.to)}</p>}
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="flex flex-col gap-3 rounded-2xl border border-error/30 bg-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-sans text-sm font-bold text-error">{errorMessage}</p>
          <button type="button" onClick={() => setReloadKey(value => value + 1)} disabled={isLoading} className="w-fit rounded-full border border-error/30 bg-white px-4 py-2 font-sans text-xs font-extrabold text-error disabled:opacity-50">Retry</button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(card => (
          <article key={card.label} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-primary/10 p-2 text-primary">{card.icon}</span>
              {card.badgeClass && card.hasData && !errorMessage && <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${card.badgeClass}`}>{card.value}</span>}
            </div>
            <p className="mt-5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-primary">{isLoading ? 'Loading...' : errorMessage ? 'Unable to load' : card.hasData ? card.value : 'No data available'}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{periodLabel} Trend</p>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Daily sales, purchases, and purchase cost percentage for the selected period.</p>
            </div>
            <div className="flex flex-wrap gap-3 font-sans text-xs font-extrabold text-on-surface-variant">
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-primary" />Sales</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-secondary" />Purchases</span>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <div className="flex min-w-[720px] items-end gap-2 rounded-2xl bg-surface-container-low p-4">
              {errorMessage ? (
                <p className="w-full py-16 text-center font-sans text-sm font-bold text-error">Unable to load trend data.</p>
              ) : (dashboardSummary.availability.sales || dashboardSummary.availability.purchases) ? dashboardSummary.trend.map(day => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end justify-center gap-1">
                    <div title={`Sales ${formatMoney(day.sales)}`} className="w-3 rounded-t bg-primary" style={{ height: `${Math.max(4, (day.sales / maxTrendValue) * 160)}px` }} />
                    <div title={`Purchases ${formatMoney(day.purchases)}`} className="w-3 rounded-t bg-secondary" style={{ height: `${Math.max(4, (day.purchases / maxTrendValue) * 160)}px` }} />
                  </div>
                  <p className="font-sans text-[10px] font-extrabold text-outline">{day.date.slice(8)}</p>
                  <p className="font-sans text-[10px] font-bold text-on-surface-variant">{formatPurchaseCostPercentage(day.purchaseCostPercentage)}</p>
                </div>
              )) : (
                <p className="w-full py-16 text-center font-sans text-sm font-bold text-on-surface-variant">No data available</p>
              )}
            </div>
          </div>
        </article>

        <div className="space-y-6">
          <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Top Suppliers</p>
            <div className="mt-4 space-y-3">
              {errorMessage ? <p className="rounded-xl bg-error/10 p-4 font-sans text-sm font-bold text-error">Unable to load supplier data.</p> : dashboardSummary.topSuppliers.length > 0 ? dashboardSummary.topSuppliers.map(supplier => (
                <div key={supplier.supplier} className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-sans text-sm font-extrabold text-primary">{supplier.supplier}</p>
                    <p className="font-sans text-sm font-extrabold text-secondary">{formatMoney(supplier.totalSpend)}</p>
                  </div>
                  <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{supplier.invoiceCount} invoice{supplier.invoiceCount === 1 ? '' : 's'}</p>
                </div>
              )) : <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">No data available</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Alerts</p>
            <div className="mt-4 space-y-3">
              {errorMessage ? <p className="rounded-xl bg-error/10 p-4 font-sans text-sm font-bold text-error">Unable to load alerts.</p> : dashboardSummary.alerts.length > 0 ? dashboardSummary.alerts.map(alert => (
                <div key={alert.id} className={`flex gap-3 rounded-xl border p-4 ${alertClassName[alert.severity]}`}>
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="font-sans text-sm font-extrabold">{alert.message}</p>
                </div>
              )) : dashboardSummary.availability.sales || dashboardSummary.availability.purchases ? <p className="rounded-xl bg-green-50 p-4 font-sans text-sm font-extrabold text-green-800">Actual alert count: 0</p> : <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">No data available</p>}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
