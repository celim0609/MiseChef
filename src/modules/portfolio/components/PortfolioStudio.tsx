import HeroEditor from './HeroEditor';
import type { Portfolio, PortfolioBasicProfile } from '../types';

interface PortfolioStudioProps {
  portfolio: Portfolio;
  onSaveBasicProfile: (basicProfile: PortfolioBasicProfile) => void;
}

const studioSections = [
  'Experience',
  'Skills',
  'Certificates',
  'Gallery',
  'Featured Recipes',
  'Resume',
  'Contact'
];

export default function PortfolioStudio({ portfolio, onSaveBasicProfile }: PortfolioStudioProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Portfolio Studio
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">
          Portfolio Studio
        </h2>
      </div>

      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            Editable Section
          </p>
          <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
            Basic Profile
          </h3>
        </div>

        <HeroEditor portfolio={portfolio} onSave={onSaveBasicProfile} />

        <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-5">
          <p className="font-sans text-xs font-extrabold text-primary uppercase tracking-[0.16em]">
            Cover Photo
          </p>
          <p className="font-sans text-sm font-bold text-on-surface-variant mt-2">
            Cover Photo upload coming soon.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {studioSections.map(section => (
          <section
            key={section}
            className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 shadow-sm min-h-[150px] flex flex-col justify-between"
          >
            <div>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
                Portfolio Studio
              </p>
              <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
                {section}
              </h3>
            </div>
            <p className="font-sans text-sm font-bold text-on-surface-variant mt-6">
              Coming Soon
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
