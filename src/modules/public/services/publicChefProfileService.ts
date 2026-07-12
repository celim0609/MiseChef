import { addDoc, collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';
import type { Portfolio } from '../../portfolio/types';
import { publicRecipeService } from './publicRecipeService';

export interface PublicChefProfileResult {
  portfolio: Portfolio;
  recipes: Recipe[];
}

export interface PublicChefProfileSummary {
  ownerId: string;
  username: string;
  name: string;
  avatar?: string;
  cover?: string;
  professionalTitle?: string;
  country?: string;
  skills: string[];
  publicRecipeCount: number;
}

const listPublicProfiles = async (): Promise<PublicChefProfileSummary[]> => {
  if (!db) return [];
  const snapshot = await getDocs(query(
    collectionGroup(db, 'portfolio'),
    where('publicProfile.enabled', '==', true)
  ));
  const publicRecipes = await publicRecipeService.listPublicRecipes();

  return snapshot.docs.flatMap(document => {
    const portfolio = document.data() as Portfolio;
    const profile = portfolio.publicProfile;
    if (!profile?.username || !profile.ownerId) return [];
    const publicRecipeCount = publicRecipes.filter(recipe => {
      const ownership = recipe as Recipe & { createdBy?: string; userId?: string };
      return ownership.createdBy === profile.ownerId || ownership.userId === profile.ownerId;
    }).length;
    return [{
      ownerId: profile.ownerId,
      username: profile.username,
      name: profile.displayName,
      avatar: profile.avatarUrl,
      cover: portfolio.hero?.backgroundImageUrl || portfolio.basicProfile.coverPhotoUrl,
      professionalTitle: portfolio.basicProfile.professionalTitle,
      country: portfolio.basicProfile.location?.split(',').map(part => part.trim()).filter(Boolean).pop(),
      skills: (portfolio.skills || []).filter(skill => skill.visibility === 'public' && skill.name.trim()).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3).map(skill => skill.name),
      publicRecipeCount
    }];
  });
};

const getByUsername = async (username: string): Promise<PublicChefProfileResult | null> => {
  if (!db) return null;
  const normalizedUsername = username.trim().toLowerCase();
  const profileQuery = query(
    collectionGroup(db, 'portfolio'),
    where('publicProfile.username', '==', normalizedUsername),
    where('publicProfile.enabled', '==', true)
  );
  const snapshot = await getDocs(profileQuery);
  const document = snapshot.docs[0];
  if (!document) return null;

  const portfolio = document.data() as Portfolio;
  const ownerId = portfolio.publicProfile?.ownerId;
  if (!ownerId) return null;
  const publicRecipes = await publicRecipeService.listPublicRecipes();
  const recipes = publicRecipes.filter(recipe => {
    const ownership = recipe as Recipe & { createdBy?: string; userId?: string };
    return ownership.createdBy === ownerId || ownership.userId === ownerId;
  });
  return { portfolio, recipes };
};

const sendEnquiry = async (input: { profileOwnerId: string; username: string; name: string; email: string; message: string }) => {
  if (!db) throw new Error('Contact is temporarily unavailable.');
  await addDoc(collection(db, 'chefEnquiries'), {
    ...input,
    createdAt: new Date().toISOString(),
    status: 'New'
  });
};

export const publicChefProfileService = { getByUsername, listPublicProfiles, sendEnquiry };
