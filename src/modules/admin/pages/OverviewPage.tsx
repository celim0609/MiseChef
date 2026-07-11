import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, AlertTriangle, Bot, Building2, FileText, ReceiptText, Users } from 'lucide-react';
import { adminOverviewService } from '../services/adminOverviewService';
import type { AdminOverviewSummary, AdminRecentActivityItem, AdminRecentAiRequest } from '../types';

const emptySummary: AdminOverviewSummary = {
  totalUsers: 0,
  totalCompanies: 0,
  activeSubscriptions: 0,
  freeCompanies: 0,
  paidCompanies: 0,
  todayAiRequests: 0,
  todayAiCost: 0,
  monthAiCost: 0,
  totalRecipes: 0,
  totalInvoices: 0,
  recentUsers: [],
  recentCompanies: [],
  recentAuditLogs: [],
  recentAiRequests: [],
  alerts: []
};

const formatDate = (value: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (value: number) => `$${value.toFixed(4)}`;

const formatLabel = (value: string) => value
  .split(/[_-]/g)
  .filter(Boolean)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const DashboardCard = ({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) => (
  <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5">
    <div className="flex items-center justify-between gap-3">
      <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-on-surface-variant">{label}</p>
      <span className="rounded-full bg-primary/10 p-2 text-primary">{icon}</span>
    </div>
    <p className="mt-3 font-display text-3xl font-bold text-primary">{value}</p>
  </div>
);

const ActivityList = ({ title, items }: { title: string; items: AdminRecentActivityItem[] }) => (
  <div className="rounded-2xl border border-surface-container-high bg-white p-5">
    <h4 className="font-display text-lg font-bold text-primary">{title}</h4>
    <div className="mt-4 space-y-3">
      {items.length > 0 ? items.map(item => (
        <div key={item.id} className="rounded-xl bg-surface-container-low p-4">
          <p className="font-sans text-sm font-extrabold text-primary">{item.title}</p>
          <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{item.subtitle}</p>
          <p className="mt-2 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-outline">{formatDate(item.timestamp)}</p>
        </div>
      )) : <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">No recent activity.</p>}
    </div>
  </div>
);

const AiActivityList = ({ items }: { items: AdminRecentAiRequest[] }) => (
  <div className="rounded-2xl border border-surface-container-high bg-white p-5">
    <h4 className="font-display text-lg font-bold text-primary">Recent AI Requests</h4>
    <div className="mt-4 space-y-3">
      {items.length > 0 ? items.map(item => (
        <div key={item.id} className="rounded-xl bg-surface-container-low p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-extrabold text-primary">{formatLabel(item.feature)}</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{item.subtitle}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{item.status}</span>
          </div>
          <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">{formatMoney(item.estimatedCostUSD)} · {formatDate(item.timestamp)}</p>
        </div>
      )) : <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">No recent AI requests.</p>}
    </div>
  </div>
);

export function AdminOverviewPage() {
  const [summary, setSummary] = useState<AdminOverviewSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadOverview = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const overview = await adminOverviewService.getOverview();
        if (!isCancelled) setSummary(overview);
      } catch (err) {
        if (!isCancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load overview dashboard.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadOverview();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <section className="space-y-5 rounded-2xl border border-surface-container-high bg-white p-5 sm:p-7 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-primary tracking-tight">
            <Activity className="h-6 w-6 text-secondary" />
            Overview
          </h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Super Admin snapshot from existing MiseChef platform data.</p>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary">
          {isLoading ? 'Loading...' : 'Live Platform Data'}
        </span>
      </div>

      {errorMessage && <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{errorMessage}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <DashboardCard label="Total Users" value={summary.totalUsers} icon={<Users className="h-5 w-5" />} />
        <DashboardCard label="Total Companies" value={summary.totalCompanies} icon={<Building2 className="h-5 w-5" />} />
        <DashboardCard label="Active Subscriptions" value={summary.activeSubscriptions} icon={<Activity className="h-5 w-5" />} />
        <DashboardCard label="Free Companies" value={summary.freeCompanies} icon={<Building2 className="h-5 w-5" />} />
        <DashboardCard label="Paid Companies" value={summary.paidCompanies} icon={<Building2 className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <DashboardCard label="Today's AI Requests" value={summary.todayAiRequests} icon={<Bot className="h-5 w-5" />} />
        <DashboardCard label="Today's AI Cost" value={formatMoney(summary.todayAiCost)} icon={<Bot className="h-5 w-5" />} />
        <DashboardCard label="This Month AI Cost" value={formatMoney(summary.monthAiCost)} icon={<Bot className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <DashboardCard label="Total Recipes" value={summary.totalRecipes} icon={<FileText className="h-5 w-5" />} />
        <DashboardCard label="Total Invoices" value={summary.totalInvoices} icon={<ReceiptText className="h-5 w-5" />} />
        <DashboardCard label="Total Companies" value={summary.totalCompanies} icon={<Building2 className="h-5 w-5" />} />
        <DashboardCard label="Total Users" value={summary.totalUsers} icon={<Users className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <ActivityList title="New Users" items={summary.recentUsers} />
        <ActivityList title="New Companies" items={summary.recentCompanies} />
        <ActivityList title="Recent Activity" items={summary.recentAuditLogs} />
        <AiActivityList items={summary.recentAiRequests} />
      </div>

      <div className="rounded-2xl border border-surface-container-high bg-white p-5">
        <h4 className="flex items-center gap-2 font-display text-lg font-bold text-primary">
          <AlertTriangle className="h-5 w-5 text-secondary" />
          Alerts
        </h4>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {summary.alerts.map(alert => (
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
