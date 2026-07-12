import { addDoc, collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';
import type { Portfolio } from '../../portfolio/types';
import { publicRecipeService } from './publicRecipeService';

export interface PublicChefProfileResult {
  portfolio: Portfolio;
  recipes: Recipe[];
}

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

export const publicChefProfileService = { getByUsername, sendEnquiry };
