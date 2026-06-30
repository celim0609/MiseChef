import { useEffect, useMemo, useState } from 'react';
import Hero from './components/Hero';
import PortfolioStudio from './components/PortfolioStudio';
import type { Portfolio, PortfolioBasicProfile, PortfolioProfileSource } from './types';

type PortfolioTab = 'preview' | 'studio';

interface PortfolioPageProps {
  profile: PortfolioProfileSource;
  initialPortfolio: Portfolio;
}

export default function PortfolioPage({ profile, initialPortfolio }: PortfolioPageProps) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('preview');
  const profilePortfolio = useMemo<Portfolio>(() => ({
    ...initialPortfolio,
    basicProfile: initialPortfolio.basicProfile,
    experience: []
  }), [initialPortfolio]);

  const [portfolio, setPortfolio] = useState<Portfolio>(profilePortfolio);

  useEffect(() => {
    setPortfolio(current => ({
      ...current,
      basicProfile: profilePortfolio.basicProfile
    }));
  }, [profilePortfolio]);

  const handleSaveBasicProfile = (basicProfile: PortfolioBasicProfile) => {
    setPortfolio(current => ({
      ...current,
      basicProfile: {
        ...current.basicProfile,
        ...basicProfile
      }
    }));
  };

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-full bg-surface-container-low border border-surface-container-high p-1 shadow-sm">
        {(['preview', 'studio'] as PortfolioTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-5 py-2.5 font-sans text-xs font-extrabold capitalize transition-all ${activeTab === tab ? 'bg-primary text-on-primary shadow-sm' : 'text-primary hover:bg-surface-container'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'preview' ? (
        <Hero profile={profile} portfolio={portfolio} />
      ) : (
        <PortfolioStudio
          portfolio={portfolio}
          onSaveBasicProfile={handleSaveBasicProfile}
        />
      )}
    </div>
  );
}
