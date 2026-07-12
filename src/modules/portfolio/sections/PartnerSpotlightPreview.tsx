import { Building2 } from 'lucide-react';
import type { PortfolioPartnerSpotlight } from '../types';

export default function PartnerSpotlightPreview({ spotlight }: { spotlight?: PortfolioPartnerSpotlight }) {
  const partners = spotlight?.enabled ? spotlight.partners.filter(partner => partner.trim()) : [];

  return (
    <section className="animate-fade-in space-y-4 pb-10">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Partners</p>
        <h2 className="mt-1 font-display text-3xl font-bold tracking-tight text-primary">Partner Spotlight</h2>
      </div>

      {partners.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map(partner => (
            <article key={partner} className="flex items-center gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-primary" aria-label="Brand logo placeholder">
                <Building2 className="h-6 w-6" />
              </span>
              <h3 className="font-display text-xl font-bold text-primary">{partner}</h3>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center">
          <p className="font-display text-xl font-bold text-primary">Reserved for Future Brand Partners</p>
          <p className="mt-2 font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">Coming Soon</p>
        </div>
      )}
    </section>
  );
}
