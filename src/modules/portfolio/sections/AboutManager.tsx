import type { PortfolioAbout } from '../types';

interface AboutManagerProps {
  about: PortfolioAbout;
  onChange: (about: PortfolioAbout) => void;
}

const normalizeHighlights = (value: string) => (
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
);

export default function AboutManager({ about, onChange }: AboutManagerProps) {
  const highlightText = (about.highlights || []).join('\n');

  const updateDraft = (field: keyof PortfolioAbout, value: string | string[]) => {
    onChange({
      ...about,
      [field]: value
    });
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Portfolio Studio
        </p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
          About
        </h3>
        <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Tell visitors who you are, what you cook, and what makes your work distinct.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Title</span>
          <input type="text" value={about.title || ''} onChange={event => updateDraft('title', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Body</span>
          <textarea value={about.body || ''} onChange={event => updateDraft('body', event.target.value)} rows={5} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Quote</span>
          <textarea value={about.quote || ''} onChange={event => updateDraft('quote', event.target.value)} rows={3} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Highlights</span>
          <textarea value={highlightText} onChange={event => updateDraft('highlights', normalizeHighlights(event.target.value))} rows={4} placeholder="Add one highlight per line" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        {(!about.title && !about.body && !about.quote && (!about.highlights || about.highlights.length === 0)) && (
          <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-5 text-center">
            <p className="font-sans text-sm font-bold text-on-surface-variant">Add an intro, quote, or highlights to bring your portfolio story to life.</p>
          </div>
        )}

        {about.highlights && about.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {about.highlights.map(highlight => (
              <span key={highlight} className="rounded-full bg-white border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">
                {highlight}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
