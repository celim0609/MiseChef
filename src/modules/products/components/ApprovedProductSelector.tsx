import { useMemo, useState } from 'react';
import { Check, Image as ImageIcon, Search, Trash2 } from 'lucide-react';
import type { ApprovedProductSummary, RecommendedProduct } from '../../../types';

interface ApprovedProductSelectorProps {
  products: ApprovedProductSummary[];
  selectedIds: string[];
  legacyProducts: RecommendedProduct[];
  isLoading: boolean;
  error: string;
  onSelectedIdsChange: (ids: string[]) => void;
  onRemoveLegacyProduct: (index: number) => void;
}

const ProductImage = ({ imageUrl }: { imageUrl?: string }) => imageUrl
  ? <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-surface-container-high bg-white object-contain p-1" />
  : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-container text-outline"><ImageIcon className="h-5 w-5" /></span>;

export function ApprovedProductSelector({
  products,
  selectedIds,
  legacyProducts,
  isLoading,
  error,
  onSelectedIdsChange,
  onRemoveLegacyProduct
}: ApprovedProductSelectorProps) {
  const [search, setSearch] = useState('');
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedSearch = search.trim().toLowerCase();
  const availableProducts = products.filter(product => product.active && !selectedIdSet.has(product.id) && (!normalizedSearch || product.name.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="space-y-5">
      {(legacyProducts.length > 0 || selectedIds.length > 0) && (
        <div className="space-y-3" data-testid="selected-products">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-secondary">Selected Products</p>
          {legacyProducts.map((product, index) => (
            <article key={`legacy-${index}`} className="flex items-center gap-3 rounded-2xl border border-surface-container-high bg-background p-3">
              <ProductImage imageUrl={product.image} />
              <div className="min-w-0 flex-1">
                <p className="break-words font-sans text-sm font-extrabold text-primary">{product.name}</p>
                <p className="mt-1 font-sans text-[11px] font-bold text-outline">Existing recommendation</p>
              </div>
              <button type="button" onClick={() => onRemoveLegacyProduct(index)} aria-label={`Remove ${product.name}`} className="rounded-full p-2 text-outline hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}
          {selectedIds.map(productId => {
            const product = productById.get(productId);
            return (
              <article key={productId} className="flex items-center gap-3 rounded-2xl border border-surface-container-high bg-background p-3">
                <ProductImage imageUrl={product?.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-sans text-sm font-extrabold text-primary">{product?.name || 'Approved product unavailable'}</p>
                  {!product?.active && <p className="mt-1 font-sans text-[11px] font-bold text-outline">Inactive — remove or keep for later</p>}
                </div>
                <button type="button" onClick={() => onSelectedIdsChange(selectedIds.filter(id => id !== productId))} aria-label={`Remove ${product?.name || 'approved product'}`} className="rounded-full p-2 text-outline hover:bg-error/10 hover:text-error"><Trash2 className="h-4 w-4" /></button>
              </article>
            );
          })}
        </div>
      )}

      <div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" aria-hidden="true" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search approved products..." className="w-full rounded-xl border border-surface-container-high bg-background py-3 pl-11 pr-4 font-sans text-sm font-semibold text-primary outline-none focus:border-primary" />
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">{error}</p>
        ) : isLoading ? (
          <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Loading approved products…</p>
        ) : availableProducts.length === 0 ? (
          <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">{normalizedSearch ? 'No approved products found.' : 'No additional approved products available.'}</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="available-products">
            {availableProducts.map(product => (
              <button key={product.id} type="button" onClick={() => onSelectedIdsChange([...selectedIds, product.id])} className="flex items-center gap-3 rounded-2xl border border-surface-container-high bg-background p-3 text-left transition hover:border-primary/30">
                <ProductImage imageUrl={product.imageUrl} />
                <span className="min-w-0 flex-1 break-words font-sans text-sm font-extrabold text-primary">{product.name}</span>
                <span className="rounded-full bg-primary/10 p-2 text-primary"><Check className="h-4 w-4" /></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
