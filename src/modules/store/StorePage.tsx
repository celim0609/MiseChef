import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  MapPin,
  Package,
  Pencil,
  Plus,
  QrCode,
  Share2,
  Settings,
  Trash2,
  X
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Workspace } from '../../types';
import { formatRegionCurrency, useWorkspaceRegion } from '../../regions';
import {
  deleteStoreProductPhoto,
  uploadStoreBrandImage,
  uploadStorePaymentQr,
  uploadStoreProductPhoto
} from '../../services/storage';
import { storeService } from './services';
import StoreOrdersPanel from './StoreOrdersPanel';
import {
  getPublicOrderingPath,
  getPublicOrderingUrl,
  getStoreQrFileName
} from './customerEntry';
import {
  formatPickupDateLabel,
  STORE_PAYMENT_METHODS,
  STORE_ORDER_DAYS,
  validateStoreOptionGroup,
  validateStoreProduct,
  validateStoreSettings
} from './storeModel';
import type {
  StoreOptionGroup,
  StoreNotification,
  StoreProduct,
  StoreProductDraft,
  StoreSettingsDraft,
  WorkspaceStore
} from './types';

interface StorePageProps {
  currentUser: User;
  workspace: Workspace;
  focusOrderId?: string;
  notifications?: StoreNotification[];
  onNotificationClick?: (notification: StoreNotification) => void;
}

type StoreView = 'products' | 'orders' | 'pickup' | 'settings';

interface ProductOptionEditor {
  id: string;
  name: string;
  selectionType: StoreOptionGroup['selectionType'];
  required: boolean;
  minimumSelections: number;
  maximumSelections: number;
  sortOrder: number;
  available: boolean;
  options: StoreOptionGroup['options'];
}

const emptyProductDraft = (): StoreProductDraft => ({
  photoUrl: '',
  name: '',
  description: '',
  price: 0,
  available: true,
  optionGroupIds: []
});

const toSettingsDraft = (store: WorkspaceStore): StoreSettingsDraft => ({
  name: store.name,
  logoUrl: store.logoUrl,
  coverImageUrl: store.coverImageUrl,
  description: store.description,
  contactInformation: store.contactInformation,
  businessWhatsApp: store.businessWhatsApp,
  storeContact: { ...store.storeContact },
  businessHours: store.businessHours,
  pickupEnabled: store.pickupEnabled,
  deliveryEnabled: store.deliveryEnabled,
  pickupSessions: [...store.pickupSessions],
  pickupLocations: store.pickupLocations.map(location => ({ ...location })),
  orderDays: [...store.orderDays],
  earliestPickupDays: store.earliestPickupDays,
  maximumAdvanceDays: store.maximumAdvanceDays,
  unavailableDates: [...store.unavailableDates],
  paymentMethods: store.paymentMethods.map(method => ({ ...method }))
});

const toProductDraft = (product: StoreProduct): StoreProductDraft => ({
  photoUrl: product.photoUrl,
  name: product.name,
  description: product.description,
  price: product.price,
  available: product.available,
  optionGroupIds: [...product.optionGroupIds]
});

const toProductOptionEditor = (
  group: StoreOptionGroup,
  sortOrder: number
): ProductOptionEditor => ({
  id: group.id,
  name: group.name,
  selectionType: group.selectionType,
  required: group.required,
  minimumSelections: group.minimumSelections,
  maximumSelections: group.maximumSelections,
  sortOrder,
  available: group.available,
  options: group.options
    .map(option => ({ ...option }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option, index) => ({ ...option, sortOrder: index }))
});

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const viewItems: Array<{ id: StoreView; label: string; question: string; icon: typeof Package }> = [
  { id: 'products', label: 'Products', question: 'What am I selling?', icon: Package },
  { id: 'orders', label: 'Orders', question: 'What have customers ordered?', icon: ClipboardList },
  { id: 'pickup', label: 'Pickup', question: 'Where and when do customers collect?', icon: MapPin },
  { id: 'settings', label: 'Store Settings', question: 'How does my store look?', icon: Settings }
];

export default function StorePage({
  currentUser,
  workspace,
  focusOrderId = '',
  notifications = [],
  onNotificationClick = () => undefined
}: StorePageProps) {
  const region = useWorkspaceRegion();
  const [activeView, setActiveView] = useState<StoreView>('products');
  const [store, setStore] = useState<WorkspaceStore | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<StoreSettingsDraft | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [optionGroups, setOptionGroups] = useState<StoreOptionGroup[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [paymentQrFiles, setPaymentQrFiles] = useState<Partial<Record<'touch_n_go_qr' | 'duitnow_qr', File>>>({});
  const [productDraft, setProductDraft] = useState<StoreProductDraft>(emptyProductDraft);
  const [productOptions, setProductOptions] = useState<ProductOptionEditor[]>([]);
  const [savedOptionGroupId, setSavedOptionGroupId] = useState('');
  const [productPhotoFile, setProductPhotoFile] = useState<File | null>(null);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [unavailableDateDraft, setUnavailableDateDraft] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadStore = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const [loadedStore, loadedProducts, loadedOptionGroups] = await Promise.all([
          storeService.ensureWorkspaceStore(workspace, currentUser.uid),
          storeService.listProducts(workspace.id),
          storeService.listOptionGroups(workspace.id)
        ]);
        if (isCancelled) return;
        setStore(loadedStore);
        setSettingsDraft(toSettingsDraft(loadedStore));
        setProducts(loadedProducts);
        setOptionGroups(loadedOptionGroups);
        setActiveView('products');
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

  useEffect(() => {
    if (!focusOrderId) return;
    setActiveView('orders');
    setIsProductFormOpen(false);
  }, [focusOrderId]);

  useEffect(() => {
    if (!isShareOpen || !store) return;

    let isCancelled = false;
    setIsGeneratingQr(true);
    setShareMessage('');
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(
        getPublicOrderingUrl(window.location.origin, store.slug),
        {
          width: 768,
          margin: 3,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#1f2933',
            light: '#ffffff'
          }
        }
      ))
      .then(dataUrl => {
        if (!isCancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!isCancelled) setShareMessage('Unable to create the QR code. Please try again.');
      })
      .finally(() => {
        if (!isCancelled) setIsGeneratingQr(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isShareOpen, store]);

  const updateSettings = <K extends keyof StoreSettingsDraft>(
    field: K,
    value: StoreSettingsDraft[K]
  ) => {
    setSettingsDraft(current => current ? { ...current, [field]: value } : current);
  };

  const updateStoreContact = (
    field: keyof StoreSettingsDraft['storeContact'],
    value: string
  ) => {
    setSettingsDraft(current => current ? {
      ...current,
      ...(field === 'whatsapp' ? { businessWhatsApp: value } : {}),
      storeContact: { ...current.storeContact, [field]: value }
    } : current);
  };

  const toggleOrderDay = (dayId: StoreSettingsDraft['orderDays'][number]) => {
    if (!settingsDraft) return;
    const selected = settingsDraft.orderDays.includes(dayId);
    const nextDays = selected
      ? settingsDraft.orderDays.filter(day => day !== dayId)
      : STORE_ORDER_DAYS
        .map(day => day.id)
        .filter(day => [...settingsDraft.orderDays, dayId].includes(day));
    updateSettings('orderDays', nextDays);
  };

  const addUnavailableDate = () => {
    if (!settingsDraft || !unavailableDateDraft || settingsDraft.unavailableDates.includes(unavailableDateDraft)) return;
    updateSettings('unavailableDates', [...settingsDraft.unavailableDates, unavailableDateDraft].sort());
    setUnavailableDateDraft('');
  };

  const updateProduct = <K extends keyof StoreProductDraft>(
    field: K,
    value: StoreProductDraft[K]
  ) => {
    setProductDraft(current => ({ ...current, [field]: value }));
  };

  const clearMessages = () => {
    setMessage('');
    setErrorMessage('');
  };

  const copyOrderingLink = async () => {
    if (!store) return;
    try {
      await navigator.clipboard.writeText(getPublicOrderingUrl(window.location.origin, store.slug));
      setShareMessage('Ordering link copied.');
    } catch {
      setShareMessage('Copy failed. Select the link and copy it manually.');
    }
  };

  const downloadQrCode = () => {
    if (!store || !qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = getStoreQrFileName(store.slug);
    link.click();
    setShareMessage('QR code downloaded.');
  };

  const saveStoreDraft = async (draft: StoreSettingsDraft, successMessage: string) => {
    if (!store || isSaving) return;
    const validationError = validateStoreSettings(draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    clearMessages();
    try {
      const updatedStore = await storeService.updateStore(store, draft);
      setStore(updatedStore);
      setSettingsDraft(toSettingsDraft(updatedStore));
      setMessage(successMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save this Store.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickupSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settingsDraft) return;
    await saveStoreDraft(settingsDraft, 'Pickup details saved.');
  };

  const handleSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!store || !settingsDraft || isSaving) return;

    setIsSaving(true);
    clearMessages();
    try {
      const [logoUrl, coverImageUrl] = await Promise.all([
        logoFile
          ? uploadStoreBrandImage({ workspaceId: workspace.id, kind: 'logo', file: logoFile })
          : Promise.resolve(settingsDraft.logoUrl),
        coverFile
          ? uploadStoreBrandImage({ workspaceId: workspace.id, kind: 'cover', file: coverFile })
          : Promise.resolve(settingsDraft.coverImageUrl)
      ]);
      const paymentMethods = await Promise.all(settingsDraft.paymentMethods.map(async method => {
        if (method.id !== 'touch_n_go_qr' && method.id !== 'duitnow_qr') return method;
        const file = paymentQrFiles[method.id];
        if (!file) return method;
        return {
          ...method,
          qrCodeUrl: await uploadStorePaymentQr({ workspaceId: workspace.id, methodId: method.id, file })
        };
      }));
      const nextDraft = { ...settingsDraft, logoUrl, coverImageUrl, paymentMethods };
      const validationError = validateStoreSettings(nextDraft);
      if (validationError) throw new Error(validationError);
      const updatedStore = await storeService.updateStore(store, nextDraft);
      setStore(updatedStore);
      setSettingsDraft(toSettingsDraft(updatedStore));
      setLogoFile(null);
      setCoverFile(null);
      setPaymentQrFiles({});
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
    setProductOptions([]);
    setSavedOptionGroupId('');
    setProductPhotoFile(null);
    setIsProductFormOpen(true);
    clearMessages();
  };

  const openProductEditor = (product: StoreProduct) => {
    setEditingProduct(product);
    setProductDraft(toProductDraft(product));
    setProductOptions(product.optionGroupIds.flatMap(groupId => {
      const group = optionGroups.find(candidate => candidate.id === groupId);
      return group ? [toProductOptionEditor(group, product.optionGroupIds.indexOf(groupId))] : [];
    }));
    setSavedOptionGroupId('');
    setProductPhotoFile(null);
    setIsProductFormOpen(true);
    clearMessages();
  };

  const addNewProductOptionGroup = () => {
    setProductOptions(current => [
      ...current,
      {
        id: storeService.createOptionGroupId(),
        name: '',
        selectionType: 'single',
        required: true,
        minimumSelections: 1,
        maximumSelections: 1,
        sortOrder: current.length,
        available: true,
        options: [],
      }
    ]);
  };

  const attachSavedOptionGroup = () => {
    if (!savedOptionGroupId || productOptions.some(group => group.id === savedOptionGroupId)) return;
    const group = optionGroups.find(candidate => candidate.id === savedOptionGroupId);
    if (!group) return;
    setProductOptions(current => [
      ...current,
      toProductOptionEditor(group, current.length)
    ]);
    setSavedOptionGroupId('');
  };

  const handleProductSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!store || isSaving) return;

    const preflightError = validateStoreProduct({
      ...productDraft,
      photoUrl: productPhotoFile ? 'pending-upload' : productDraft.photoUrl,
      optionGroupIds: productOptions.map(group => group.id)
    });
    const optionError = productOptions
      .map((group, groupIndex) => validateStoreOptionGroup({
        ...group,
        sortOrder: groupIndex,
        options: group.options.map((option, optionIndex) => ({
          ...option,
          sortOrder: optionIndex
        }))
      }))
      .find(Boolean);
    if (preflightError || optionError) {
      setErrorMessage(preflightError || optionError || '');
      return;
    }

    setIsSaving(true);
    clearMessages();
    try {
      const savedGroups = await Promise.all(productOptions.map((group, groupIndex) => {
        const draft = {
          ...group,
          sortOrder: groupIndex,
          options: group.options.map((option, optionIndex) => ({
            ...option,
            sortOrder: optionIndex
          }))
        };
        const existing = optionGroups.find(candidate => candidate.id === group.id);
        return existing
          ? storeService.updateOptionGroup(existing, draft)
          : storeService.createOptionGroup({
            id: group.id,
            workspaceId: workspace.id,
            draft,
            createdBy: currentUser.uid
          });
      }));
      const productId = editingProduct?.id || storeService.createProductId();
      const photoUrl = productPhotoFile
        ? await uploadStoreProductPhoto({
          workspaceId: workspace.id,
          productId,
          file: productPhotoFile
        })
        : productDraft.photoUrl;
      const nextDraft: StoreProductDraft = {
        ...productDraft,
        photoUrl,
        optionGroupIds: savedGroups.map(group => group.id)
      };
      const savedProduct = editingProduct
        ? await storeService.updateProduct(editingProduct, nextDraft)
        : await storeService.createProduct({
          id: productId,
          workspaceId: workspace.id,
          draft: nextDraft,
            createdBy: currentUser.uid
          });
      const orphanedGroupIds = editingProduct
        ? editingProduct.optionGroupIds.filter(groupId => (
          !nextDraft.optionGroupIds.includes(groupId)
          && !products.some(product => (
            product.id !== editingProduct.id && product.optionGroupIds.includes(groupId)
          ))
        ))
        : [];
      const deletionResults = await Promise.allSettled(
        orphanedGroupIds.map(groupId => storeService.deleteOptionGroup(groupId))
      );
      const deletedGroupIds = new Set(orphanedGroupIds.filter((_, index) => (
        deletionResults[index].status === 'fulfilled'
      )));
      const groupDeletionFailed = deletionResults.some(result => result.status === 'rejected');

      setOptionGroups(current => {
        const savedIds = new Set(savedGroups.map(group => group.id));
        return [...current.filter(group => !savedIds.has(group.id) && !deletedGroupIds.has(group.id)), ...savedGroups]
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      });
      setProducts(current => [
        savedProduct,
        ...current.filter(product => product.id !== savedProduct.id)
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setEditingProduct(null);
      setProductDraft(emptyProductDraft());
      setProductOptions([]);
      setProductPhotoFile(null);
      setIsProductFormOpen(false);
      setMessage(groupDeletionFailed
        ? 'Product saved. One unused option group could not be deleted; please try again.'
        : editingProduct ? 'Product updated.' : 'Product added.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save this product.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProductDelete = async () => {
    if (!editingProduct || isSaving) return;
    if (!window.confirm(`Delete ${editingProduct.name}? This cannot be undone.`)) return;

    setIsSaving(true);
    clearMessages();
    const productToDelete = editingProduct;
    try {
      await storeService.deleteProduct(productToDelete.id);
      await deleteStoreProductPhoto({
        workspaceId: workspace.id,
        productId: productToDelete.id,
        photoUrl: productToDelete.photoUrl
      });
      const sharedGroupIds = new Set(
        products
          .filter(product => product.id !== productToDelete.id)
          .flatMap(product => product.optionGroupIds)
      );
      const orphanedGroupIds = productToDelete.optionGroupIds.filter(groupId => !sharedGroupIds.has(groupId));
      await Promise.allSettled(orphanedGroupIds.map(groupId => storeService.deleteOptionGroup(groupId)));
      setProducts(current => current.filter(product => product.id !== productToDelete.id));
      setOptionGroups(current => current.filter(group => !orphanedGroupIds.includes(group.id)));
      setEditingProduct(null);
      setProductDraft(emptyProductDraft());
      setProductOptions([]);
      setProductPhotoFile(null);
      setIsProductFormOpen(false);
      setMessage('Product deleted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete this product.');
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

  const currentView = viewItems.find(item => item.id === activeView) || viewItems[0];
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Chef Store</p>
          <h1 className="mt-1 font-display text-4xl font-bold text-primary">{currentView.label}</h1>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">{currentView.question}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setIsShareOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary shadow-sm">
            <Share2 className="h-4 w-4" /> Share & QR
          </button>
          <a href={getPublicOrderingPath(store.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-surface-container-high bg-white px-5 py-3 font-sans text-xs font-extrabold text-primary shadow-sm">
            <ExternalLink className="h-4 w-4" /> View Store
          </a>
        </div>
      </header>

      <nav aria-label="Store management" className="flex gap-2 overflow-x-auto pb-1">
        {viewItems.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" onClick={() => {
              setActiveView(item.id);
              setIsProductFormOpen(false);
              clearMessages();
            }} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 font-sans text-xs font-extrabold transition ${
              activeView === item.id
                ? 'bg-primary text-on-primary'
                : 'bg-white text-primary shadow-sm'
            }`}>
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
      </nav>

      {(message || errorMessage) && (
        <p className={`rounded-2xl px-4 py-3 font-sans text-sm font-bold ${
          errorMessage ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
        }`}>
          {errorMessage || message}
        </p>
      )}

      {activeView === 'products' && (
        <section>
          <div className="flex items-center justify-between gap-4">
            <p className="font-sans text-sm font-bold text-on-surface-variant">{products.length} {products.length === 1 ? 'product' : 'products'}</p>
            <button type="button" onClick={openNewProduct} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>

          {isProductFormOpen && (
            <form onSubmit={handleProductSave} className="mt-6 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold text-primary">{editingProduct ? 'Edit Product' : 'New Product'}</h2>
                <button type="button" aria-label="Close product editor" onClick={() => setIsProductFormOpen(false)} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-4 w-4" /></button>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Product Name</span>
                  <input value={productDraft.name} onChange={event => updateProduct('name', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Price ({region.currency})</span>
                  <input type="number" min="0" step="0.01" value={productDraft.price} onChange={event => updateProduct('price', Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block md:col-span-2">
                  <span className="font-sans text-xs font-extrabold text-primary">Description</span>
                  <textarea rows={3} value={productDraft.description} onChange={event => updateProduct('description', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Photo</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => readImageFile(event, setProductPhotoFile)} className="mt-2 block w-full font-sans text-xs font-bold text-on-surface-variant" />
                  <span className="mt-1 block font-sans text-[11px] font-bold text-outline">{productPhotoFile?.name || (productDraft.photoUrl ? 'Existing photo retained' : 'Photo required')}</span>
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-low px-4 py-3">
                  <span className="font-sans text-sm font-extrabold text-primary">Available</span>
                  <input type="checkbox" checked={productDraft.available} onChange={event => updateProduct('available', event.target.checked)} className="h-5 w-5 rounded border-surface-container-high text-primary" />
                </label>
              </div>

              <div className="mt-8 border-t border-surface-container-high pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl font-bold text-primary">Options</h3>
                    <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Only add these when customers need to choose.</p>
                  </div>
                  <button type="button" onClick={addNewProductOptionGroup} className="inline-flex items-center justify-center gap-2 rounded-full bg-surface-container px-4 py-2.5 font-sans text-xs font-extrabold text-primary">
                    <Plus className="h-3.5 w-3.5" /> Add Options
                  </button>
                </div>

                {productOptions.length > 0 && (
                  <div className="mt-5 space-y-4">
                    {productOptions.map((group, groupIndex) => (
                      <div key={group.id} className="rounded-2xl bg-surface-container-low p-4">
                        <div className="flex flex-wrap gap-2">
                          <input aria-label={`Option group ${groupIndex + 1} name`} placeholder="Option name, e.g. Drink" value={group.name} onChange={event => setProductOptions(current => current.map(item => item.id === group.id ? { ...item, name: event.target.value } : item))} className="min-w-0 flex-1 rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                          <button type="button" disabled={groupIndex === 0} aria-label={`Move option group ${groupIndex + 1} up`} onClick={() => setProductOptions(current => moveItem(current, groupIndex, groupIndex - 1))} className="rounded-xl bg-white p-2.5 text-primary disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                          <button type="button" disabled={groupIndex === productOptions.length - 1} aria-label={`Move option group ${groupIndex + 1} down`} onClick={() => setProductOptions(current => moveItem(current, groupIndex, groupIndex + 1))} className="rounded-xl bg-white p-2.5 text-primary disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Delete option group ${groupIndex + 1}`} onClick={() => setProductOptions(current => current.filter(item => item.id !== group.id))} className="rounded-xl bg-white p-2.5 text-error"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="block">
                            <span className="font-sans text-[11px] font-extrabold text-primary">Selection Type</span>
                            <select aria-label={`${group.name || 'Option'} selection type`} value={group.selectionType} onChange={event => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                              ...item,
                              selectionType: event.target.value === 'multiple' ? 'multiple' : 'single',
                              minimumSelections: Math.min(item.minimumSelections, 1),
                              maximumSelections: event.target.value === 'multiple'
                                ? Math.max(1, Math.min(item.maximumSelections, Math.max(1, item.options.length)))
                                : 1
                            }))} className="mt-1 w-full rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-xs font-bold text-primary">
                              <option value="single">Single Select</option>
                              <option value="multiple">Multiple Select</option>
                            </select>
                          </label>
                          <label className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 sm:self-end">
                            <span className="font-sans text-[11px] font-extrabold text-primary">Required</span>
                            <input aria-label={`${group.name || 'Option'} required`} type="checkbox" checked={group.required} onChange={event => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                              ...item,
                              required: event.target.checked,
                              minimumSelections: event.target.checked ? Math.max(1, item.minimumSelections) : 0
                            }))} className="h-4 w-4 rounded border-surface-container-high text-primary" />
                          </label>
                          <label className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 sm:self-end">
                            <span className="font-sans text-[11px] font-extrabold text-primary">Available</span>
                            <input aria-label={`${group.name || 'Option'} group available`} type="checkbox" checked={group.available} onChange={event => setProductOptions(current => current.map(item => item.id === group.id ? { ...item, available: event.target.checked } : item))} className="h-4 w-4 rounded border-surface-container-high text-primary" />
                          </label>
                          <label className="block">
                            <span className="font-sans text-[11px] font-extrabold text-primary">Minimum Selection</span>
                            <input aria-label={`${group.name || 'Option'} minimum selection`} type="number" min={group.required ? 1 : 0} max={group.maximumSelections} value={group.minimumSelections} onChange={event => setProductOptions(current => current.map(item => item.id === group.id ? { ...item, minimumSelections: Number(event.target.value) } : item))} className="mt-1 w-full rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-xs font-bold text-primary" />
                          </label>
                          <label className="block">
                            <span className="font-sans text-[11px] font-extrabold text-primary">Maximum Selection</span>
                            <input aria-label={`${group.name || 'Option'} maximum selection`} type="number" min={1} max={Math.max(1, group.options.length)} disabled={group.selectionType === 'single'} value={group.maximumSelections} onChange={event => setProductOptions(current => current.map(item => item.id === group.id ? { ...item, maximumSelections: Number(event.target.value) } : item))} className="mt-1 w-full rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-xs font-bold text-primary disabled:opacity-50" />
                          </label>
                          <div className="flex items-end">
                            <p className="pb-2.5 font-sans text-[11px] font-bold text-outline">Sort order: {groupIndex + 1}</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {group.options.map((option, optionIndex) => (
                            <div key={option.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto_auto_auto]">
                              <input aria-label={`${group.name || 'Option'} choice ${optionIndex + 1}`} placeholder="Choice" value={option.name} onChange={event => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                                ...item,
                                options: item.options.map(choice => choice.id === option.id ? { ...choice, name: event.target.value } : choice)
                              }))} className="rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                              <label className="block">
                                <span className="sr-only">Price adjustment</span>
                                <input aria-label={`${group.name || 'Option'} choice ${optionIndex + 1} price adjustment`} title={`Price adjustment (${region.currency})`} type="number" step="0.01" value={option.priceAdjustment} onChange={event => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                                  ...item,
                                  options: item.options.map(choice => choice.id === option.id ? { ...choice, priceAdjustment: Number(event.target.value) } : choice)
                                }))} className="w-full rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                              </label>
                              <label className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5">
                                <span className="font-sans text-[11px] font-extrabold text-primary">Available</span>
                                <input aria-label={`${group.name || 'Option'} choice ${optionIndex + 1} available`} type="checkbox" checked={option.available} onChange={event => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                                  ...item,
                                  options: item.options.map(choice => choice.id === option.id ? { ...choice, available: event.target.checked } : choice)
                                }))} className="h-4 w-4 rounded border-surface-container-high text-primary" />
                              </label>
                              <button type="button" disabled={optionIndex === 0} aria-label={`Move ${group.name || 'option'} choice ${optionIndex + 1} up`} onClick={() => setProductOptions(current => current.map(item => item.id !== group.id ? item : { ...item, options: moveItem(item.options, optionIndex, optionIndex - 1) }))} className="rounded-xl bg-white p-2.5 text-primary disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                              <button type="button" disabled={optionIndex === group.options.length - 1} aria-label={`Move ${group.name || 'option'} choice ${optionIndex + 1} down`} onClick={() => setProductOptions(current => current.map(item => item.id !== group.id ? item : { ...item, options: moveItem(item.options, optionIndex, optionIndex + 1) }))} className="rounded-xl bg-white p-2.5 text-primary disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                              <button type="button" aria-label={`Delete ${group.name || 'option'} choice ${optionIndex + 1}`} onClick={() => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                                ...item,
                                options: item.options.filter(choice => choice.id !== option.id),
                                maximumSelections: Math.max(1, Math.min(item.maximumSelections, item.options.length - 1)),
                                minimumSelections: Math.min(item.minimumSelections, Math.max(0, item.options.length - 1))
                              }))} className="rounded-xl bg-white p-2.5 text-error"><X className="h-4 w-4" /></button>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={() => setProductOptions(current => current.map(item => item.id !== group.id ? item : {
                          ...item,
                          options: [...item.options, {
                            id: storeService.createOptionId(),
                            name: '',
                            priceAdjustment: 0,
                            available: true,
                            sortOrder: item.options.length
                          }]
                        }))} className="mt-3 font-sans text-xs font-extrabold text-primary">+ Add choice</button>
                      </div>
                    ))}
                  </div>
                )}

                {optionGroups.some(group => !productOptions.some(attached => attached.id === group.id)) && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <select aria-label="Saved product options" value={savedOptionGroupId} onChange={event => setSavedOptionGroupId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-surface-container-high bg-white px-3 py-2.5 font-sans text-xs font-bold text-primary">
                      <option value="">Use saved options</option>
                      {optionGroups.filter(group => !productOptions.some(attached => attached.id === group.id)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <button type="button" disabled={!savedOptionGroupId} onClick={attachSavedOptionGroup} className="rounded-full bg-surface-container px-4 py-2.5 font-sans text-xs font-extrabold text-primary disabled:opacity-40">Add</button>
                  </div>
                )}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {editingProduct && (
                  <button type="button" disabled={isSaving} onClick={handleProductDelete} className="inline-flex items-center justify-center gap-2 rounded-full bg-error/10 px-5 py-3 font-sans text-xs font-extrabold text-error disabled:opacity-50 sm:mr-auto">
                    <Trash2 className="h-4 w-4" /> Delete Product
                  </button>
                )}
                <button type="button" onClick={() => setIsProductFormOpen(false)} className="rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary">Cancel</button>
                <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Product'}</button>
              </div>
            </form>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(product => (
              <article key={product.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                <img src={product.photoUrl} alt={product.name} className="h-44 w-full object-cover" referrerPolicy="no-referrer" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-bold text-primary">{product.name}</h2>
                      <p className="mt-1 font-sans text-sm font-extrabold text-secondary">{formatRegionCurrency(product.price, region.currency)}</p>
                    </div>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${product.available ? 'bg-green-500' : 'bg-outline-variant'}`} aria-label={product.available ? 'Available' : 'Unavailable'} />
                  </div>
                  {product.description && <p className="mt-3 line-clamp-2 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
                  {product.optionGroupIds.length > 0 && <p className="mt-3 font-sans text-[11px] font-bold text-outline">{product.optionGroupIds.length} option {product.optionGroupIds.length === 1 ? 'group' : 'groups'}</p>}
                  <button type="button" onClick={() => openProductEditor(product)} className="mt-4 inline-flex items-center gap-2 font-sans text-xs font-extrabold text-primary">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </article>
            ))}
            {products.length === 0 && (
              <div className="rounded-3xl border border-dashed border-outline-variant bg-white/50 px-6 py-14 text-center sm:col-span-2 lg:col-span-3">
                <Package className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-4 font-display text-2xl font-bold text-primary">What are you selling?</h2>
                <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Add your first product to get started.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {activeView === 'orders' && (
        <StoreOrdersPanel
          workspaceId={workspace.id}
          country={store.country}
          currency={store.currency}
          storeName={store.name}
          storeWhatsApp={store.storeContact.whatsapp}
          focusOrderId={focusOrderId}
          notifications={notifications.filter(notification => !notification.readAt)}
          onNotificationClick={onNotificationClick}
        />
      )}

      {activeView === 'pickup' && (
        <form onSubmit={handlePickupSave} className="space-y-8">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-primary">Pickup Locations</h2>
                <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Where should customers collect their order?</p>
              </div>
              <button type="button" onClick={() => updateSettings('pickupLocations', [
                ...settingsDraft.pickupLocations,
                { id: storeService.createPickupLocationId(), name: '', address: '', notes: '' }
              ])} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-primary shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {settingsDraft.pickupLocations.map((location, index) => (
                <div key={location.id} className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input aria-label={`Pickup location ${index + 1} name`} placeholder="Location name" value={location.name} onChange={event => updateSettings('pickupLocations', settingsDraft.pickupLocations.map(item => item.id === location.id ? { ...item, name: event.target.value } : item))} className="rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    <input aria-label={`Pickup location ${index + 1} address`} placeholder="Address" value={location.address} onChange={event => updateSettings('pickupLocations', settingsDraft.pickupLocations.map(item => item.id === location.id ? { ...item, address: event.target.value } : item))} className="rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    <input aria-label={`Pickup location ${index + 1} notes`} placeholder="Notes (optional)" value={location.notes} onChange={event => updateSettings('pickupLocations', settingsDraft.pickupLocations.map(item => item.id === location.id ? { ...item, notes: event.target.value } : item))} className="rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary md:col-span-2" />
                  </div>
                  <button type="button" onClick={() => updateSettings('pickupLocations', settingsDraft.pickupLocations.filter(item => item.id !== location.id))} className="mt-3 font-sans text-xs font-extrabold text-error">Remove location</button>
                </div>
              ))}
              {settingsDraft.pickupLocations.length === 0 && <p className="rounded-3xl border border-dashed border-outline-variant px-5 py-10 text-center font-sans text-sm font-bold text-on-surface-variant">No pickup locations yet.</p>}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-primary">Pickup Sessions</h2>
                <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">When can customers collect?</p>
              </div>
              <button type="button" onClick={() => updateSettings('pickupSessions', [...settingsDraft.pickupSessions, ''])} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-primary shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {settingsDraft.pickupSessions.map((session, index) => (
                <div key={index} className="flex gap-2 rounded-2xl bg-white p-2 shadow-sm">
                  <input aria-label={`Pickup session ${index + 1}`} placeholder="Session name" value={session} onChange={event => updateSettings('pickupSessions', settingsDraft.pickupSessions.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="min-w-0 flex-1 rounded-xl bg-surface-container-low px-3 py-2.5 font-sans text-sm font-bold text-primary outline-none" />
                  <button type="button" aria-label={`Remove pickup session ${index + 1}`} onClick={() => updateSettings('pickupSessions', settingsDraft.pickupSessions.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl p-2.5 text-error"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {settingsDraft.pickupSessions.length === 0 && <p className="rounded-3xl border border-dashed border-outline-variant px-5 py-10 text-center font-sans text-sm font-bold text-on-surface-variant sm:col-span-2">No pickup sessions yet.</p>}
            </div>
          </section>

          <section>
            <div>
              <h2 className="font-display text-2xl font-bold text-primary">Pre-order Settings</h2>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Which pickup dates can customers choose?</p>
            </div>
            <div className="mt-5 space-y-6 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <fieldset>
                <legend className="font-sans text-xs font-extrabold text-primary">Order Days</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STORE_ORDER_DAYS.map(day => {
                    const isSelected = settingsDraft.orderDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleOrderDay(day.id)}
                        className={`rounded-full px-4 py-2.5 font-sans text-xs font-extrabold transition-colors ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'}`}
                      >
                        {day.label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Earliest Pickup</span>
                  <select aria-label="Earliest pickup" value={settingsDraft.earliestPickupDays} onChange={event => updateSettings('earliestPickupDays', Number(event.target.value) as 0 | 1)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                    <option value={0}>Same Day</option>
                    <option value={1}>Next Day</option>
                  </select>
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Maximum Advance Booking</span>
                  <select aria-label="Maximum advance booking" value={settingsDraft.maximumAdvanceDays} onChange={event => updateSettings('maximumAdvanceDays', Number(event.target.value) as 7 | 14 | 30)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                    <option value={7}>7 Days</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </label>
              </div>

              <div>
                <span className="font-sans text-xs font-extrabold text-primary">Unavailable Dates</span>
                <p className="mt-1 font-sans text-[11px] font-bold text-on-surface-variant">Block holidays, closed days, or fully booked dates.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input aria-label="Unavailable date" type="date" value={unavailableDateDraft} onInput={event => setUnavailableDateDraft(event.currentTarget.value)} className="min-w-0 flex-1 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                  <button type="button" disabled={!unavailableDateDraft || settingsDraft.unavailableDates.includes(unavailableDateDraft)} onClick={addUnavailableDate} className="rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-40">Block Date</button>
                </div>
                {settingsDraft.unavailableDates.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {settingsDraft.unavailableDates.map(date => (
                      <span key={date} className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-2 font-sans text-xs font-bold text-primary">
                        {formatPickupDateLabel(date, store?.country)}
                        <button type="button" aria-label={`Remove unavailable date ${date}`} onClick={() => updateSettings('unavailableDates', settingsDraft.unavailableDates.filter(item => item !== date))} className="text-error"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 rounded-3xl bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-sans text-xs font-bold leading-relaxed text-on-surface-variant">
              Pickup becomes available when you save at least one location and one session.
            </p>
            <button type="submit" disabled={isSaving} className="shrink-0 rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Pickup'}</button>
          </div>
        </form>
      )}

      {activeView === 'settings' && (
        <form onSubmit={handleSettingsSave} className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <div className="grid gap-5 md:grid-cols-2">
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
            <fieldset className="md:col-span-2">
              <legend className="font-display text-2xl font-bold text-primary">Store Contact</legend>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Customers can contact the Store using the details you choose to provide.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Phone</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+60 12-3456789" value={settingsDraft.storeContact.phone} onChange={event => updateStoreContact('phone', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Email</span>
                  <input type="email" inputMode="email" autoComplete="email" placeholder="hello@store.com" value={settingsDraft.storeContact.email} onChange={event => updateStoreContact('email', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="font-sans text-xs font-extrabold text-primary">WhatsApp</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+60 12-3456789" value={settingsDraft.storeContact.whatsapp} onChange={event => updateStoreContact('whatsapp', event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                  <span className="mt-1.5 block font-sans text-[11px] font-bold text-on-surface-variant">Enables the public “Chat with Store” button.</span>
                </label>
                {(['facebook', 'instagram', 'tiktok', 'website'] as const).map(field => (
                  <label key={field} className="block">
                    <span className="font-sans text-xs font-extrabold capitalize text-primary">{field}</span>
                    <input type="url" inputMode="url" placeholder="https://" value={settingsDraft.storeContact[field]} onChange={event => updateStoreContact(field, event.target.value)} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="md:col-span-2">
              <legend className="font-display text-2xl font-bold text-primary">Payment Methods</legend>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Customers see only the methods you enable.</p>
              <div className="mt-4 space-y-3">
                {STORE_PAYMENT_METHODS.map(methodDefinition => {
                  const method = settingsDraft.paymentMethods.find(candidate => candidate.id === methodDefinition.id)!;
                  const isQr = method.id === 'touch_n_go_qr' || method.id === 'duitnow_qr';
                  return (
                    <div key={method.id} className="rounded-2xl border border-surface-container-high p-4">
                      <label className="flex items-center justify-between gap-4">
                        <span className="font-sans text-sm font-extrabold text-primary">{methodDefinition.label}</span>
                        <input
                          type="checkbox"
                          checked={method.enabled}
                          onChange={event => updateSettings('paymentMethods', settingsDraft.paymentMethods.map(candidate => (
                            candidate.id === method.id ? { ...candidate, enabled: event.target.checked } : candidate
                          )))}
                          className="h-5 w-5 rounded text-primary"
                        />
                      </label>
                      {isQr && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-[6rem_1fr]">
                          {method.qrCodeUrl ? <img src={method.qrCodeUrl} alt={`${methodDefinition.label} merchant QR`} className="h-24 w-24 rounded-xl border border-surface-container-high object-contain" /> : <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-surface-container-low"><QrCode className="h-7 w-7 text-outline" /></div>}
                          <label className="block">
                            <span className="font-sans text-xs font-extrabold text-primary">Merchant QR Code</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={event => {
                                const file = event.currentTarget.files?.[0];
                                if (file) setPaymentQrFiles(current => ({ ...current, [method.id]: file }));
                              }}
                              className="mt-2 block w-full font-sans text-xs font-bold text-on-surface-variant"
                            />
                            {paymentQrFiles[method.id] && <span className="mt-1 block font-sans text-[11px] font-bold text-on-surface-variant">{paymentQrFiles[method.id]!.name}</span>}
                          </label>
                        </div>
                      )}
                      {method.id !== 'stripe' && (
                        <label className="mt-3 block">
                          <span className="font-sans text-xs font-extrabold text-primary">Customer Instructions {method.id === 'bank_transfer' ? '' : '(optional)'}</span>
                          <textarea
                            rows={2}
                            placeholder={method.id === 'bank_transfer' ? 'Bank name, account name, and account number' : 'Short payment or pickup instructions'}
                            value={method.instructions}
                            onChange={event => updateSettings('paymentMethods', settingsDraft.paymentMethods.map(candidate => (
                              candidate.id === method.id ? { ...candidate, instructions: event.target.value } : candidate
                            )))}
                            className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>
          <div className="mt-7 flex justify-end">
            <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Store Settings'}</button>
          </div>
        </form>
      )}

      {isShareOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-primary/50 p-0 sm:items-center sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="share-store-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Customer Entry</p>
                <h2 id="share-store-title" className="mt-1 font-display text-3xl font-bold text-primary">Scan or share</h2>
                <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Customers open your public Store directly. No MiseChef account is required.</p>
              </div>
              <button type="button" aria-label="Close Store sharing" onClick={() => setIsShareOpen(false)} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 rounded-3xl bg-surface-container-low p-5 text-center">
              {isGeneratingQr ? (
                <div className="mx-auto h-56 w-56 animate-pulse rounded-2xl bg-white" aria-label="Generating QR code" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR code for ${store.name} ordering page`} className="mx-auto h-56 w-56 rounded-2xl bg-white" />
              ) : (
                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-white text-outline"><QrCode className="h-12 w-12" /></div>
              )}
              <p className="mt-4 font-sans text-xs font-extrabold text-primary">Scan to order</p>
            </div>

            <label className="mt-5 block">
              <span className="font-sans text-xs font-extrabold text-primary">Ordering link</span>
              <input readOnly value={getPublicOrderingUrl(window.location.origin, store.slug)} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-xs font-bold text-primary outline-none" />
            </label>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={copyOrderingLink} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
                <Copy className="h-4 w-4" /> Copy Order Link
              </button>
              <button type="button" onClick={downloadQrCode} disabled={!qrDataUrl || isGeneratingQr} className="inline-flex items-center justify-center gap-2 rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">
                <Download className="h-4 w-4" /> Download QR Code
              </button>
            </div>
            {shareMessage && <p className="mt-3 text-center font-sans text-xs font-bold text-on-surface-variant">{shareMessage}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
