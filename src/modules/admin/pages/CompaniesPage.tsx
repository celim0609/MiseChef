import { useEffect, useMemo, useState } from 'react';
import { Building2, Search, X } from 'lucide-react';
import { adminCompanyService } from '../services/adminCompanyService';
import type { AdminCompanyRecord } from '../types';

const formatDate = (value: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatLabel = (value: string) => value
  .split(/[_-]/g)
  .filter(Boolean)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-4">
    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-on-surface-variant">{label}</p>
    <p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p>
  </div>
);

const DetailField = ({ label, value }: { label: string; value: string | number | null }) => (
  <div className="rounded-xl bg-surface-container-low p-4">
    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-outline">{label}</p>
    <p className="mt-1 font-sans text-sm font-extrabold text-primary">{value || 'Not available'}</p>
  </div>
);

export function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<AdminCompanyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    let isCancelled = false;

    const loadCompanies = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const loadedCompanies = await adminCompanyService.listCompanies();
        if (!isCancelled) setCompanies(loadedCompanies);
      } catch (err) {
        if (!isCancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load companies.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadCompanies();

    return () => {
      isCancelled = true;
    };
  }, []);

  const planOptions = useMemo(() => ['All', ...Array.from(new Set(companies.map(company => company.subscriptionPlan).filter(Boolean))).sort()], [companies]);
  const statusOptions = useMemo(() => ['All', ...Array.from(new Set(companies.map(company => company.subscriptionStatus).filter(Boolean))).sort()], [companies]);

  const filteredCompanies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return companies.filter(company => {
      const matchesSearch = !query || [company.name, company.ownerName, company.ownerEmail]
        .some(value => value.toLowerCase().includes(query));
      const matchesPlan = planFilter === 'All' || company.subscriptionPlan === planFilter;
      const matchesStatus = statusFilter === 'All' || company.subscriptionStatus === statusFilter;

      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [companies, planFilter, searchQuery, statusFilter]);

  const summary = useMemo(() => ({
    total: companies.length,
    active: companies.filter(company => company.subscriptionStatus === 'active').length,
    trialOrFree: companies.filter(company => company.subscriptionPlan === 'free' || company.subscriptionStatus === 'trialing').length,
    paid: companies.filter(company => company.subscriptionPlan !== 'free' && company.subscriptionStatus === 'active').length
  }), [companies]);

  return (
    <section className="space-y-5 rounded-2xl border border-surface-container-high bg-white p-5 sm:p-7 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-primary tracking-tight">
            <Building2 className="h-6 w-6 text-secondary" />
            Companies
          </h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Read-only company directory for Super Admin review.</p>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary">
          {filteredCompanies.length} / {companies.length} companies
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Companies" value={summary.total} />
        <StatCard label="Active Companies" value={summary.active} />
        <StatCard label="Trial / Free Companies" value={summary.trialOrFree} />
        <StatCard label="Paid Companies" value={summary.paid} />
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
        <select value={planFilter} onChange={event => setPlanFilter(event.target.value)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
          {planOptions.map(plan => <option key={plan} value={plan}>{plan === 'All' ? 'All Plans' : formatLabel(plan)}</option>)}
        </select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
          {statusOptions.map(status => <option key={status} value={status}>{status === 'All' ? 'All Statuses' : formatLabel(status)}</option>)}
        </select>
      </div>

      {errorMessage && <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{errorMessage}</p>}

      <div className="overflow-x-auto rounded-2xl border border-surface-container-high">
        <table className="w-full min-w-[1180px] text-left font-sans text-sm">
          <thead className="bg-surface-container-low text-primary">
            <tr>
              {['Company Name', 'Company ID', 'Owner Name', 'Owner Email', 'Subscription Plan', 'Subscription Status', 'Total Members', 'Created Date', 'Last Updated'].map(header => (
                <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.length > 0 ? filteredCompanies.map(company => (
              <tr key={company.companyId} onClick={() => setSelectedCompany(company)} className="cursor-pointer border-t border-surface-container-high hover:bg-surface-container-low/50">
                <td className="px-4 py-3 font-extrabold text-primary">{company.name}</td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-on-surface-variant">{company.companyId}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{company.ownerName}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{company.ownerEmail}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{formatLabel(company.subscriptionPlan)}</span></td>
                <td className="px-4 py-3"><span className="rounded-full bg-surface-container-low px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{formatLabel(company.subscriptionStatus)}</span></td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{company.totalMembers}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(company.createdAt)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(company.updatedAt)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center font-sans text-sm font-bold text-on-surface-variant">
                  {isLoading ? 'Loading companies...' : 'No companies match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Company Detail</p>
                <h4 className="mt-1 font-display text-2xl font-bold text-primary">{selectedCompany.name}</h4>
                <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Read-only platform company profile.</p>
              </div>
              <button type="button" onClick={() => setSelectedCompany(null)} className="rounded-full border border-surface-container-high bg-white p-2 text-primary hover:bg-surface-container-low" aria-label="Close company detail">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <h5 className="font-display text-lg font-bold text-primary">Company Information</h5>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DetailField label="Company Name" value={selectedCompany.name} />
                  <DetailField label="Owner" value={`${selectedCompany.ownerName} · ${selectedCompany.ownerEmail}`} />
                  <DetailField label="Company ID" value={selectedCompany.companyId} />
                  <DetailField label="Created Date" value={formatDate(selectedCompany.createdAt)} />
                  <DetailField label="Status" value={selectedCompany.status} />
                </div>
              </div>

              <div>
                <h5 className="font-display text-lg font-bold text-primary">Members</h5>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-surface-container-high">
                  <table className="w-full min-w-[640px] text-left font-sans text-sm">
                    <thead className="bg-surface-container-low text-primary">
                      <tr>
                        {['Name', 'Role', 'Email'].map(header => <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCompany.members.length > 0 ? selectedCompany.members.map(member => (
                        <tr key={member.id} className="border-t border-surface-container-high">
                          <td className="px-4 py-3 font-extrabold text-primary">{member.name}</td>
                          <td className="px-4 py-3 font-bold text-on-surface-variant">{formatLabel(member.role)}</td>
                          <td className="px-4 py-3 font-bold text-on-surface-variant">{member.email}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} className="px-4 py-8 text-center font-bold text-on-surface-variant">No members found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h5 className="font-display text-lg font-bold text-primary">Subscription</h5>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailField label="Plan" value={formatLabel(selectedCompany.subscriptionPlan)} />
                  <DetailField label="Status" value={formatLabel(selectedCompany.subscriptionStatus)} />
                  <DetailField label="Billing Cycle" value={formatLabel(selectedCompany.billingCycle)} />
                </div>
              </div>

              <div>
                <h5 className="font-display text-lg font-bold text-primary">Usage Summary</h5>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <DetailField label="Recipe Count" value={selectedCompany.recipeCount} />
                  <DetailField label="Invoice Count" value={selectedCompany.invoiceCount} />
                  <DetailField label="Supplier Count" value={selectedCompany.supplierCount} />
                  <DetailField label="Team Members" value={selectedCompany.totalMembers} />
                  <DetailField label="AI Requests" value={selectedCompany.aiRequestCount} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
