import { useState, type FormEvent } from 'react';
import type { PortfolioExperience, PortfolioVisibility } from '../types';

interface ExperienceManagerProps {
  experiences: PortfolioExperience[];
  onChange: (experiences: PortfolioExperience[]) => void;
}

type ExperienceDraft = Omit<PortfolioExperience, 'id' | 'sortOrder'>;

const emptyDraft: ExperienceDraft = {
  role: '',
  organization: '',
  location: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  description: '',
  achievements: [],
  visibility: 'public'
};

const normalizeExperienceOrder = (items: PortfolioExperience[]) => (
  items.map((item, index) => ({
    ...item,
    sortOrder: index
  }))
);

const getSortedExperiences = (items: PortfolioExperience[]) => (
  [...items].sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function ExperienceManager({ experiences, onChange }: ExperienceManagerProps) {
  const [draft, setDraft] = useState<ExperienceDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sortedExperiences = getSortedExperiences(experiences);

  const updateDraft = (field: keyof ExperienceDraft, value: string | boolean | string[]) => {
    setDraft(current => ({
      ...current,
      [field]: value
    }));
  };

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const role = draft.role.trim();
    if (!role) return;

    const cleanDraft: ExperienceDraft = {
      ...draft,
      role,
      organization: draft.organization?.trim(),
      location: draft.location?.trim(),
      startDate: draft.startDate?.trim(),
      endDate: draft.isCurrent ? '' : draft.endDate?.trim(),
      description: draft.description?.trim(),
      achievements: draft.achievements?.map(item => item.trim()).filter(Boolean) || []
    };

    if (editingId) {
      onChange(normalizeExperienceOrder(sortedExperiences.map(item => (
        item.id === editingId ? { ...item, ...cleanDraft } : item
      ))));
      resetDraft();
      return;
    }

    onChange(normalizeExperienceOrder([
      ...sortedExperiences,
      {
        ...cleanDraft,
        id: 'experience_' + Date.now(),
        sortOrder: sortedExperiences.length
      }
    ]));
    resetDraft();
  };

  const startEdit = (experience: PortfolioExperience) => {
    setDraft({
      role: experience.role,
      organization: experience.organization || '',
      location: experience.location || '',
      startDate: experience.startDate || '',
      endDate: experience.endDate || '',
      isCurrent: Boolean(experience.isCurrent),
      description: experience.description || '',
      achievements: experience.achievements || [],
      visibility: experience.visibility
    });
    setEditingId(experience.id);
  };

  const deleteExperience = (id: string) => {
    onChange(normalizeExperienceOrder(sortedExperiences.filter(item => item.id !== id)));
    if (editingId === id) resetDraft();
  };

  const moveExperience = (id: string, direction: -1 | 1) => {
    const currentIndex = sortedExperiences.findIndex(item => item.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedExperiences.length) return;

    const nextExperiences = [...sortedExperiences];
    const [movedExperience] = nextExperiences.splice(currentIndex, 1);
    nextExperiences.splice(targetIndex, 0, movedExperience);
    onChange(normalizeExperienceOrder(nextExperiences));
  };

  const toggleVisibility = (id: string) => {
    onChange(sortedExperiences.map(item => {
      if (item.id !== id) return item;
      const nextVisibility: PortfolioVisibility = item.visibility === 'public' ? 'private' : 'public';
      return {
        ...item,
        visibility: nextVisibility
      };
    }));
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Experience
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-primary tracking-tight mt-1">
          Experience Manager
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Role</span>
          <input type="text" value={draft.role} onChange={event => updateDraft('role', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Organization</span>
          <input type="text" value={draft.organization || ''} onChange={event => updateDraft('organization', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Location</span>
          <input type="text" value={draft.location || ''} onChange={event => updateDraft('location', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Start Date</span>
          <input type="text" value={draft.startDate || ''} onChange={event => updateDraft('startDate', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">End Date</span>
          <input type="text" value={draft.endDate || ''} onChange={event => updateDraft('endDate', event.target.value)} disabled={draft.isCurrent} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary disabled:opacity-60" />
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white px-4 py-3 md:mt-7">
          <input type="checkbox" checked={Boolean(draft.isCurrent)} onChange={event => updateDraft('isCurrent', event.target.checked)} className="h-4 w-4 accent-primary" />
          <span className="font-sans text-xs font-extrabold text-primary">Current Role</span>
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Description</span>
          <textarea value={draft.description || ''} onChange={event => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Achievements</span>
          <textarea value={(draft.achievements || []).join('\n')} onChange={event => updateDraft('achievements', event.target.value.split('\n'))} rows={4} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Visibility</span>
          <select value={draft.visibility} onChange={event => updateDraft('visibility', event.target.value as PortfolioVisibility)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all">
            {editingId ? 'Save Experience' : 'Add Experience'}
          </button>
          {editingId && (
            <button type="button" onClick={resetDraft} className="rounded-full border border-surface-container-high px-6 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {sortedExperiences.length > 0 ? sortedExperiences.map((experience, index) => (
          <article key={experience.id} className="rounded-2xl border border-surface-container-high bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">
                  {experience.visibility === 'public' ? 'Public' : 'Private'}
                </p>
                <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
                  {experience.role}
                </h3>
                {(experience.organization || experience.location) && (
                  <p className="font-sans text-sm font-bold text-on-surface-variant">
                    {[experience.organization, experience.location].filter(Boolean).join(' | ')}
                  </p>
                )}
                {(experience.startDate || experience.endDate || experience.isCurrent) && (
                  <p className="font-sans text-xs font-extrabold text-outline mt-1">
                    {[experience.startDate, experience.isCurrent ? 'Current' : experience.endDate].filter(Boolean).join(' - ')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => moveExperience(experience.id, -1)} disabled={index === 0} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-40">Up</button>
                <button type="button" onClick={() => moveExperience(experience.id, 1)} disabled={index === sortedExperiences.length - 1} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-40">Down</button>
                <button type="button" onClick={() => toggleVisibility(experience.id)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Toggle</button>
                <button type="button" onClick={() => startEdit(experience)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Edit</button>
                <button type="button" onClick={() => deleteExperience(experience.id)} className="rounded-full bg-secondary/10 px-3 py-2 font-sans text-xs font-extrabold text-secondary">Delete</button>
              </div>
            </div>

            {experience.description && (
              <p className="font-sans text-sm font-bold text-on-surface-variant">
                {experience.description}
              </p>
            )}
            {experience.achievements && experience.achievements.length > 0 && (
              <ul className="space-y-2">
                {experience.achievements.map(achievement => (
                  <li key={achievement} className="font-sans text-sm font-bold text-on-surface-variant">
                    {achievement}
                  </li>
                ))}
              </ul>
            )}
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-6 text-center">
            <p className="font-sans text-sm font-bold text-on-surface-variant">
              No experience added yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
