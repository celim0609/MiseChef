import { Archive, Pencil } from 'lucide-react';
import type { Supplier } from '../types';

interface SupplierTableProps {
  suppliers: Supplier[];
  isLoading: boolean;
  onEditSupplier: (supplier: Supplier) => void;
  onArchiveSupplier: (supplier: Supplier) => void;
}

const formatDate = (value?: string | null) => value ? value.slice(0, 10) : '-';

export default function SupplierTable({ suppliers, isLoading, onEditSupplier, onArchiveSupplier }: SupplierTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-container-high">
      <table className="w-full min-w-[980px] text-left font-sans text-sm">
        <thead className="bg-surface-container-low text-primary">
          <tr>
            {['Company Name', 'Contact Person', 'Email', 'Phone', 'Currency', 'Status', 'Total Quotations', 'Last Updated', 'Actions'].map(header => (
              <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center font-bold text-on-surface-variant">Loading suppliers...</td>
            </tr>
          ) : suppliers.length > 0 ? suppliers.map(supplier => (
            <tr key={supplier.id} className="border-t border-surface-container-high">
              <td className="px-4 py-3 font-extrabold text-primary">{supplier.companyName}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{supplier.contactPerson || '-'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{supplier.email || '-'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{supplier.phone || '-'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{supplier.currency}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${supplier.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {supplier.status}
                </span>
              </td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{supplier.totalQuotations}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(supplier.updatedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onEditSupplier(supplier)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 font-sans text-[10px] font-extrabold text-primary hover:bg-primary/15">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {supplier.status !== 'Archived' && (
                    <button type="button" onClick={() => onArchiveSupplier(supplier)} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 font-sans text-[10px] font-extrabold text-red-700 hover:bg-red-100">
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center font-bold text-on-surface-variant">
                No suppliers found. Add a supplier to begin building quotation history.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
