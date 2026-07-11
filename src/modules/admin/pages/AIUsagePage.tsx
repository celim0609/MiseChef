import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Bot, Clock, Database, DollarSign, Gauge, Users } from 'lucide-react';
import { adminAiUsageService, type AdminAiUsageDashboard, type AdminAiUsageDateFilter } from '../services/adminAiUsageService';

const filterOptions: Array<{ value: AdminAiUsageDateFilter; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'last7Days', label: 'Last 7 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'last30Days', label: 'Last 30 Days' }
];

const emptyDashboard: AdminAiUsageDashboard = {
  filter: 'thisMonth',
  summary: {
    todayRequests: 0,
    monthRequests: 0,
    todayCost: 0,
    monthCost: 0,
    averageCostPerRequest: 0,
    averageResponseTime: 0
  },
  topCompanies: [],
  companyQuotas: [],
  topUsers: [],
  modelBreakdown: [],
  featureBreakdown: [],
  alerts: [],
  recordCount: 0
};

const formatMoney = (value: number) => `$${value.toFixed(4)}`;
const formatNumber = (value: number) => new Intl.NumberFormat().format(Math.round(value));
const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatDate = (value: string) => {
  if (!value) return 'No requests yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatResponseTime = (value: number) => {
  if (!value) return '0 ms';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
};

const getQuotaStatusClass = (status: string) => {
  if (status === 'Limit Reached') return 'bg-error/10 text-error border-error/30';
  if (status === 'Near Limit') return 'bg-secondary/10 text-secondary border-secondary/30';
  return 'bg-primary/10 text-primary border-primary/20';
};

const MetricCard = ({ label, value, helper, icon }: { label: string; value: string | number; helper?: string; icon: ReactNode }) => (
  <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5">
    <div className="flex items-center justify-between gap-3">
      <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-on-surface-variant">{label}</p>
      <span className="rounded-full bg-primary/10 p-2 text-primary">{icon}</span>
    </div>
    <p className="mt-3 font-display text-3xl font-bold text-primary">{value}</p>
    {helper && <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">{helper}</p>}
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">{message}</div>
);

export function AdminAIUsagePage() {
  const [activeFilter, setActiveFilter] = useState<AdminAiUsageDateFilter>('thisMonth');
  const [dashboard, setDashboard] = useState<AdminAiUsageDashboard>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadDashboard = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const loadedDashboard = await adminAiUsageService.getDashboard(activeFilter);
        if (!isCancelled) setDashboard(loadedDashboard);
      } catch (err) {
        if (!isCancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load AI usage dashboard.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [activeFilter]);

  return (
    <section className="space-y-5 rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-primary">
            <Bot className="h-6 w-6 text-secondary" />
            AI Usage
          </h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Read-only platform AI usage dashboard from current platform activity.</p>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary">
          {isLoading ? 'Loading...' : `${formatNumber(dashboard.recordCount)} records in selected range`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterOptions.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => setActiveFilter(option.value)}
            className={`rounded-full px-4 py-2 font-sans text-xs font-extrabold transition-colors ${
              activeFilter === option.value
                ? 'bg-primary text-white'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {errorMessage && <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{errorMessage}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Total AI Requests Today" value={formatNumber(dashboard.summary.todayRequests)} icon={<Bot className="h-5 w-5" />} />
        <MetricCard label="Total AI Requests This Month" value={formatNumber(dashboard.summary.monthRequests)} icon={<Database className="h-5 w-5" />} />
        <MetricCard label="Total AI Cost Today" value={formatMoney(dashboard.summary.todayCost)} icon={<DollarSign className="h-5 w-5" />} />
        <MetricCard label="Total AI Cost This Month" value={formatMoney(dashboard.summary.monthCost)} icon={<DollarSign className="h-5 w-5" />} />
        <MetricCard label="Average Cost Per Request" value={formatMoney(dashboard.summary.averageCostPerRequest)} helper="Based on selected date range" icon={<Gauge className="h-5 w-5" />} />
        <MetricCard label="Average Response Time" value={formatResponseTime(dashboard.summary.averageResponseTime)} helper="Based on selected date range" icon={<Clock className="h-5 w-5" />} />
      </div>


      <div className="overflow-hidden rounded-2xl border border-surface-container-high bg-white">
        <div className="border-b border-surface-container-high p-5">
          <h4 className="font-display text-lg font-bold text-primary">Company AI Quota & Subscription Usage</h4>
          <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Monitoring only. Limits are read from the existing subscription plan configuration.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-container-high text-left">
            <thead className="bg-surface-container-low">
              <tr>
                {['Company', 'Plan', 'AI Requests', 'Tokens', 'Estimated Cost', 'Usage %', 'Status'].map(header => (
                  <th key={header} className="px-4 py-3 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-on-surface-variant">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {dashboard.companyQuotas.length > 0 ? dashboard.companyQuotas.map(company => (
                <tr key={company.companyId} className="align-top">
                  <td className="px-4 py-3 font-sans text-sm font-extrabold text-primary">
                    {company.companyName}
                    <p className="mt-1 font-sans text-[11px] font-bold text-on-surface-variant">Today: {formatNumber(company.todayRequests)} requests</p>
                  </td>
                  <td className="px-4 py-3 font-sans text-sm font-bold capitalize text-on-surface-variant">{company.plan}</td>
                  <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">
                    {formatNumber(company.monthRequests)}
                    <p className="mt-1 text-[11px]">Remaining: {adminAiUsageService.formatLimit(company.remainingAiAllowance)}</p>
                  </td>
                  <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">
                    {formatNumber(company.monthTokens)}
                    <p className="mt-1 text-[11px]">Limit: {adminAiUsageService.formatLimit(company.tokenLimit)}</p>
                  </td>
                  <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">
                    {formatMoney(company.monthCost)}
                    <p className="mt-1 text-[11px]">Budget: {company.costBudgetUSD === -1 ? 'Unlimited' : formatMoney(company.costBudgetUSD)}</p>
                  </td>
                  <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatPercent(company.usagePercentage)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.12em] ${getQuotaStatusClass(company.status)}`}>
                      {company.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="p-4"><EmptyState message="No company subscription usage to display yet." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-surface-container-high bg-white">
          <div className="border-b border-surface-container-high p-5">
            <h4 className="font-display text-lg font-bold text-primary">Top Companies</h4>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Sorted by highest AI cost.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-container-high text-left">
              <thead className="bg-surface-container-low">
                <tr>
                  {['Company Name', 'Requests', 'Total Tokens', 'Estimated Cost', 'Last AI Request', '% of Cost'].map(header => (
                    <th key={header} className="px-4 py-3 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-on-surface-variant">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high">
                {dashboard.topCompanies.length > 0 ? dashboard.topCompanies.map(company => (
                  <tr key={company.companyId} className="align-top">
                    <td className="px-4 py-3 font-sans text-sm font-extrabold text-primary">{company.companyName}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatNumber(company.requests)}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatNumber(company.totalTokens)}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatMoney(company.estimatedCostUSD)}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatDate(company.lastAiRequest)}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatPercent(company.percentageOfTotalCost)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="p-4"><EmptyState message="No company AI usage for this period." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-surface-container-high bg-white">
          <div className="border-b border-surface-container-high p-5">
            <h4 className="font-display text-lg font-bold text-primary">Top Users</h4>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Sorted by highest AI cost.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-container-high text-left">
              <thead className="bg-surface-container-low">
                <tr>
                  {['User', 'Company', 'Requests', 'Tokens', 'Estimated Cost'].map(header => (
                    <th key={header} className="px-4 py-3 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-on-surface-variant">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high">
                {dashboard.topUsers.length > 0 ? dashboard.topUsers.map(user => (
                  <tr key={user.userId} className="align-top">
                    <td className="px-4 py-3 font-sans text-sm font-extrabold text-primary">{user.userName}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{user.companyName}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatNumber(user.requests)}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatNumber(user.totalTokens)}</td>
                    <td className="px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{formatMoney(user.estimatedCostUSD)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="p-4"><EmptyState message="No user AI usage for this period." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownPanel title="Model Breakdown" rows={dashboard.modelBreakdown} />
        <BreakdownPanel title="Feature Breakdown" rows={dashboard.featureBreakdown} />
      </div>

      <div className="rounded-2xl border border-surface-container-high bg-white p-5">
        <h4 className="flex items-center gap-2 font-display text-lg font-bold text-primary">
          <AlertTriangle className="h-5 w-5 text-secondary" />
          AI Usage Alerts
        </h4>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {dashboard.alerts.map(alert => (
            <div key={alert.id} className={`rounded-xl border p-4 ${alert.severity === 'critical' ? 'border-error/30 bg-error/10' : alert.severity === 'warning' ? 'border-secondary/30 bg-secondary/10' : 'border-surface-container-high bg-surface-container-low'}`}>
              <p className="font-sans text-sm font-extrabold text-primary">{alert.title}</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{alert.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const BreakdownPanel = ({ title, rows }: { title: string; rows: AdminAiUsageDashboard['modelBreakdown'] }) => (
  <div className="rounded-2xl border border-surface-container-high bg-white p-5">
    <h4 className="font-display text-lg font-bold text-primary">{title}</h4>
    <div className="mt-4 space-y-3">
      {rows.length > 0 ? rows.map(row => (
        <div key={row.label} className="rounded-xl bg-surface-container-low p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-sans text-sm font-extrabold text-primary">{row.label}</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{formatNumber(row.requests)} requests · {formatNumber(row.totalTokens)} tokens</p>
            </div>
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary">{formatMoney(row.estimatedCostUSD)}</span>
          </div>
        </div>
      )) : <EmptyState message={`No ${title.toLowerCase()} data for this period.`} />}
    </div>
  </div>
);
