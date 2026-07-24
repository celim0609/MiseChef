import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ExternalLink, ImagePlus, Pencil, Plus, Store as StoreIcon } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Workspace } from '../../types';
import { formatRegionCurrency, useWorkspaceRegion } from '../../regions';
import { uploadStoreBrandImage, uploadStoreProductPhoto } from '../../services/storage';
import { storeService } from './services';
import {
  validateStoreProduct,
  validateStoreSettings
} from './storeModel';
import type {
  StoreProduct,
  StoreProductDraft,
  StoreSettingsDraft,
  WorkspaceStore
} from './types';

interface StorePageProps {
  currentUser: User;
  workspace: Workspace;
}

const emptyProductDraft = (): StoreProductDraft => ({
  photoUrl: '',
  name: '',
  description: '',
  price: 0,
  available: true
});

const toSettingsDraft = (store: WorkspaceStore): StoreSettingsDraft => ({
  name: store.name,
  logoUrl: store.logoUrl,
  coverImageUrl: store.coverImageUrl,
  description: store.description,
  businessHours: store.businessHours,
  pickupEnabled: store.pickupEnabled,
  deliveryEnabled: store.deliveryEnabled
});

const toProductDraft = (product: StoreProduct): StoreProductDraft => ({
  photoUrl: product.photoUrl,
  name: product.name,
  description: product.description,
  price: product.price,
  available: product.available
});

export default function StorePage({ currentUser, workspace }: StorePageProps) {
  const region = useWorkspaceRegion();
  const [store, setStore] = useState<WorkspaceStore | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<StoreSettingsDraft | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [productDraft, setProductDraft] = useState<StoreProductDraft>(emptyProductDraft);
  const [productPhotoFile, setProductPhotoFile] = useState<File | null>(null);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadStore = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const [loadedStore, loadedProducts] = await Promise.all([
          storeService.ensureWorkspaceStore(workspace, currentUser.uid),
          storeService.listProducts(workspace.id)
        ]);
        if (isCancelled) return;
        setStore(loadedStore);
        setSettingsDraft(toSettingsDraft(loadedStore));
        setProducts(loadedProducts);
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load this Store.');
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadStore();
    return () => {
      isCancelled = true;
    };
  }, [currentUser.uid, workspace]);

  const updateSettings = <K extends keyof StoreSettingsDraft>(
    field: K,
    value: StoreSettingsDraft[K]
  ) => {
    setSettingsDraft(current => current ? { ...current, [field]: value } : current);
  };

  const updateProduct = <K extends keyof StoreProductDraft>(
    field: K,
    value: StoreProductDraft[K]
  ) => {
    setProductDraft(current => ({ ...current, [field]: value }));
  };

  const handleSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!store || !settingsDraft || isSaving) return;

    const validationError = validateStoreSettings(settingsDraft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const [logoUrl, coverImageUrl] = await Promise.all([
        logoFile
          ? uploadStoreBrandImage({ workspaceId: workspace.id, kind: 'logo', file: logoFile })
          : Promise.resolve(settingsDraft.logoUrl),
        coverFile
          ? uploadStoreBrandImage({ workspaceId: workspace.id, kind: 'cover', file: coverFile })
          : Promise.resolve(settingsDraft.coverImageUrl)
      ]);
      const updatedStore = await storeService.updateStore(store, {
        ...settingsDraft,
        logoUrl,
        coverImageUrl
      });
      setStore(updatedStore);
      setSettingsDraft(toSettingsDraft(updatedStore));
      setLogoFile(null);
      setCoverFile(null);
      setMessage('Store settings saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save Store settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductDraft(emptyProductDraft());
    setProductPhotoFile(null);
    setIsProductFormOpen(true);
    setMessage('');
    setErrorMessage('');
  };

  const openProductEditor = (product: StoreProduct) => {
    setEditingProduct(product);
    setProductDraft(toProductDraft(product));
    setProductPhotoFile(null);
    setIsProductFormOpen(true);
    setMessage('');
    setErrorMessage('');
  };

  const handleProductSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!store || isSaving) return;

    const preflightError = validateStoreProduct({
      ...productDraft,
      photoUrl: productPhotoFile ? 'pending-upload' : productDraft.photoUrl
    });
    if (preflightError) {
      setErrorMessage(preflightError);
      return;
    }

    setIsSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const productId = editingProduct?.id || storeService.createProductId();
      const photoUrl = productPhotoFile
        ? await uploadStoreProductPhoto({
          workspaceId: workspace.id,
          productId,
          file: productPhotoFile
        })
        : productDraft.photoUrl;
      const nextDraft = { ...productDraft, photoUrl };
      const validationError = validateStoreProduct(nextDraft);
      if (validationError) throw new Error(validationError);

      const savedProduct = editingProduct
        ? await storeService.updateProduct(editingProduct, nextDraft)
        : await storeService.createProduct({
          id: productId,
          workspaceId: workspace.id,
          draft: nextDraft,
          createdBy: currentUser.uid
        });

      setProducts(current => {
        const withoutSavedProduct = current.filter(product => product.id !== savedProduct.id);
        return [savedProduct, ...withoutSavedProduct]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setEditingProduct(null);
      setProductDraft(emptyProductDraft());
      setProductPhotoFile(null);
      setIsProductFormOpen(false);
      setMessage(editingProduct ? 'Product updated.' : 'Product added.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save this product.');
    } finally {
      setIsSaving(false);
    }
  };

  const readImageFile = (
    event: ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void
  ) => setter(event.target.files?.[0] || null);

  if (isLoading) {
    return <div className="h-80 animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading Store" />;
  }

  if (!store || !settingsDraft) {
    return (
      <section className="rounded-3xl border border-error/30 bg-error/10 p-8 text-center">
        <h1 className="font-display text-3xl font-bold text-error">Store unavailable</h1>
        <p className="mt-3 font-sans text-sm font-bold text-error">{errorMessage || 'This Store could not be loaded.'}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Chef Store</p>
            <h1 className="mt-1 font-display text-4xl font-bold text-primary">Store</h1>
            <p className="mt-3 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
              Manage public Store information and simple products for {workspace.name}. Ordering is not enabled yet.
            </p>
          </div>
          <a
            href={`/store/${store.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary"
          >
            <ExternalLink className="h-4 w-4" />
            View Public Store
          </a>
        </div>
      </section>

      {(message || errorMessage) && (
        <p className={`rounded-2xl border p-4 font-sans text-sm font-bold ${
          errorMessage
            ? 'border-error/30 bg-error/10 text-error'
            : 'border-primary/20 bg-primary/10 text-primary'
        }`}>
          {errorMessage || message}
        </p>
      )}

      <form onSubmit={handleSettingsSave} className="rounded-3xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-primary/10 p-3 text-primary"><StoreIcon className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-2xl font-bold text-primary">Store Settings</h2>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">
              {region.countryName} · {region.currency} · /store/{store.slug}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Store Name</span>
            <input value={settingsDraft.name} onChange={event => updateSettings('name', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Business Hours</span>
            <input value={settingsDraft.businessHours} onChange={event => updateSettings('businessHours', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Logo</span>
            <span className="mt-2 flex min-h-24 items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-4">
              {settingsDraft.logoUrl && <img src={settingsDraft.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />}
              <span className="min-w-0 flex-1 font-sans text-xs font-bold text-on-surface-variant">{logoFile?.name || 'JPG, PNG, or WebP'}</span>
              <ImagePlus className="h-5 w-5 text-primary" />
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => readImageFile(event, setLogoFile)} className="mt-2 block w-full font-sans text-xs font-bold text-on-surface-variant" />
          </label>
          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Cover Image</span>
            <span className="mt-2 flex min-h-24 items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-4">
              {settingsDraft.coverImageUrl && <img src={settingsDraft.coverImageUrl} alt="" className="h-16 w-24 rounded-2xl object-cover" />}
              <span className="min-w-0 flex-1 font-sans text-xs font-bold text-on-surface-variant">{coverFile?.name || 'JPG, PNG, or WebP'}</span>
              <ImagePlus className="h-5 w-5 text-primary" />
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => readImageFile(event, setCoverFile)} className="mt-2 block w-full font-sans text-xs font-bold text-on-surface-variant" />
          </label>
          <label className="block md:col-span-2">
            <span className="font-sans text-xs font-extrabold text-primary">Description</span>
            <textarea rows={4} value={settingsDraft.description} onChange={event => updateSettings('description', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-4">
            <span className="font-sans text-sm font-extrabold text-primary">Pickup</span>
            <input type="checkbox" checked={settingsDraft.pickupEnabled} onChange={event => updateSettings('pickupEnabled', event.target.checked)} className="h-5 w-5 rounded border-surface-container-high text-primary" />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-4">
            <span className="font-sans text-sm font-extrabold text-primary">Delivery</span>
            <input type="checkbox" checked={settingsDraft.deliveryEnabled} onChange={event => updateSettings('deliveryEnabled', event.target.checked)} className="h-5 w-5 rounded border-surface-container-high text-primary" />
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save Store Settings'}
          </button>
        </div>
      </form>

      <section className="rounded-3xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-primary">Products</h2>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Simple products only—no categories, inventory, or SKU.</p>
          </div>
          <button type="button" onClick={openNewProduct} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </div>

        {isProductFormOpen && (
          <form onSubmit={handleProductSave} className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 p-5">
            <h3 className="font-display text-xl font-bold text-primary">{editingProduct ? 'Edit Product' : 'New Product'}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="font-sans text-xs font-extrabold text-primary">Product Name</span>
                <input value={productDraft.name} onChange={event => updateProduct('name', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="font-sans text-xs font-extrabold text-primary">Price ({region.currency})</span>
                <input type="number" min="0" step="0.01" value={productDraft.price} onChange={event => updateProduct('price', Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
              </label>
              <label className="block md:col-span-2">
                <span className="font-sans text-xs font-extrabold text-primary">Description</span>
                <textarea rows={3} value={productDraft.description} onChange={event => updateProduct('description', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="font-sans text-xs font-extrabold text-primary">Photo</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => readImageFile(event, setProductPhotoFile)} className="mt-2 block w-full font-sans text-xs font-bold text-on-surface-variant" />
                <span className="mt-1 block font-sans text-[11px] font-bold text-outline">{productPhotoFile?.name || (productDraft.photoUrl ? 'Existing photo retained' : 'Photo required')}</span>
              </label>
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-white px-4 py-3">
                <span className="font-sans text-sm font-extrabold text-primary">Available</span>
                <input type="checkbox" checked={productDraft.available} onChange={event => updateProduct('available', event.target.checked)} className="h-5 w-5 rounded border-surface-container-high text-primary" />
              </label>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsProductFormOpen(false)} className="rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary">Cancel</button>
              <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Product'}</button>
            </div>
          </form>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map(product => (
            <article key={product.id} className="overflow-hidden rounded-3xl border border-surface-container-high bg-surface-container-low">
              <img src={product.photoUrl} alt={product.name} className="h-44 w-full object-cover" referrerPolicy="no-referrer" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold text-primary">{product.name}</h3>
                    <p className="mt-1 font-sans text-sm font-extrabold text-secondary">{formatRegionCurrency(product.price, region.currency)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${product.available ? 'bg-green-100 text-green-800' : 'bg-surface-container-high text-outline'}`}>
                    {product.available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                {product.description && <p className="mt-3 line-clamp-3 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
                <button type="button" onClick={() => openProductEditor(product)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-primary shadow-sm">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </div>
            </article>
          ))}
          {products.length === 0 && (
            <div className="rounded-3xl border border-dashed border-outline-variant p-8 text-center sm:col-span-2 xl:col-span-3">
              <p className="font-display text-2xl font-bold text-primary">No products yet</p>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Add the first product customers will see in this Store.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
