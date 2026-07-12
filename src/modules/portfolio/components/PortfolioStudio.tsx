import { useEffect, useMemo, useState } from 'react';
import type { Recipe } from '../../../types';
import CoverImageUploader from './CoverImageUploader';
import HeroEditor from './HeroEditor';
import AboutManager from '../sections/AboutManager';
import CertificatesManager from '../sections/CertificatesManager';
import ContactManager from '../sections/ContactManager';
import ExperienceManager from '../sections/ExperienceManager';
import FeaturedRecipesManager from '../sections/FeaturedRecipesManager';
import GalleryManager from '../sections/GalleryManager';
import ResumeManager from '../sections/ResumeManager';
import SkillsManager from '../sections/SkillsManager';
import { portfolioService } from '../services/portfolioService';
import { importResumeToPortfolioDraft, type ResumeImportSummary } from '../services/resumeImportService';
import type { Portfolio, PortfolioAbout, PortfolioBasicProfile, PortfolioCertificate, PortfolioContact, PortfolioExperience, PortfolioFeaturedRecipe, PortfolioGalleryItem, PortfolioHero, PortfolioPublicProfile, PortfolioResume, PortfolioSkill } from '../types';

interface PortfolioStudioProps {
  portfolio: Portfolio;
  recipes: Recipe[];
  userId?: string;
  workspaceId?: string;
  onDraftPortfolioChange: (portfolio: Portfolio) => void;
  onSavePortfolio: (portfolio: Portfolio) => void;
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
  resume: portfolio.resume || { visibility: 'public', allowDownload: true },
  contact: portfolio.contact || { showEmail: true, showPhone: false },
  metadata: portfolio.metadata,
  visibility: portfolio.visibility || { status: 'private' },
  publicProfile: portfolio.publicProfile
});

export default function PortfolioStudio({ portfolio, recipes, userId, workspaceId, onDraftPortfolioChange, onSavePortfolio }: PortfolioStudioProps) {
  const normalizedPortfolio = useMemo(() => normalizePortfolio(portfolio), [portfolio]);
  const [draftPortfolio, setDraftPortfolio] = useState<Portfolio>(normalizedPortfolio);
  const [lastSavedPortfolio, setLastSavedPortfolio] = useState<Portfolio>(normalizedPortfolio);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('All changes saved');

  useEffect(() => {
    setDraftPortfolio(normalizedPortfolio);
    setLastSavedPortfolio(normalizedPortfolio);
    setSaveMessage('All changes saved');
  }, [normalizedPortfolio]);

  const hasUnsavedChanges = JSON.stringify(draftPortfolio) !== JSON.stringify(lastSavedPortfolio);
  const statusMessage = hasUnsavedChanges ? 'Unsaved changes' : saveMessage;
  const markDraftChanged = () => setSaveMessage('Unsaved changes');

  const updateBasicProfile = (basicProfile: PortfolioBasicProfile) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, basicProfile }));
  };

  const updateHero = (hero: PortfolioHero) => {
    markDraftChanged();
    setDraftPortfolio(current => {
      const nextPortfolio = { ...current, hero };
      onDraftPortfolioChange(nextPortfolio);
      return nextPortfolio;
    });
  };

  const updatePublicProfile = (publicProfile: PortfolioPublicProfile) => {
    markDraftChanged();
    setDraftPortfolio(current => ({
      ...current,
      publicProfile,
      visibility: { status: publicProfile.enabled ? 'published' : 'private' }
    }));
  };

  const updateAbout = (about: PortfolioAbout) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, about }));
  };

  const updateExperience = (experience: PortfolioExperience[]) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, experience }));
  };

  const updateSkills = (skills: PortfolioSkill[]) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, skills }));
  };

  const updateCertificates = (certificates: PortfolioCertificate[]) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, certificates }));
  };

  const updateGallery = (gallery: PortfolioGalleryItem[]) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, gallery }));
  };

  const updateFeaturedRecipes = (featuredRecipes: PortfolioFeaturedRecipe[]) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, featuredRecipes }));
  };

  const updateResume = (resume: PortfolioResume) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, resume }));
  };

  const updateContact = (contact: PortfolioContact) => {
    markDraftChanged();
    setDraftPortfolio(current => ({ ...current, contact }));
  };

  const handleResumeImport = async (file: File): Promise<ResumeImportSummary> => {
    const { portfolio: importedPortfolio, summary } = await importResumeToPortfolioDraft(draftPortfolio, file);
    markDraftChanged();
    setDraftPortfolio(importedPortfolio);
    onDraftPortfolioChange(importedPortfolio);
    return summary;
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setSaveMessage('Saving changes...');
    try {
      const savedPortfolio = await portfolioService.savePortfolio(draftPortfolio, userId, workspaceId || userId);
      setDraftPortfolio(savedPortfolio);
      setLastSavedPortfolio(savedPortfolio);
      onSavePortfolio(savedPortfolio);
      setSaveMessage('Changes saved');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <div className="sticky top-0 z-10 -mx-2 rounded-2xl border border-surface-container-high bg-background/95 p-4 shadow-sm backdrop-blur sm:mx-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Chef Profile Studio</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Chef Profile Studio</h2>
          <p className="font-sans text-sm font-bold text-on-surface-variant mt-2">
            {statusMessage}
          </p>
        </div>

        <button type="button" onClick={handleSaveChanges} disabled={!hasUnsavedChanges || isSaving} className="mt-4 w-full rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 sm:mt-0 sm:w-auto">
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Public Profile</p>
          <h3 className="mt-1 font-display text-2xl font-bold text-primary">Profile visibility</h3>
        </div>
        <label className="flex items-center gap-3 font-sans text-sm font-extrabold text-primary">
          <input type="checkbox" checked={draftPortfolio.publicProfile?.enabled || false} onChange={event => updatePublicProfile({ ...(draftPortfolio.publicProfile || { username: '', ownerId: userId || '', displayName: 'Chef' }), enabled: event.target.checked })} className="h-5 w-5 accent-primary" />
          Enable Public Profile
        </label>
        <label className="block max-w-md space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Username</span>
          <input value={draftPortfolio.publicProfile?.username || ''} onChange={event => updatePublicProfile({ ...(draftPortfolio.publicProfile || { enabled: false, ownerId: userId || '', displayName: 'Chef' }), username: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) })} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>
        <div className="rounded-2xl bg-white p-4">
          <p className="font-sans text-xs font-extrabold text-outline">Public URL</p>
          <p className="mt-1 break-all font-sans text-sm font-bold text-primary">https://misechef.ai/@{draftPortfolio.publicProfile?.username || 'username'}</p>
          <button type="button" onClick={() => navigator.clipboard?.writeText(`https://misechef.ai/@${draftPortfolio.publicProfile?.username || ''}`)} className="mt-3 rounded-full border border-primary/20 px-4 py-2 font-sans text-xs font-extrabold text-primary">Copy Link</button>
        </div>

        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Chef Profile Studio</p>
          <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">Basic Profile</h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Core profile details that appear in your hero and overview cards.</p>
        </div>

        <HeroEditor basicProfile={draftPortfolio.basicProfile} onChange={updateBasicProfile} />

        <CoverImageUploader
          backgroundImageUrl={draftPortfolio.hero?.backgroundImageUrl}
          userId={userId}
          onChange={backgroundImageUrl => updateHero({
            ...(draftPortfolio.hero || {}),
            backgroundImageUrl
          })}
        />
      </section>

      <AboutManager about={draftPortfolio.about || {}} onChange={updateAbout} />
      <ExperienceManager experiences={draftPortfolio.experience || []} onChange={updateExperience} />
      <SkillsManager skills={draftPortfolio.skills || []} onChange={updateSkills} />
      <CertificatesManager certificates={draftPortfolio.certificates || []} userId={userId} onChange={updateCertificates} />
      <GalleryManager items={draftPortfolio.gallery || []} userId={userId} onChange={updateGallery} />
      <FeaturedRecipesManager featuredRecipes={draftPortfolio.featuredRecipes || []} recipes={recipes} onChange={updateFeaturedRecipes} />
      <ResumeManager resume={draftPortfolio.resume || { visibility: 'public', allowDownload: true }} userId={userId} onChange={updateResume} onImportFromResume={handleResumeImport} />
      <ContactManager contact={draftPortfolio.contact || { showEmail: true, showPhone: false }} onChange={updateContact} />
    </div>
  );
}
