import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Image as ImageIcon, PackageCheck, Pencil, Plus, X } from 'lucide-react';
import type { ApprovedProduct } from '../../../types';
import {
  APPROVED_MERCHANT_HOSTNAME,
  approvedProductService,
  normalizeApprovedAffiliateUrl
} from '../../products/services/approvedProductService';
import { CreatorAffiliatePilotPanel } from '../components/CreatorAffiliatePilotPanel';

interface ProductDraft {
  name: string;
  affiliateUrl: string;
  active: boolean;
  imageFile?: File;
}

const emptyDraft: ProductDraft = { name: '', affiliateUrl: '', active: true };

type ApprovedProductAdminService = Pick<typeof approvedProductService,
  'listAdminProducts' | 'createProduct' | 'updateProduct' | 'setProductActive'>;

export function AdminApprovedProductsPage({
  currentUser,
  service = approvedProductService
}: {
  currentUser: User;
  service?: ApprovedProductAdminService;
}) {
  const [products, setProducts] = useState<ApprovedProduct[]>([]);
  const [editingProduct, setEditingProduct] = useState<ApprovedProduct | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingProductId, setPendingProductId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setProducts(await service.listAdminProducts());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load approved products.');
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openCreate = () => {
    setEditingProduct(null);
    setDraft(emptyDraft);
    setError('');
    setSuccess('');
    setIsFormOpen(true);
  };

  const openEdit = (product: ApprovedProduct) => {
    setEditingProduct(product);
    setDraft({ name: product.name, affiliateUrl: product.affiliateUrl, active: product.active });
    setError('');
    setSuccess('');
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingProduct(null);
    setDraft(emptyDraft);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const name = draft.name.trim();
    const affiliateUrl = normalizeApprovedAffiliateUrl(draft.affiliateUrl);
    if (!name) {
      setError('Enter a product name.');
      return;
    }
    if (!affiliateUrl) {
      setError(`Affiliate URL must use https://${APPROVED_MERCHANT_HOSTNAME}.`);
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingProduct) {
        await service.updateProduct({
          product: editingProduct,
          name,
          affiliateUrl,
          active: draft.active,
          imageFile: draft.imageFile,
          userId: currentUser.uid
        });
        setSuccess(`${name} was updated.`);
      } else {
        await service.createProduct({
          name,
          affiliateUrl,
          active: draft.active,
          imageFile: draft.imageFile,
          userId: currentUser.uid
        });
        setSuccess(`${name} was created.`);
      }
      setIsFormOpen(false);
      setEditingProduct(null);
      setDraft(emptyDraft);
      await loadProducts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the approved product.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProduct = async (product: ApprovedProduct) => {
    if (pendingProductId) return;
    setPendingProductId(product.id);
    setError('');
    setSuccess('');
    try {
      await service.setProductActive(product.id, !product.active, currentUser.uid);
      setSuccess(`${product.name} is now ${product.active ? 'inactive' : 'active'}.`);
      await loadProducts();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update the product status.');
    } finally {
      setPendingProductId('');
    }
  };

  return (
    <>
    <section className="rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-primary/10 p-3 text-primary"><PackageCheck className="h-5 w-5" /></span>
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Admin</p>
            <h3 className="mt-1 font-display text-2xl font-bold text-primary">Approved Products</h3>
            <p className="mt-2 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
              Manage products chefs may recommend. Affiliate destinations are restricted to {APPROVED_MERCHANT_HOSTNAME}.
            </p>
          </div>
        </div>
        <button type="button" onClick={openCreate} className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-2xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">{error}</p>}
      {success && <p role="status" className="mt-5 rounded-2xl bg-primary/10 px-4 py-3 font-sans text-sm font-bold text-primary">{success}</p>}

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-2xl border border-surface-container-high bg-surface-container-low p-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-display text-xl font-bold text-primary">{editingProduct ? 'Edit Product' : 'Create Product'}</h4>
            <button type="button" onClick={closeForm} aria-label="Close product form" className="rounded-full p-2 text-outline hover:bg-surface-container-high"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Product Name</span>
              <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} disabled={isSaving} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Affiliate URL</span>
              <input type="url" inputMode="url" value={draft.affiliateUrl} onChange={event => setDraft(current => ({ ...current, affiliateUrl: event.target.value }))} disabled={isSaving} placeholder={`https://${APPROVED_MERCHANT_HOSTNAME}/...`} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="font-sans text-xs font-extrabold text-primary">Product Image <span className="text-outline">(optional)</span></span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setDraft(current => ({ ...current, imageFile: event.target.files?.[0] }))} disabled={isSaving} className="mt-2 block w-full font-sans text-sm font-bold text-on-surface-variant file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:font-bold file:text-primary" />
              <span className="mt-2 block font-sans text-[11px] font-semibold text-outline">Images are optimized to 400 × 400 JPEG.</span>
            </label>
            <div>
              <span className="font-sans text-xs font-extrabold text-primary">Merchant Hostname</span>
              <div className="mt-2 rounded-xl border border-surface-container-high bg-surface-container px-4 py-3 font-sans text-sm font-bold text-on-surface-variant">{APPROVED_MERCHANT_HOSTNAME}</div>
            </div>
          </div>
          <label className="flex items-center gap-3 font-sans text-sm font-bold text-primary">
            <input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} disabled={isSaving} className="h-4 w-4 rounded border-outline text-primary" />
            Active and available to chefs
          </label>
          <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-6 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-60">
            {isSaving ? 'Saving…' : editingProduct ? 'Save Changes' : 'Create Product'}
          </button>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold text-on-surface-variant">Loading approved products…</p>
        ) : products.length === 0 ? (
          <p className="rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold text-on-surface-variant">No approved products yet.</p>
        ) : products.map(product => (
          <article key={product.id} className="flex flex-col gap-4 rounded-2xl border border-surface-container-high p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-surface-container-high bg-white object-contain p-1" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-outline"><ImageIcon className="h-5 w-5" /></span>}
              <div className="min-w-0">
                <h4 className="break-words font-sans text-sm font-extrabold text-primary">{product.name}</h4>
                <p className="mt-1 font-sans text-xs font-bold text-outline">{product.merchantHostname}</p>
                <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-sans text-[10px] font-extrabold uppercase tracking-wide ${product.active ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-outline'}`}>{product.active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => openEdit(product)} className="flex items-center gap-2 rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-bold text-primary"><Pencil className="h-4 w-4" /> Edit</button>
              <button type="button" onClick={() => void toggleProduct(product)} disabled={pendingProductId === product.id} className="rounded-full bg-surface-container-low px-4 py-2 font-sans text-xs font-bold text-primary disabled:opacity-60">{product.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
    <CreatorAffiliatePilotPanel currentUser={currentUser} />
    </>
  );
}
