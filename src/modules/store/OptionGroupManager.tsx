import { useState, type FormEvent } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { formatRegionCurrency } from '../../regions';
import { storeService } from './services';
import { validateStoreOptionGroup } from './storeModel';
import type { StoreOptionGroup, StoreOptionGroupDraft, WorkspaceStore } from './types';

interface OptionGroupManagerProps {
  currentUser: User;
  store: WorkspaceStore;
  groups: StoreOptionGroup[];
  onGroupsChange: (groups: StoreOptionGroup[]) => void;
  onMessage: (message: string, isError?: boolean) => void;
}

const emptyDraft = (): StoreOptionGroupDraft => ({ name: '', options: [] });

export default function OptionGroupManager({
  currentUser,
  store,
  groups,
  onGroupsChange,
  onMessage
}: OptionGroupManagerProps) {
  const [draft, setDraft] = useState<StoreOptionGroupDraft>(emptyDraft);
  const [editingGroup, setEditingGroup] = useState<StoreOptionGroup | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const openNew = () => {
    setEditingGroup(null);
    setDraft(emptyDraft());
    setIsOpen(true);
  };

  const openEdit = (group: StoreOptionGroup) => {
    setEditingGroup(group);
    setDraft({
      name: group.name,
      options: group.options.map(option => ({ ...option }))
    });
    setIsOpen(true);
  };

  const addOption = () => {
    setDraft(current => ({
      ...current,
      options: [
        ...current.options,
        { id: storeService.createOptionId(), name: '', priceAdjustment: 0 }
      ]
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const error = validateStoreOptionGroup(draft);
    if (error) {
      onMessage(error, true);
      return;
    }

    setIsSaving(true);
    try {
      const saved = editingGroup
        ? await storeService.updateOptionGroup(editingGroup, draft)
        : await storeService.createOptionGroup({
          id: storeService.createOptionGroupId(),
          workspaceId: store.workspaceId,
          draft,
          createdBy: currentUser.uid
        });
      const next = [...groups.filter(group => group.id !== saved.id), saved]
        .sort((a, b) => a.name.localeCompare(b.name));
      onGroupsChange(next);
      onMessage(editingGroup ? 'Option group updated.' : 'Option group added.');
      setDraft(emptyDraft());
      setEditingGroup(null);
      setIsOpen(false);
    } catch (saveError) {
      onMessage(saveError instanceof Error ? saveError.message : 'Unable to save this option group.', true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-primary">Product Options</h2>
          <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">
            Create reusable single-choice options, then attach them to products.
          </p>
        </div>
        <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
          <Plus className="h-4 w-4" /> Add Option Group
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 p-5">
          <h3 className="font-display text-xl font-bold text-primary">{editingGroup ? 'Edit Option Group' : 'New Option Group'}</h3>
          <label className="mt-4 block">
            <span className="font-sans text-xs font-extrabold text-primary">Group Name</span>
            <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
          </label>

          <div className="mt-5 space-y-3">
            {draft.options.map((option, index) => (
              <div key={option.id} className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
                <input aria-label={`Option ${index + 1} name`} placeholder="Option name" value={option.name} onChange={event => setDraft(current => ({
                  ...current,
                  options: current.options.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)
                }))} className="rounded-2xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                <input aria-label={`Option ${index + 1} price adjustment`} type="number" step="0.01" value={option.priceAdjustment} onChange={event => setDraft(current => ({
                  ...current,
                  options: current.options.map((item, itemIndex) => itemIndex === index ? { ...item, priceAdjustment: Number(event.target.value) } : item)
                }))} className="rounded-2xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => setDraft(current => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-2xl bg-white p-3 text-error">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addOption} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-primary shadow-sm">
              <Plus className="h-3.5 w-3.5" /> Add Option
            </button>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setIsOpen(false)} className="rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary">Cancel</button>
            <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Option Group'}</button>
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map(group => (
          <article key={group.id} className="rounded-3xl border border-surface-container-high bg-surface-container-low p-5">
            <h3 className="font-display text-xl font-bold text-primary">{group.name}</h3>
            <ul className="mt-3 space-y-2">
              {group.options.map(option => (
                <li key={option.id} className="flex justify-between gap-3 font-sans text-xs font-bold text-on-surface-variant">
                  <span>{option.name}</span>
                  <span>{option.priceAdjustment === 0 ? 'No change' : `${option.priceAdjustment > 0 ? '+' : '−'}${formatRegionCurrency(Math.abs(option.priceAdjustment), store.currency)}`}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => openEdit(group)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-primary shadow-sm">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </article>
        ))}
        {groups.length === 0 && !isOpen && (
          <div className="rounded-3xl border border-dashed border-outline-variant p-8 text-center sm:col-span-2 xl:col-span-3">
            <p className="font-display text-2xl font-bold text-primary">No option groups</p>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Products can still be sold without options.</p>
          </div>
        )}
      </div>
    </section>
  );
}
