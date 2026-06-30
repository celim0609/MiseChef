import { useState, type FormEvent } from 'react';
import type { Portfolio, PortfolioBasicProfile } from '../types';

interface HeroEditorProps {
  portfolio: Portfolio;
  onSave: (basicProfile: PortfolioBasicProfile) => void;
}

export default function HeroEditor({ portfolio, onSave }: HeroEditorProps) {
  const [draft, setDraft] = useState<PortfolioBasicProfile>(portfolio.basicProfile);

  const updateDraft = (field: keyof PortfolioBasicProfile, value: string) => {
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
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-5"
    >
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Hero Editor
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-primary tracking-tight mt-1">
          Edit Hero
        </h2>
      </div>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Display Name</span>
        <input
          type="text"
          value={draft.displayName || ''}
          onChange={event => updateDraft('displayName', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

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
        <span className="font-sans text-xs font-extrabold text-primary">Short Bio</span>
        <textarea
          value={draft.shortBio || ''}
          onChange={event => updateDraft('shortBio', event.target.value)}
          rows={4}
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
        <span className="font-sans text-xs font-extrabold text-primary">Profile Photo</span>
        <input
          type="url"
          value={draft.profilePhotoUrl || ''}
          onChange={event => updateDraft('profilePhotoUrl', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Cover Photo</span>
        <input
          type="url"
          value={draft.coverPhotoUrl || ''}
          onChange={event => updateDraft('coverPhotoUrl', event.target.value)}
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
