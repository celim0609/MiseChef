import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { ArrowDown, ArrowUp, Image as ImageIcon, Megaphone, Pencil, Plus, X } from 'lucide-react';
import type { HomepagePromotion } from '../../public/homepagePromotions';
import { homepagePromotionService, type HomepagePromotionInput } from '../services/homepagePromotionService';

const emptyDraft: HomepagePromotionInput = {
  eyebrow: 'MiseChef',
  title: '',
  description: '',
  ctaLabel: 'Learn more',
  href: '/recipes',
  imageUrl: '',
  active: true
};

type PromotionAdminService = Pick<typeof homepagePromotionService,
  'listPromotions' | 'createPromotion' | 'updatePromotion' | 'setPromotionActive' | 'reorderPromotions'>;

export function AdminHomepagePromotionsPage({ currentUser, service = homepagePromotionService }: { currentUser: User; service?: PromotionAdminService }) {
  const [promotions, setPromotions] = useState<HomepagePromotion[]>([]);
  const [editing, setEditing] = useState<HomepagePromotion | null>(null);
  const [draft, setDraft] = useState<HomepagePromotionInput>(emptyDraft);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPromotions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setPromotions(await service.listPromotions());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load homepage promotions.');
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => { void loadPromotions(); }, [loadPromotions]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setError('');
    setMessage('');
    setIsFormOpen(true);
  };

  const openEdit = (promotion: HomepagePromotion) => {
    setEditing(promotion);
    setDraft({
      eyebrow: promotion.eyebrow,
      title: promotion.title,
      description: promotion.description,
      ctaLabel: promotion.ctaLabel,
      href: promotion.href,
      imageUrl: promotion.imageUrl || '',
      active: promotion.active
    });
    setError('');
    setMessage('');
    setIsFormOpen(true);
  };

  const savePromotion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      if (editing) {
        await service.updatePromotion(editing, draft, currentUser.uid);
        setMessage(`${draft.title.trim()} was updated.`);
      } else {
        await service.createPromotion(draft, currentUser.uid);
        setMessage(`${draft.title.trim()} was added.`);
      }
      setIsFormOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
      await loadPromotions();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this promotion.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (promotion: HomepagePromotion) => {
    if (pendingId) return;
    setPendingId(promotion.id);
    setError('');
    setMessage('');
    try {
      await service.setPromotionActive(promotion.id, !promotion.active, currentUser.uid);
      setMessage(`${promotion.title} is now ${promotion.active ? 'inactive' : 'active'}.`);
      await loadPromotions();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update promotion status.');
    } finally {
      setPendingId('');
    }
  };

  const movePromotion = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= promotions.length || pendingId) return;
    const reordered = [...promotions];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setPendingId(promotions[index].id);
    setPromotions(reordered);
    setError('');
    setMessage('');
    try {
      await service.reorderPromotions(reordered, currentUser.uid);
      setMessage('Promotion order was updated.');
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : 'Unable to reorder promotions.');
      await loadPromotions();
    } finally {
      setPendingId('');
    }
  };

  const fieldClass = 'mt-2 w-full rounded-xl border border-surface-container-high bg-background px-4 py-3 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60';

  return (
    <section className="rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-primary/10 p-3 text-primary"><Megaphone className="h-5 w-5" /></span>
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Homepage content</p>
            <h3 className="mt-1 font-display text-2xl font-bold text-primary">Promotions</h3>
            <p className="mt-2 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Add, edit, activate and arrange the campaign cards shown directly below the public homepage hero.</p>
          </div>
        </div>
        <button type="button" onClick={openCreate} className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary transition active:scale-95"><Plus className="h-4 w-4" />Add Promotion</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-2xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-2xl bg-primary/10 px-4 py-3 font-sans text-sm font-bold text-primary">{message}</p>}

      {isFormOpen && (
        <form onSubmit={savePromotion} className="mt-6 space-y-5 rounded-2xl border border-surface-container-high bg-surface-container-low p-5">
          <div className="flex items-center justify-between gap-3"><h4 className="font-display text-xl font-bold text-primary">{editing ? 'Edit Promotion' : 'Add Promotion'}</h4><button type="button" onClick={() => setIsFormOpen(false)} disabled={isSaving} aria-label="Close promotion form" className="rounded-full p-2 text-outline hover:bg-surface-container-high"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="font-sans text-xs font-extrabold text-primary">Eyebrow</span><input value={draft.eyebrow} maxLength={80} onChange={event => setDraft(current => ({ ...current, eyebrow: event.target.value }))} disabled={isSaving} className={fieldClass} /></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">Title</span><input required value={draft.title} maxLength={160} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} disabled={isSaving} className={fieldClass} /></label>
          </div>
          <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Description</span><textarea value={draft.description} maxLength={320} rows={3} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} disabled={isSaving} className={fieldClass} /></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="font-sans text-xs font-extrabold text-primary">Button label</span><input value={draft.ctaLabel} maxLength={80} onChange={event => setDraft(current => ({ ...current, ctaLabel: event.target.value }))} disabled={isSaving} className={fieldClass} /></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">Destination</span><input required value={draft.href} maxLength={2048} placeholder="/recipes or https://…" onChange={event => setDraft(current => ({ ...current, href: event.target.value }))} disabled={isSaving} className={fieldClass} /></label>
          </div>
          <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Image URL <span className="text-outline">(optional, HTTPS)</span></span><input type="url" inputMode="url" value={draft.imageUrl} maxLength={2048} placeholder="https://…" onChange={event => setDraft(current => ({ ...current, imageUrl: event.target.value }))} disabled={isSaving} className={fieldClass} /></label>
          <label className="flex items-center gap-3 font-sans text-sm font-bold text-primary"><input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} disabled={isSaving} className="h-4 w-4 rounded border-outline text-primary" />Active on the public homepage</label>
          <button type="submit" disabled={isSaving} className="rounded-full bg-primary px-6 py-3 font-sans text-sm font-extrabold text-on-primary transition active:scale-95 disabled:opacity-60">{isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Promotion'}</button>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {isLoading ? <p className="rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold text-on-surface-variant">Loading homepage promotions…</p> : promotions.length === 0 ? <p className="rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold text-on-surface-variant">No managed promotions yet. The homepage will continue using its built-in launch cards.</p> : promotions.map((promotion, index) => (
          <article key={promotion.id} className="flex flex-col gap-4 rounded-2xl border border-surface-container-high p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {promotion.imageUrl ? <img src={promotion.imageUrl} alt="" className="h-16 w-20 shrink-0 rounded-xl bg-surface-container-low object-cover" referrerPolicy="no-referrer" /> : <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-outline"><ImageIcon className="h-5 w-5" /></span>}
              <div className="min-w-0"><p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-secondary">{promotion.eyebrow}</p><h4 className="mt-1 font-sans text-sm font-extrabold text-primary">{promotion.title}</h4><p className="mt-1 truncate font-sans text-xs font-bold text-outline">{promotion.href}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-sans text-[10px] font-extrabold uppercase tracking-wide ${promotion.active ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-outline'}`}>{promotion.active ? 'Active' : 'Inactive'}</span></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void movePromotion(index, -1)} disabled={index === 0 || Boolean(pendingId)} aria-label={`Move ${promotion.title} up`} className="rounded-full border border-surface-container-high p-2 text-primary disabled:opacity-35"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => void movePromotion(index, 1)} disabled={index === promotions.length - 1 || Boolean(pendingId)} aria-label={`Move ${promotion.title} down`} className="rounded-full border border-surface-container-high p-2 text-primary disabled:opacity-35"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => openEdit(promotion)} className="flex items-center gap-2 rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-bold text-primary"><Pencil className="h-4 w-4" />Edit</button>
              <button type="button" onClick={() => void toggleActive(promotion)} disabled={pendingId === promotion.id} className="rounded-full bg-surface-container-low px-4 py-2 font-sans text-xs font-bold text-primary disabled:opacity-60">{promotion.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
