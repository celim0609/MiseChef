import { useCallback, useEffect, useState } from 'react';
import { Building2, ClipboardList, History, PackageSearch, Plus, Search } from 'lucide-react';
import SupplierForm from '../../components/SupplierForm';
import SupplierSummaryCard from '../../components/SupplierSummaryCard';
import SupplierTable from '../../components/SupplierTable';
import { supplierService } from '../../services';
import { getCustomerFriendlyErrorMessage, isPermissionError } from '../../../../utils/customerErrorMessages';
import { usageLimitService } from '../../../../services/usageLimitService';
import type { Supplier, SupplierDraft, SupplierFilters, SupplierQuotationSummary } from '../../types';

const emptySummary: SupplierQuotationSummary = {
  totalSuppliers: 0,
  activeSuppliers: 0,
  archivedSuppliers: 0,
  totalQuotations: 0,
  activeQuotations: 0,
  latestQuotationDate: null
};

interface SuppliersPageProps {
  userId?: string;
  workspaceId?: string;
}

export default function SuppliersPage({ userId, workspaceId }: SuppliersPageProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summary, setSummary] = useState<SupplierQuotationSummary>(emptySummary);
  const [filters, setFilters] = useState<SupplierFilters>({ searchTerm: '', status: 'Active' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    let firstNonPermissionError: unknown = null;

    const safeLoad = async <T,>(loader: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await loader();
      } catch (err) {
        if (!isPermissionError(err) && !firstNonPermissionError) {
          firstNonPermissionError = err;
        }
        return fallback;
      }
    };

    try {
      const [loadedSuppliers, loadedSummary] = await Promise.all([
        safeLoad(() => supplierService.listSuppliers(workspaceId || userId, filters), [] as Supplier[]),
        safeLoad(() => supplierService.getSummary(workspaceId || userId), emptySummary)
      ]);
      setSuppliers(loadedSuppliers);
      setSummary(loadedSummary);
      if (firstNonPermissionError) {
        setErrorMessage(getCustomerFriendlyErrorMessage(firstNonPermissionError, 'Unable to load suppliers.'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters, userId, workspaceId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setIsFormOpen(true);
    setMessage('');
    setErrorMessage('');
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
    setMessage('');
    setErrorMessage('');
  };

  const handleSaveSupplier = async (draft: SupplierDraft) => {
    if (!userId) {
      setErrorMessage('Sign in to manage suppliers.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      if (editingSupplier) {
        await supplierService.updateSupplier(editingSupplier.id, draft, userId, workspaceId || userId);
        setMessage(`Updated ${draft.companyName}.`);
      } else {
        const limitCheck = await usageLimitService.canCreateResource(workspaceId || userId, 'supplier', summary.totalSuppliers);
        if (!limitCheck.allowed) {
          setErrorMessage(limitCheck.message);
          return;
        }

        await supplierService.createSupplier(draft, userId, workspaceId || userId);
        setMessage(`Added ${draft.companyName}.`);
      }
      setIsFormOpen(false);
      setEditingSupplier(null);
      await loadSuppliers();
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to save supplier.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveSupplier = async (supplier: Supplier) => {
    if (!userId) {
      setErrorMessage('Sign in to manage suppliers.');
      return;
    }

    const confirmed = window.confirm(`Archive ${supplier.companyName}? Archived suppliers are hidden by default and can be viewed with the Archived filter.`);
    if (!confirmed) return;

    setIsSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      await supplierService.archiveSupplier(supplier, userId, workspaceId || userId);
      setMessage(`Archived ${supplier.companyName}.`);
      await loadSuppliers();
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to archive supplier.'));
    } finally {
      setIsSaving(false);
    }
  };

  const summaryCards = [
    { label: 'Suppliers', value: String(summary.totalSuppliers), icon: <Building2 className="h-5 w-5" />, helper: `${summary.activeSuppliers} active, ${summary.archivedSuppliers} archived` },
    { label: 'Quotations', value: String(summary.totalQuotations), icon: <ClipboardList className="h-5 w-5" />, helper: 'Quotation records remain historical' },
    { label: 'Latest Quote', value: summary.latestQuotationDate || '-', icon: <History className="h-5 w-5" />, helper: 'Newest quotation becomes active' },
    { label: 'Costing Link', value: 'Not connected', icon: <PackageSearch className="h-5 w-5" />, helper: 'Ingredient costs stay unchanged' }
  ];

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Business</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Supplier Management</h2>
            <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">
              Manage supplier details for future quotation imports. This does not update ingredients, invoices, inventory, marketplace, or recipe costing.
            </p>
          </div>
          <button type="button" onClick={openAddSupplier} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all">
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        </div>
      </section>

      {(message || errorMessage) && (
        <p className={`rounded-2xl border p-4 font-sans text-sm font-bold ${errorMessage ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}>
          {errorMessage || message}
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(card => (
          <div key={card.label}>
            <SupplierSummaryCard
              label={card.label}
              value={isLoading ? 'Loading...' : card.value}
              icon={card.icon}
              helper={card.helper}
            />
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Supplier List</p>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Archived suppliers are hidden by default. Use the filter to review historical supplier records.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_160px] lg:w-[520px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
              <input
                value={filters.searchTerm}
                onChange={event => setFilters(current => ({ ...current, searchTerm: event.target.value }))}
                placeholder="Search supplier, contact, email"
                className="w-full rounded-xl border border-surface-container-high bg-surface-container-low py-3 pl-10 pr-4 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <select
              value={filters.status}
              onChange={event => setFilters(current => ({ ...current, status: event.target.value as SupplierFilters['status'] }))}
              className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-extrabold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
              <option value="All">All</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <SupplierTable
            suppliers={suppliers}
            isLoading={isLoading}
            onEditSupplier={openEditSupplier}
            onArchiveSupplier={handleArchiveSupplier}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Future Compatibility</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {['Supplier Portal', 'Supplier Marketplace', 'PDF Quotation Import', 'Excel Import', 'AI OCR Import'].map(item => (
            <div key={item} className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
              <p className="font-sans text-sm font-extrabold text-primary">{item}</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Compatible foundation</p>
            </div>
          ))}
        </div>
      </section>

      {isFormOpen && (
        <SupplierForm
          supplier={editingSupplier}
          isSaving={isSaving}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingSupplier(null);
          }}
          onSubmit={handleSaveSupplier}
        />
      )}
    </div>
  );
}
