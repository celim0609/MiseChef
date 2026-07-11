import type { SupplierQuotation } from '../types';

interface QuotationTableProps {
  quotations: SupplierQuotation[];
}

const formatMoney = (value: number, currency: string) => `${currency} ${Number(value || 0).toFixed(2)}`;

export default function QuotationTable({ quotations }: QuotationTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-container-high">
      <table className="w-full min-w-[940px] text-left font-sans text-sm">
        <thead className="bg-surface-container-low text-primary">
          <tr>
            {['Supplier', 'Ingredient', 'SKU', 'Brand', 'Pack Size', 'Unit Price', 'GST', 'Effective', 'Expiry', 'Active'].map(header => (
              <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {quotations.length > 0 ? quotations.map(quotation => (
            <tr key={quotation.id} className="border-t border-surface-container-high">
              <td className="px-4 py-3 font-extrabold text-primary">{quotation.supplierName}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.ingredientName}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.sku || '-'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.brand || '-'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.packSize || '-'}</td>
              <td className="px-4 py-3 font-extrabold text-secondary">{formatMoney(quotation.unitPrice, quotation.currency)}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.gstIncluded ? 'Included' : 'Excluded'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.effectiveDate || '-'}</td>
              <td className="px-4 py-3 font-bold text-on-surface-variant">{quotation.expiryDate || '-'}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${quotation.isActive ? 'bg-green-100 text-green-800' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {quotation.isActive ? 'Active' : 'History'}
                </span>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center font-bold text-on-surface-variant">
                No quotations yet. Future uploads and imports will append quotation records instead of overwriting price history.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
