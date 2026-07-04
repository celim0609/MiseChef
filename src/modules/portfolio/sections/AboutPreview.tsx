import type { PortfolioAbout } from '../types';

interface AboutPreviewProps {
  about?: PortfolioAbout;
}

const hasAboutContent = (about?: PortfolioAbout) => Boolean(
  about?.title?.trim() ||
  about?.body?.trim() ||
  about?.quote?.trim() ||
  (about?.highlights && about.highlights.length > 0)
);

export default function AboutPreview({ about }: AboutPreviewProps) {
  if (!hasAboutContent(about)) return null;

  const highlights = about?.highlights?.filter(Boolean) || [];

  return (
    <section className="animate-fade-in pb-10">
      <div className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            About
          </p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">
            {about?.title || 'About Me'}
          </h3>
        </div>

        {about?.body && (
          <p className="font-sans text-sm sm:text-base font-bold text-on-surface-variant leading-relaxed max-w-3xl">
            {about.body}
          </p>
        )}

        {about?.quote && (
          <blockquote className="font-display italic text-xl text-primary border-l-4 border-secondary pl-4">
            {about.quote}
          </blockquote>
        )}

        {highlights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {highlights.map(highlight => (
              <div key={highlight} className="rounded-2xl bg-white border border-surface-container-high px-4 py-3 font-sans text-sm font-extrabold text-primary shadow-sm">
                {highlight}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
