import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';

const PUBLIC_VISIBILITY = 'public' as const;

const listPublicRecipes = async (): Promise<Recipe[]> => {
  if (!db) return [];

  const publicRecipesQuery = query(
    collection(db, 'recipes'),
    where('visibility', '==', PUBLIC_VISIBILITY)
  );
  const snapshot = await getDocs(publicRecipesQuery);

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
