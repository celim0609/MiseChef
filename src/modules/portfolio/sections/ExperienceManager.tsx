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
  employmentType: '',
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
  const [validationMessage, setValidationMessage] = useState('');

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
    setValidationMessage('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const role = draft.role.trim();
    setValidationMessage('');
    if (!role) {
      setValidationMessage('Add a job title before adding this experience.');
      return;
    }

    const cleanDraft: ExperienceDraft = {
      ...draft,
      role,
      organization: draft.organization?.trim(),
      location: draft.location?.trim(),
      employmentType: draft.employmentType?.trim(),
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
      employmentType: experience.employmentType || '',
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
          Portfolio Studio
        </p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
          Experience
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Job Title</span>
          <input type="text" required value={draft.role} onChange={event => updateDraft('role', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
          {validationMessage && <p className="font-sans text-xs font-bold text-secondary">{validationMessage}</p>}
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Company</span>
          <input type="text" value={draft.organization || ''} onChange={event => updateDraft('organization', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Location</span>
          <input type="text" value={draft.location || ''} onChange={event => updateDraft('location', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Employment Type</span>
          <select value={draft.employmentType || ''} onChange={event => updateDraft('employmentType', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="">Select type</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Freelance">Freelance</option>
            <option value="Apprenticeship">Apprenticeship</option>
            <option value="Internship">Internship</option>
          </select>
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Start Date</span>
          <input type="text" value={draft.startDate || ''} onChange={event => updateDraft('startDate', event.target.value)} placeholder="Jan 2024" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">End Date</span>
          <input type="text" value={draft.endDate || ''} onChange={event => updateDraft('endDate', event.target.value)} placeholder="Dec 2024" disabled={draft.isCurrent} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary disabled:opacity-60" />
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white px-4 py-3 md:col-span-2">
          <input type="checkbox" checked={Boolean(draft.isCurrent)} onChange={event => updateDraft('isCurrent', event.target.checked)} className="h-4 w-4 accent-primary" />
          <span className="font-sans text-xs font-extrabold text-primary">Currently Working Here</span>
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Description</span>
          <textarea value={draft.description || ''} onChange={event => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Achievements</span>
          <textarea value={(draft.achievements || []).join('\n')} onChange={event => updateDraft('achievements', event.target.value.split('\n'))} rows={4} placeholder="Add one achievement per line" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
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
        {sortedExperiences.length > 0 ? sortedExperiences.map(experience => (
          <article key={experience.id} className="rounded-2xl border border-surface-container-high bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">
                  {experience.visibility === 'public' ? 'Public' : 'Private'}
                </p>
                <h4 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
                  {experience.role}
                </h4>
                {(experience.organization || experience.location || experience.employmentType) && (
                  <p className="font-sans text-sm font-bold text-on-surface-variant">
                    {[experience.organization, experience.location, experience.employmentType].filter(Boolean).join(' | ')}
                  </p>
                )}
                {(experience.startDate || experience.endDate || experience.isCurrent) && (
                  <p className="font-sans text-xs font-extrabold text-outline mt-1">
                    {[experience.startDate, experience.isCurrent ? 'Current' : experience.endDate].filter(Boolean).join(' - ')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleVisibility(experience.id)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Toggle Visibility</button>
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
              <ul className="list-disc space-y-2 pl-5">
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
              No experience added yet. Add your first role to start building your professional timeline.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
