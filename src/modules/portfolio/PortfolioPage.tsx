import { useEffect, useMemo, useState } from 'react';
import type { Recipe } from '../../types';
import Hero from './components/Hero';
import PortfolioStudio from './components/PortfolioStudio';
import AboutPreview from './sections/AboutPreview';
import CertificatesPreview from './sections/CertificatesPreview';
import ContactPreview from './sections/ContactPreview';
import ExperiencePreview from './sections/ExperiencePreview';
import FeaturedRecipesPreview from './sections/FeaturedRecipesPreview';
import GalleryPreview from './sections/GalleryPreview';
import ResumePreview from './sections/ResumePreview';
import SkillsPreview from './sections/SkillsPreview';
import { portfolioService } from './services/portfolioService';
import type { Portfolio, PortfolioProfileSource } from './types';

type PortfolioTab = 'preview' | 'studio';

interface PortfolioPageProps {
  profile: PortfolioProfileSource;
  initialPortfolio: Portfolio;
  recipes: Recipe[];
  userId?: string;
  workspaceId?: string;
}

const normalizePortfolio = (portfolio: Portfolio): Portfolio => ({
  ...portfolio,
  basicProfile: portfolio.basicProfile,
  hero: portfolio.hero || {},
  about: portfolio.about || {},
  experience: portfolio.experience || [],
  skills: portfolio.skills || [],
  certificates: portfolio.certificates || [],
  gallery: portfolio.gallery || [],
  featuredRecipes: portfolio.featuredRecipes || [],
  resume: portfolio.resume,
  contact: portfolio.contact,
  metadata: portfolio.metadata,
  visibility: portfolio.visibility || { status: 'private' },
  publicProfile: portfolio.publicProfile
});

const mergePortfolioWithDefault = (defaultPortfolio: Portfolio, savedPortfolio: Portfolio): Portfolio => normalizePortfolio({
  ...defaultPortfolio,
  ...savedPortfolio,
  basicProfile: {
    ...defaultPortfolio.basicProfile,
    ...savedPortfolio.basicProfile
  },
  hero: {
    ...defaultPortfolio.hero,
    ...savedPortfolio.hero
  },
  visibility: {
    ...defaultPortfolio.visibility,
    ...savedPortfolio.visibility,
    status: savedPortfolio.visibility?.status || defaultPortfolio.visibility?.status || 'private'
  }
});

export default function PortfolioPage({ profile, initialPortfolio, recipes, userId, workspaceId }: PortfolioPageProps) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('preview');
  const profilePortfolio = useMemo<Portfolio>(() => normalizePortfolio({
    ...initialPortfolio,
    publicProfile: {
      enabled: initialPortfolio.publicProfile?.enabled ?? initialPortfolio.visibility?.status === 'published',
      username: initialPortfolio.publicProfile?.username || profile.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30),
      ownerId: userId || initialPortfolio.publicProfile?.ownerId || '',
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl
    }
  }), [initialPortfolio, profile, userId]);

  const [portfolio, setPortfolio] = useState<Portfolio>(profilePortfolio);
  const [previewPortfolio, setPreviewPortfolio] = useState<Portfolio>(profilePortfolio);

  useEffect(() => {
    let isCancelled = false;

    setPortfolio(profilePortfolio);
    setPreviewPortfolio(profilePortfolio);

    portfolioService.loadPortfolio(userId, workspaceId || userId).then(savedPortfolio => {
      if (isCancelled) return;
      const nextPortfolio = savedPortfolio ? mergePortfolioWithDefault(profilePortfolio, savedPortfolio) : profilePortfolio;
      setPortfolio(nextPortfolio);
      setPreviewPortfolio(nextPortfolio);
    }).catch(() => {
      if (!isCancelled) {
        setPortfolio(profilePortfolio);
        setPreviewPortfolio(profilePortfolio);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [profilePortfolio, userId, workspaceId]);

  const handleSavePortfolio = (savedPortfolio: Portfolio) => {
    setPortfolio(savedPortfolio);
    setPreviewPortfolio(savedPortfolio);
  };

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-full bg-surface-container-low border border-surface-container-high p-1 shadow-sm">
        {(['preview', 'studio'] as PortfolioTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={'rounded-full px-5 py-2.5 font-sans text-xs font-extrabold capitalize transition-all ' + (activeTab === tab ? 'bg-primary text-on-primary shadow-sm' : 'text-primary hover:bg-surface-container')}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'preview' ? (
        <>
          <Hero profile={profile} portfolio={previewPortfolio} />
          <AboutPreview about={previewPortfolio.about} />
          <ExperiencePreview experiences={previewPortfolio.experience || []} />
          <SkillsPreview skills={previewPortfolio.skills || []} />
          <CertificatesPreview certificates={previewPortfolio.certificates || []} />
          <GalleryPreview items={previewPortfolio.gallery || []} />
          <FeaturedRecipesPreview featuredRecipes={previewPortfolio.featuredRecipes || []} recipes={recipes} />
          <ResumePreview resume={previewPortfolio.resume} />
          <ContactPreview contact={previewPortfolio.contact} />
        </>
      ) : (
        <PortfolioStudio
          portfolio={portfolio}
          recipes={recipes}
          userId={userId}
          workspaceId={workspaceId || userId}
          onDraftPortfolioChange={setPreviewPortfolio}
          onSavePortfolio={handleSavePortfolio}
        />
      )}
    </div>
  );
}
