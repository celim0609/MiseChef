import { useEffect, useMemo, useState } from 'react';
import Hero from './components/Hero';
import HeroEditor from './components/HeroEditor';
import type { Portfolio, PortfolioBasicProfile } from './types';

interface PortfolioPageProfile {
  name?: string;
  jobTitle?: string;
  bio?: string;
  photo?: string;
}

interface PortfolioPageProps {
  profile: PortfolioPageProfile;
  customAvatarUrl?: string;
}

const PROFILE_PLACEHOLDERS = {
  displayName: 'Your Name',
  professionalTitle: 'Professional Title',
  shortBio: 'Add a short bio to introduce your culinary portfolio.'
};

const getProfileValue = (value: string | undefined, placeholder: string) => {
  const trimmed = value?.trim();
  return trimmed || placeholder;
};

export default function PortfolioPage({ profile, customAvatarUrl = '' }: PortfolioPageProps) {
  const profilePortfolio = useMemo<Portfolio>(() => ({
    basicProfile: {
      displayName: getProfileValue(profile.name, PROFILE_PLACEHOLDERS.displayName),
      professionalTitle: getProfileValue(profile.jobTitle, PROFILE_PLACEHOLDERS.professionalTitle),
      shortBio: getProfileValue(profile.bio, PROFILE_PLACEHOLDERS.shortBio),
      profilePhotoUrl: customAvatarUrl || profile.photo || ''
    }
  }), [customAvatarUrl, profile.bio, profile.jobTitle, profile.name, profile.photo]);

  const [portfolio, setPortfolio] = useState<Portfolio>(profilePortfolio);

  useEffect(() => {
    setPortfolio(profilePortfolio);
  }, [profilePortfolio]);

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
