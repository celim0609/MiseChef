import { useState } from 'react';
import Hero from './components/Hero';
import HeroEditor from './components/HeroEditor';
import type { Portfolio, PortfolioBasicProfile } from './types';

const demoPortfolio: Portfolio = {
  basicProfile: {
    displayName: 'Demo Chef',
    professionalTitle: 'Culinary Professional',
    shortBio: 'A temporary portfolio preview for the reusable hero template.',
    location: 'Location',
    yearsExperience: 'Experience',
    specialties: ['Specialty']
  }
};

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio>(demoPortfolio);

  const handleSaveHero = (basicProfile: PortfolioBasicProfile) => {
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
      <Hero portfolio={portfolio} />
      <HeroEditor portfolio={portfolio} onSave={handleSaveHero} />
    </div>
  );
}
