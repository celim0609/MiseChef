import { useMemo, useState, type FormEvent } from 'react';
import type { Supplier, SupplierDraft, SupplierValidationErrors } from '../types';

interface SupplierFormProps {
  supplier?: Supplier | null;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (draft: SupplierDraft) => Promise<void>;
}

const defaultDraft: SupplierDraft = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  currency: 'SGD',
  paymentTerms: '',
  deliveryDays: null,
  gstRegistered: false,
  notes: ''
};

const getInitialDraft = (supplier?: Supplier | null): SupplierDraft => supplier ? {
  companyName: supplier.companyName,
  contactPerson: supplier.contactPerson,
  email: supplier.email,
  phone: supplier.phone,
  address: supplier.address,
  currency: supplier.currency,
  paymentTerms: supplier.paymentTerms,
  deliveryDays: supplier.deliveryDays,
  gstRegistered: supplier.gstRegistered,
  notes: supplier.notes
} : defaultDraft;

const validateSupplier = (draft: SupplierDraft): SupplierValidationErrors => {
  const errors: SupplierValidationErrors = {};
  if (!draft.companyName.trim()) errors.companyName = 'Company name is required.';
  if (!draft.currency.trim()) errors.currency = 'Currency is required.';
  return errors;
};

export default function SupplierForm({ supplier, isSaving, onCancel, onSubmit }: SupplierFormProps) {
  const [draft, setDraft] = useState<SupplierDraft>(() => getInitialDraft(supplier));
  const [errors, setErrors] = useState<SupplierValidationErrors>({});

  const title = supplier ? 'Edit Supplier' : 'Add Supplier';
  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  const updateDraft = <K extends keyof SupplierDraft>(field: K, value: SupplierDraft[K]) => {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateSupplier(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit({
      ...draft,
      companyName: draft.companyName.trim(),
      contactPerson: draft.contactPerson.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
      currency: draft.currency.trim().toUpperCase(),
      paymentTerms: draft.paymentTerms.trim(),
      notes: draft.notes.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-surface-container-high bg-background p-5 shadow-2xl">
        <div className="flex flex-col gap-2 border-b border-surface-container-high pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">Supplier Details</p>
            <h3 className="font-display text-2xl font-bold text-primary">{title}</h3>
          </div>
          <p className="rounded-full bg-surface-container-low px-3 py-1.5 font-sans text-[10px] font-extrabold text-outline">Soft archive only</p>
        </div>

        {hasErrors && (
          <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 font-sans text-sm font-bold text-error">
            Please fix the required supplier details.
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Company Name *</span>
            <input value={draft.companyName} onChange={event => updateDraft('companyName', event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
            {errors.companyName && <span className="mt-1 block font-sans text-xs font-bold text-error">{errors.companyName}</span>}
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Contact Person</span>
            <input value={draft.contactPerson} onChange={event => updateDraft('contactPerson', event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Currency *</span>
            <input value={draft.currency} onChange={event => updateDraft('currency', event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold uppercase text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
            {errors.currency && <span className="mt-1 block font-sans text-xs font-bold text-error">{errors.currency}</span>}
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Email</span>
            <input type="email" value={draft.email} onChange={event => updateDraft('email', event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Phone</span>
            <input value={draft.phone} onChange={event => updateDraft('phone', event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>

          <label className="block md:col-span-2">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Address</span>
            <textarea value={draft.address} onChange={event => updateDraft('address', event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Payment Terms</span>
            <input value={draft.paymentTerms} onChange={event => updateDraft('paymentTerms', event.target.value)} placeholder="Net 30, COD, weekly..." className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Delivery Days</span>
            <input type="number" min="0" value={draft.deliveryDays ?? ''} onChange={event => updateDraft('deliveryDays', event.target.value ? Number(event.target.value) : null)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 md:col-span-2">
            <input type="checkbox" checked={draft.gstRegistered} onChange={event => updateDraft('gstRegistered', event.target.checked)} className="h-4 w-4 rounded border-surface-container-high text-primary focus:ring-primary" />
            <span className="font-sans text-sm font-extrabold text-primary">GST Registered</span>
          </label>

          <label className="block md:col-span-2">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Notes</span>
            <textarea value={draft.notes} onChange={event => updateDraft('notes', event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50 active:scale-95 transition-all">
            {isSaving ? 'Saving...' : supplier ? 'Save Supplier' : 'Add Supplier'}
          </button>
        </div>
      </form>
    </div>
  );
}
