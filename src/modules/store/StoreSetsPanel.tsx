import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { formatRegionCurrency } from '../../regions';
import { uploadStoreSetImage } from '../../services/storage';
import { storeService } from './services';
import {
  calculateStoreSetAnalysis,
  getDefaultStoreSetSelections,
  getStoreSetUnavailableReason,
  validateStoreSet
} from './storeSetModel';
import type { StoreProduct, StoreSet, StoreSetDraft } from './types';

interface StoreSetsPanelProps {
  currentUser: User;
  workspaceId: string;
  currency: 'MYR' | 'SGD';
  products: StoreProduct[];
  sets: StoreSet[];
  onSetsChange: (sets: StoreSet[]) => void;
  onMessage: (message: string, isError?: boolean) => void;
}

const emptyDraft = (sortOrder: number): StoreSetDraft => ({
  name: '',
  description: '',
  photoUrl: '',
  category: '',
  price: 0,
  available: true,
  sortOrder,
  groups: []
});

const toDraft = (set: StoreSet): StoreSetDraft => ({
  name: set.name,
  description: set.description,
  photoUrl: set.photoUrl,
  category: set.category,
  price: set.price,
  available: set.available,
  sortOrder: set.sortOrder,
  groups: set.groups.map(group => ({ ...group, options: group.options.map(option => ({ ...option })) }))
});

export default function StoreSetsPanel({
  currentUser,
  workspaceId,
  currency,
  products,
  sets,
  onSetsChange,
  onMessage
}: StoreSetsPanelProps) {
  const [draft, setDraft] = useState<StoreSetDraft>(() => emptyDraft(sets.length));
  const [editing, setEditing] = useState<StoreSet | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const defaultSelections = useMemo(() => getDefaultStoreSetSelections({
    id: editing?.id || 'draft',
    storeId: workspaceId,
    workspaceId,
    createdBy: currentUser.uid,
    createdAt: editing?.createdAt || '',
    updatedAt: editing?.updatedAt || '',
    ...draft
  }, products), [currentUser.uid, draft, editing, products, workspaceId]);
  const analysis = useMemo(
    () => calculateStoreSetAnalysis(draft, products, defaultSelections),
    [defaultSelections, draft, products]
  );

  const openNew = () => {
    setEditing(null);
    setDraft(emptyDraft(sets.length));
    setPhotoFile(null);
    setIsOpen(true);
  };
  const openEdit = (set: StoreSet) => {
    setEditing(set);
    setDraft(toDraft(set));
    setPhotoFile(null);
    setIsOpen(true);
  };
  const addGroup = () => setDraft(current => ({
    ...current,
    groups: [...current.groups, {
      id: storeService.createSetGroupId(),
      name: '',
      required: true,
      selectionCount: 1,
      sortOrder: current.groups.length,
      options: []
    }]
  }));
  const updateGroup = (groupId: string, update: (group: StoreSetDraft['groups'][number]) => StoreSetDraft['groups'][number]) => {
    setDraft(current => ({
      ...current,
      groups: current.groups.map(group => group.id === groupId ? update(group) : group)
    }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    const preflight = validateStoreSet({ ...draft, photoUrl: photoFile ? 'pending-upload' : draft.photoUrl });
    if (preflight) return onMessage(preflight, true);
    setIsSaving(true);
    try {
      const id = editing?.id || storeService.createSetId();
      const photoUrl = photoFile
        ? await uploadStoreSetImage({ workspaceId, setId: id, file: photoFile })
        : draft.photoUrl;
      const nextDraft = { ...draft, photoUrl };
      const saved = editing
        ? await storeService.updateSet(editing, nextDraft)
        : await storeService.createSet({ id, workspaceId, draft: nextDraft, createdBy: currentUser.uid });
      onSetsChange([saved, ...sets.filter(item => item.id !== saved.id)]
        .sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt)));
      setIsOpen(false);
      setEditing(null);
      setPhotoFile(null);
      onMessage(editing ? 'Set updated.' : 'Set created.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Unable to save this set.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const duplicate = async (set: StoreSet) => {
    try {
      const id = storeService.createSetId();
      const copy = await storeService.createSet({
        id,
        workspaceId,
        createdBy: currentUser.uid,
        draft: { ...toDraft(set), name: `${set.name} Copy`, available: false, sortOrder: sets.length }
      });
      onSetsChange([...sets, copy]);
      onMessage('Set duplicated as unavailable. Review it before publishing.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Unable to duplicate this set.', true);
    }
  };

  const toggleAvailability = async (set: StoreSet) => {
    try {
      const updated = await storeService.updateSet(set, { ...toDraft(set), available: !set.available });
      onSetsChange(sets.map(item => item.id === updated.id ? updated : item));
      onMessage(updated.available ? 'Set is available.' : 'Set is unavailable.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Unable to update availability.', true);
    }
  };

  const remove = async (set: StoreSet) => {
    if (!window.confirm(`Delete “${set.name}”? Historical orders will keep their snapshots.`)) return;
    try {
      await storeService.deleteSet(set.id);
      onSetsChange(sets.filter(item => item.id !== set.id));
      onMessage('Set deleted. Historical orders were not changed.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Unable to delete this set.', true);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <p className="font-sans text-sm font-bold text-on-surface-variant">{sets.length} {sets.length === 1 ? 'set' : 'sets'}</p>
        <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary"><Plus className="h-4 w-4" /> Create Set</button>
      </div>

      {isOpen && (
        <form onSubmit={save} className="mt-6 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">Sets &amp; Combos</p><h2 className="font-display text-2xl font-bold text-primary">{editing ? 'Edit Set' : 'Create Set'}</h2></div>
            <button type="button" aria-label="Close set builder" onClick={() => setIsOpen(false)} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Set Name</span><input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" /></label>
            <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Set Price ({currency})</span><input type="number" min="0" step="0.01" value={draft.price} onChange={event => setDraft(current => ({ ...current, price: Number(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" /></label>
            <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Category</span><input value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} placeholder="Breakfast, Lunch, Sharing…" className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" /></label>
            <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setPhotoFile(event.target.files?.[0] || null)} className="mt-2 block w-full font-sans text-xs font-bold text-on-surface-variant" /><span className="mt-1 block text-[11px] font-bold text-outline">{photoFile?.name || (draft.photoUrl ? 'Existing image retained' : 'Image required')}</span></label>
            <label className="block md:col-span-2"><span className="font-sans text-xs font-extrabold text-primary">Description</span><textarea rows={2} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" /></label>
            <label className="flex items-center justify-between rounded-2xl bg-surface-container-low px-4 py-3"><span className="font-sans text-sm font-extrabold text-primary">Available</span><input type="checkbox" checked={draft.available} onChange={event => setDraft(current => ({ ...current, available: event.target.checked }))} className="h-5 w-5" /></label>
          </div>

          <div className="mt-7 flex items-end justify-between gap-3 border-t border-surface-container-high pt-6"><div><h3 className="font-display text-xl font-bold text-primary">Selection Groups</h3><p className="mt-1 text-xs font-bold text-on-surface-variant">Choose existing Store products. No product is duplicated.</p></div><button type="button" onClick={addGroup} className="rounded-full bg-surface-container px-4 py-2.5 text-xs font-extrabold text-primary"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add Group</button></div>
          <div className="mt-4 space-y-4">
            {draft.groups.map((group, groupIndex) => (
              <fieldset key={group.id} className="rounded-2xl bg-surface-container-low p-4">
                <div className="flex gap-2"><input aria-label={`Group ${groupIndex + 1} name`} value={group.name} onChange={event => setDraft(current => ({ ...current, groups: current.groups.map(item => item.id === group.id ? { ...item, name: event.target.value } : item) }))} placeholder="Main, Drink, Side…" className="min-w-0 flex-1 rounded-xl border border-surface-container-high bg-white px-3 py-2.5 text-sm font-bold" /><button type="button" aria-label={`Remove ${group.name || 'group'}`} onClick={() => setDraft(current => ({ ...current, groups: current.groups.filter(item => item.id !== group.id) }))} className="rounded-xl bg-white p-2.5 text-error"><X className="h-4 w-4" /></button></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs font-extrabold text-primary"><input type="checkbox" checked={group.required} onChange={event => setDraft(current => ({ ...current, groups: current.groups.map(item => item.id === group.id ? { ...item, required: event.target.checked } : item) }))} /> Required</label><label className="text-xs font-extrabold text-primary">Customer chooses <input aria-label={`${group.name || 'Group'} choose count`} type="number" min="1" max="10" value={group.selectionCount} onChange={event => setDraft(current => ({ ...current, groups: current.groups.map(item => item.id === group.id ? { ...item, selectionCount: Number(event.target.value) } : item) }))} className="ml-2 w-20 rounded-lg border bg-white px-2 py-1.5" /></label></div>
                <div className="mt-4 space-y-2">
                  {products.map(product => {
                    const option = group.options.find(item => item.productId === product.id);
                    return <div key={product.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-white px-3 py-2.5 sm:grid-cols-[1fr_9rem]">
                      <label className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={Boolean(option)} onChange={() => updateGroup(group.id, item => ({ ...item, options: option ? item.options.filter(candidate => candidate.productId !== product.id) : [...item.options, { productId: product.id, priceAdjustment: 0, sortOrder: item.options.length }] }))} /><span className="min-w-0"><span className="block truncate text-sm font-extrabold text-primary">{product.name}</span><span className="text-[11px] font-bold text-on-surface-variant">{formatRegionCurrency(product.price, currency)} · {product.available ? 'Available' : 'Unavailable'}</span></span></label>
                      {option && <label className="text-[10px] font-extrabold uppercase tracking-wide text-outline">Upgrade <input aria-label={`${product.name} upgrade price`} type="number" min="0" step="0.01" value={option.priceAdjustment} onChange={event => updateGroup(group.id, item => ({ ...item, options: item.options.map(candidate => candidate.productId === product.id ? { ...candidate, priceAdjustment: Number(event.target.value) } : candidate) }))} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm text-primary" /></label>}
                    </div>;
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-4"><h3 className="font-display text-lg font-bold text-primary">Live Cost Analysis</h3><p className="mt-1 text-[11px] font-bold text-on-surface-variant">Based on the first available required choices. Customer selections recalculate live.</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><div><dt className="font-bold text-outline">Regular Value</dt><dd className="mt-1 font-extrabold text-primary">{formatRegionCurrency(analysis.regularValue, currency)}</dd></div><div><dt className="font-bold text-outline">Customer Saving</dt><dd className="mt-1 font-extrabold text-primary">{formatRegionCurrency(analysis.customerSaving, currency)}</dd></div><div><dt className="font-bold text-outline">Estimated Cost</dt><dd className="mt-1 font-extrabold text-primary">{analysis.estimatedCost === null ? 'Not available' : formatRegionCurrency(analysis.estimatedCost, currency)}</dd></div><div><dt className="font-bold text-outline">Selling Price</dt><dd className="mt-1 font-extrabold text-primary">{formatRegionCurrency(analysis.sellingPrice, currency)}</dd></div><div><dt className="font-bold text-outline">Gross Profit</dt><dd className="mt-1 font-extrabold text-primary">{analysis.grossProfit === null ? 'Not available' : formatRegionCurrency(analysis.grossProfit, currency)}</dd></div><div><dt className="font-bold text-outline">Gross Margin</dt><dd className="mt-1 font-extrabold text-primary">{analysis.grossMargin === null ? 'Not available' : `${analysis.grossMargin.toFixed(1)}%`}</dd></div></dl></div>
          <button type="submit" disabled={isSaving} className="mt-6 w-full rounded-full bg-primary px-5 py-3.5 text-sm font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : editing ? 'Save Set' : 'Create Set'}</button>
        </form>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map(set => {
          const reason = getStoreSetUnavailableReason(set, products);
          return <article key={set.id} className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="aspect-[16/9] bg-surface-container-low">{set.photoUrl && <img src={set.photoUrl} alt="" className="h-full w-full object-cover" />}</div><div className="p-5"><div className="flex justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-secondary">{set.category || 'Set'}</p><h3 className="mt-1 font-display text-xl font-bold text-primary">{set.name}</h3></div><p className="text-sm font-extrabold text-secondary">{formatRegionCurrency(set.price, currency)}</p></div><p className={`mt-3 text-xs font-bold ${reason ? 'text-error' : 'text-green-700'}`}>{reason || 'Available for ordering'}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => openEdit(set)} className="rounded-full bg-surface-container px-3 py-2 text-xs font-extrabold text-primary"><Pencil className="mr-1 inline h-3.5 w-3.5" /> Edit</button><button type="button" onClick={() => toggleAvailability(set)} className="rounded-full bg-surface-container px-3 py-2 text-xs font-extrabold text-primary">{set.available ? 'Deactivate' : 'Activate'}</button><button type="button" onClick={() => duplicate(set)} className="rounded-full bg-surface-container px-3 py-2 text-xs font-extrabold text-primary"><Copy className="mr-1 inline h-3.5 w-3.5" /> Duplicate</button><button type="button" aria-label={`Delete ${set.name}`} onClick={() => remove(set)} className="rounded-full bg-error/10 px-3 py-2 text-xs font-extrabold text-error"><Trash2 className="h-3.5 w-3.5" /></button></div></div></article>;
        })}
        {sets.length === 0 && <div className="rounded-3xl border border-dashed border-outline-variant bg-white/50 px-6 py-14 text-center sm:col-span-2 lg:col-span-3"><h3 className="font-display text-2xl font-bold text-primary">No sets yet</h3><p className="mt-2 text-sm font-bold text-on-surface-variant">Create one set and let customers choose from your existing products.</p></div>}
      </div>
    </section>
  );
}

