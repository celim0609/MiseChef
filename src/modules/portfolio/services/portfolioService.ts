import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Portfolio } from '../types';

const clonePortfolio = (portfolio: Portfolio): Portfolio => ({
  ...portfolio,
  basicProfile: { ...portfolio.basicProfile },
  hero: portfolio.hero ? { ...portfolio.hero } : {},
  about: portfolio.about ? { ...portfolio.about } : {},
  experience: portfolio.experience ? [...portfolio.experience] : [],
  skills: portfolio.skills ? [...portfolio.skills] : [],
  certificates: portfolio.certificates ? [...portfolio.certificates] : [],
  gallery: portfolio.gallery ? [...portfolio.gallery] : [],
  featuredRecipes: portfolio.featuredRecipes ? [...portfolio.featuredRecipes] : [],
  resume: portfolio.resume ? { ...portfolio.resume } : undefined,
  contact: portfolio.contact ? { ...portfolio.contact } : undefined,
  metadata: portfolio.metadata ? { ...portfolio.metadata } : undefined,
  visibility: portfolio.visibility ? { ...portfolio.visibility } : { status: 'private' },
  publicProfile: portfolio.publicProfile ? { ...portfolio.publicProfile } : undefined,
  partnerSpotlight: portfolio.partnerSpotlight
    ? { ...portfolio.partnerSpotlight, partners: [...portfolio.partnerSpotlight.partners] }
    : { enabled: false, partners: [] }
});

const removeUndefinedFields = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => removeUndefinedFields(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) {
        acc[key] = removeUndefinedFields(item);
      }
      return acc;
    }, {});
  }

  return value;
};

const getUserPortfolioRef = (userId: string) => {
  if (!db) return null;
  return doc(db, 'users', userId, 'portfolio', 'profile');
};

const getWorkspacePortfolioRef = (workspaceId: string) => {
  if (!db) return null;
  return doc(db, 'workspaces', workspaceId, 'portfolio', 'profile');
};

export const portfolioService = {
  async loadPortfolio(userId?: string, workspaceId = userId): Promise<Portfolio | null> {
    if (!userId) return null;

    const workspacePortfolioRef = workspaceId ? getWorkspacePortfolioRef(workspaceId) : null;
    const workspaceSnapshot = workspacePortfolioRef ? await getDoc(workspacePortfolioRef) : null;
    if (workspaceSnapshot?.exists()) return clonePortfolio(workspaceSnapshot.data() as Portfolio);

    const userPortfolioRef = getUserPortfolioRef(userId);
    if (!userPortfolioRef) return null;

    const snapshot = await getDoc(userPortfolioRef);
    if (!snapshot.exists()) return null;

    return clonePortfolio(snapshot.data() as Portfolio);
  },

  async savePortfolio(portfolio: Portfolio, userId?: string, workspaceId = userId): Promise<Portfolio> {
    const portfolioRef = workspaceId ? getWorkspacePortfolioRef(workspaceId) : null;
    const now = new Date().toISOString();
    const existingPortfolio = portfolioRef ? await getDoc(portfolioRef) : null;
    const existingData = existingPortfolio?.exists() ? existingPortfolio.data() as Portfolio : null;
    const savedPortfolio = clonePortfolio({
      ...portfolio,
      metadata: {
        ...portfolio.metadata,
        createdAt: existingData?.metadata?.createdAt || portfolio.metadata?.createdAt || now,
        updatedAt: now
      }
    });

    if (portfolioRef) {
      await setDoc(portfolioRef, removeUndefinedFields(savedPortfolio) as Portfolio);
    }

    return savedPortfolio;
  }
};
