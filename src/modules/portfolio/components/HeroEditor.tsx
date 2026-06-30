import { useState, type FormEvent } from 'react';
import type { Portfolio, PortfolioBasicProfile } from '../types';

interface HeroEditorProps {
  portfolio: Portfolio;
  onSave: (basicProfile: PortfolioBasicProfile) => void;
}

export default function HeroEditor({ portfolio, onSave }: HeroEditorProps) {
  const [draft, setDraft] = useState<PortfolioBasicProfile>(portfolio.basicProfile);

  const updateDraft = (field: keyof PortfolioBasicProfile, value: string | string[]) => {
    setDraft(current => ({
      ...current,
      [field]: value
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Professional Title</span>
        <input
          type="text"
          value={draft.professionalTitle || ''}
          onChange={event => updateDraft('professionalTitle', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Years Experience</span>
        <input
          type="text"
          value={draft.yearsExperience || ''}
          onChange={event => updateDraft('yearsExperience', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Short Bio</span>
        <textarea
          value={draft.shortBio || ''}
          onChange={event => updateDraft('shortBio', event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Quote</span>
        <textarea
          value={draft.quote || ''}
          onChange={event => updateDraft('quote', event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Location</span>
        <input
          type="text"
          value={draft.location || ''}
          onChange={event => updateDraft('location', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Specialties</span>
        <input
          type="text"
          value={(draft.specialties || []).join(', ')}
          onChange={event => updateDraft('specialties', event.target.value.split(',').map(item => item.trim()).filter(Boolean))}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <button
        type="submit"
        className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all"
      >
        Save
      </button>
    </form>
  );
}
