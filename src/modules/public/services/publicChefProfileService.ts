import { addDoc, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';
import type { PublicChefProfile } from '../publicChefProfileTypes';
import { publicRecipeService } from './publicRecipeService';

type PublicRecipeRecord = Recipe & { chefUsername?: string };

export interface PublicChefProfileResult {
  profile: PublicChefProfile;
  recipes: Recipe[];
}

export interface PublicChefProfileSummary {
  username: string;
  name: string;
  avatar?: string;
  cover?: string;
  professionalTitle?: string;
  country?: string;
  skills: string[];
  publicRecipeCount: number;
  joinedAt?: string;
}

const listPublicProfiles = async (): Promise<PublicChefProfileSummary[]> => {
  if (!db) return [];
  const snapshot = await getDocs(collection(db, 'publicChefProfiles'));
  const publicRecipes = await publicRecipeService.listPublicRecipes() as unknown as PublicRecipeRecord[];

  return snapshot.docs.flatMap(document => {
    const profile = document.data() as PublicChefProfile;
    if (!profile.username) return [];
    const publicRecipeCount = publicRecipes.filter(recipe => recipe.chefUsername === profile.username).length;
    return [{
      username: profile.username,
      name: profile.displayName,
      avatar: profile.avatarUrl,
      cover: profile.coverImageUrl,
      professionalTitle: profile.professionalTitle,
      country: profile.location?.split(',').map(part => part.trim()).filter(Boolean).pop(),
      skills: profile.skills.slice(0, 3),
      publicRecipeCount,
      joinedAt: profile.publishedAt
    }];
  });
};

const getByUsername = async (username: string): Promise<PublicChefProfileResult | null> => {
  if (!db) return null;
  const normalizedUsername = username.trim().toLowerCase();
  const snapshot = await getDoc(doc(db, 'publicChefProfiles', normalizedUsername));
  if (!snapshot.exists()) return null;

  const profile = snapshot.data() as PublicChefProfile;
  const publicRecipes = await publicRecipeService.listPublicRecipes() as unknown as PublicRecipeRecord[];
  const recipes = publicRecipes.filter(recipe => recipe.chefUsername === normalizedUsername);
  return { profile, recipes };
};

const sendEnquiry = async (input: { username: string; name: string; email: string; message: string }) => {
  if (!db) throw new Error('Contact is temporarily unavailable.');
  await addDoc(collection(db, 'chefEnquiries'), {
    ...input,
    createdAt: new Date().toISOString(),
    status: 'New'
  });
};

export const publicChefProfileService = { getByUsername, listPublicProfiles, sendEnquiry };
