import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';

const PUBLIC_VISIBILITY = 'public' as const;

const listPublicRecipes = async (): Promise<Recipe[]> => {
  if (!db) return [];

  const snapshot = await getDocs(collection(db, 'publicRecipes'));

  return snapshot.docs
    .map(recipeDocument => ({
      ...(recipeDocument.data() as Omit<Recipe, 'id'>),
      id: recipeDocument.id,
      visibility: PUBLIC_VISIBILITY
    }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
};

export const publicRecipeService = {
  listPublicRecipes
};
