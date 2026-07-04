import type { PortfolioBasicProfile } from '../types';

interface HeroEditorProps {
  basicProfile: PortfolioBasicProfile;
  onChange: (basicProfile: PortfolioBasicProfile) => void;
}

export default function HeroEditor({ basicProfile, onChange }: HeroEditorProps) {
  const updateDraft = (field: keyof PortfolioBasicProfile, value: string | string[]) => {
    onChange({
      ...basicProfile,
      [field]: value
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Professional Title</span>
        <input
          type="text"
          value={basicProfile.professionalTitle || ''}
          onChange={event => updateDraft('professionalTitle', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Years Experience</span>
        <input
          type="text"
          value={basicProfile.yearsExperience || ''}
          onChange={event => updateDraft('yearsExperience', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2 md:col-span-2">
        <span className="font-sans text-xs font-extrabold text-primary">Short Bio</span>
        <textarea
          value={basicProfile.shortBio || ''}
          onChange={event => updateDraft('shortBio', event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none"
        />
      </label>

      <label className="block space-y-2 md:col-span-2">
        <span className="font-sans text-xs font-extrabold text-primary">Quote</span>
        <textarea
          value={basicProfile.quote || ''}
          onChange={event => updateDraft('quote', event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Location</span>
        <input
          type="text"
          value={basicProfile.location || ''}
          onChange={event => updateDraft('location', event.target.value)}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Specialties</span>
        <input
          type="text"
          value={(basicProfile.specialties || []).join(', ')}
          onChange={event => updateDraft('specialties', event.target.value.split(',').map(item => item.trim()).filter(Boolean))}
          className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary"
        />
      </label>
    </div>
  );
}
