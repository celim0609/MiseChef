import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Search } from 'lucide-react';
import { adminSubscriptionService, type AdminSubscriptionDashboard, type AdminSubscriptionRecord } from '../services/adminSubscriptionService';
import type { SubscriptionPlan, SubscriptionStatus } from '../../../types';

type SortKey = 'companyName' | 'currentPlan' | 'subscriptionStatus' | 'renewalDate' | 'aiCostThisMonth' | 'aiRequestsThisMonth' | 'totalMembers';
type SortDirection = 'asc' | 'desc';

const emptyDashboard: AdminSubscriptionDashboard = {
  records: [],
  summary: {
    totalCompanies: 0,
    free: 0,
    starter: 0,
    professional: 0,
    business: 0,
    enterprise: 0
  }
};

const planOptions: Array<'All' | SubscriptionPlan> = ['All', 'free', 'starter', 'professional', 'business', 'enterprise'];
const statusOptions: Array<'All' | SubscriptionStatus> = ['All', 'active', 'trialing', 'past_due', 'cancelled', 'suspended'];

const formatDate = (value: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatMoney = (value: number) => `$${value.toFixed(4)}`;
const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const formatLabel = (value: string) => value
  .split(/[_-]/g)
  .filter(Boolean)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-4">
    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-on-surface-variant">{label}</p>
    <p className="mt-2 font-display text-3xl font-bold text-primary">{formatNumber(value)}</p>
  </div>
);

const getSortValue = (record: AdminSubscriptionRecord, sortKey: SortKey) => {
  if (sortKey === 'renewalDate') return new Date(record.renewalDate).getTime() || 0;
  return record[sortKey];
};

export function AdminSubscriptionsPage() {
  const [dashboard, setDashboard] = useState<AdminSubscriptionDashboard>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<'All' | SubscriptionPlan>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | SubscriptionStatus>('All');
  const [sortKey, setSortKey] = useState<SortKey>('companyName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    let isCancelled = false;

    const loadSubscriptions = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const loadedDashboard = await adminSubscriptionService.getDashboard();
        if (!isCancelled) setDashboard(loadedDashboard);
      } catch (err) {
        if (!isCancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load subscriptions.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadSubscriptions();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === 'companyName' ? 'asc' : 'desc');
  };

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return dashboard.records
      .filter(record => {
        const matchesSearch = !query || [record.companyName, record.ownerName, record.ownerEmail]
          .some(value => value.toLowerCase().includes(query));
        const matchesPlan = planFilter === 'All' || record.currentPlan === planFilter;
        const matchesStatus = statusFilter === 'All' || record.subscriptionStatus === statusFilter;

        return matchesSearch && matchesPlan && matchesStatus;
      })
      .sort((a, b) => {
        const aValue = getSortValue(a, sortKey);
        const bValue = getSortValue(b, sortKey);
        const direction = sortDirection === 'asc' ? 1 : -1;

        if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;
        return String(aValue).localeCompare(String(bValue)) * direction;
      });
  }, [dashboard.records, planFilter, searchQuery, sortDirection, sortKey, statusFilter]);

  const sortableHeaders: Array<{ label: string; key: SortKey }> = [
    { label: 'Company', key: 'companyName' },
    { label: 'Plan', key: 'currentPlan' },
    { label: 'Status', key: 'subscriptionStatus' },
    { label: 'Renewal', key: 'renewalDate' },
    { label: 'AI Cost', key: 'aiCostThisMonth' },
    { label: 'AI Requests', key: 'aiRequestsThisMonth' },
    { label: 'Members', key: 'totalMembers' }
  ];

  return (
    <section className="space-y-5 rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-primary">
            <CreditCard className="h-6 w-6 text-secondary" />
            Subscriptions
          </h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Read-only platform subscription view for Super Admin review.</p>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary">
          {isLoading ? 'Loading...' : `${filteredRecords.length} / ${dashboard.records.length} companies`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total Companies" value={dashboard.summary.totalCompanies} />
        <StatCard label="Free" value={dashboard.summary.free} />
        <StatCard label="Starter" value={dashboard.summary.starter} />
        <StatCard label="Professional" value={dashboard.summary.professional} />
        <StatCard label="Business" value={dashboard.summary.business} />
        <StatCard label="Enterprise" value={dashboard.summary.enterprise} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search company, owner, owner email..."
            className="w-full rounded-full border border-surface-container-high bg-surface-container-low py-3 pl-11 pr-4 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </label>
        <select value={planFilter} onChange={event => setPlanFilter(event.target.value as 'All' | SubscriptionPlan)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
          {planOptions.map(plan => <option key={plan} value={plan}>{plan === 'All' ? 'All Plans' : formatLabel(plan)}</option>)}
        </select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'All' | SubscriptionStatus)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
          {statusOptions.map(status => <option key={status} value={status}>{status === 'All' ? 'All Statuses' : formatLabel(status)}</option>)}
        </select>
      </div>

      {errorMessage && <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{errorMessage}</p>}

      <div className="overflow-x-auto rounded-2xl border border-surface-container-high">
        <table className="w-full min-w-[1500px] text-left font-sans text-sm">
          <thead className="bg-surface-container-low text-primary">
            <tr>
              {sortableHeaders.map(header => (
                <th key={header.key} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">
                  <button type="button" onClick={() => handleSort(header.key)} className="inline-flex items-center gap-1 hover:text-secondary">
                    {header.label}
                    {sortKey === header.key && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
              ))}
              {['Owner', 'Billing Cycle', 'Started', 'Recipes', 'Invoices'].map(header => (
                <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length > 0 ? filteredRecords.map(record => (
              <tr key={record.companyId} className="border-t border-surface-container-high hover:bg-surface-container-low/50">
                <td className="px-4 py-3 font-extrabold text-primary">
                  {record.companyName}
                  <p className="mt-1 font-mono text-[11px] font-bold text-on-surface-variant">{record.companyId}</p>
                </td>
                <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{formatLabel(record.currentPlan)}</span></td>
                <td className="px-4 py-3"><span className="rounded-full bg-surface-container-low px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{formatLabel(record.subscriptionStatus)}</span></td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(record.renewalDate)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatMoney(record.aiCostThisMonth)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatNumber(record.aiRequestsThisMonth)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatNumber(record.totalMembers)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">
                  {record.ownerName}
                  <p className="mt-1 text-xs">{record.ownerEmail}</p>
                </td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatLabel(record.billingCycle)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(record.subscriptionStartedAt)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatNumber(record.totalRecipes)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatNumber(record.totalInvoices)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center font-sans text-sm font-bold text-on-surface-variant">
                  {isLoading ? 'Loading subscriptions...' : 'No subscriptions match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
