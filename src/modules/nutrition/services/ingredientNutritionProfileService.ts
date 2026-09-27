import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebase';
import type { IngredientNutritionProfile } from '../../../types';

export type IngredientNutritionSelection =
  | { source: 'none' }
  | { source: 'chef_non_food' }
  | { source: 'chef_override'; kcalPer100g?: number; kcalPer100ml?: number; gramsPerPiece?: number }
  | { source: 'usda_fdc'; fdcId: string; description?: string; gramsPerPiece?: number };

export const loadIngredientNutritionProfiles = async (ingredientIds: string[]) => {
  if (!db || ingredientIds.length === 0) return {} as Record<string, IngredientNutritionProfile | undefined>;
  const uniqueIds = [...new Set(ingredientIds.filter(Boolean))];
  const snapshots = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'ingredientNutritionProfiles', id))));
  return snapshots.reduce<Record<string, IngredientNutritionProfile | undefined>>((profiles, snapshot) => {
    if (snapshot.exists()) profiles[snapshot.id] = { id: snapshot.id, ...snapshot.data() } as IngredientNutritionProfile;
    return profiles;
  }, {});
};

export type UsdaNutritionCandidate = { fdcId: string; description: string; dataType: string; brandName: string; kcalPer100g: number };

export const searchUsdaIngredientNutrition = async (workspaceId: string, query: string) => {
  if (!functions) throw new Error('Nutrition lookup is unavailable.');
  const call = httpsCallable<{ workspaceId: string; query: string }, { candidates: UsdaNutritionCandidate[] }>(functions, 'searchUsdaNutritionCatalog');
  return (await call({ workspaceId, query })).data.candidates;
};

export const confirmUsdaIngredientNutrition = async (workspaceId: string, ingredientId: string, fdcId: string, gramsPerPiece?: number) => {
  if (!functions) throw new Error('Nutrition lookup is unavailable.');
  const call = httpsCallable<{ workspaceId: string; ingredientId: string; fdcId: string; gramsPerPiece?: number }, { profile: IngredientNutritionProfile }>(functions, 'confirmUsdaIngredientNutrition');
  return (await call({ workspaceId, ingredientId, fdcId, ...(gramsPerPiece === undefined ? {} : { gramsPerPiece }) })).data.profile;
};

export const saveChefNutritionProfile = async (profile: Omit<IngredientNutritionProfile, 'confirmedAt' | 'updatedAt'>) => {
  if (!db) throw new Error('Nutrition profiles are unavailable.');
  const now = new Date().toISOString();
  const nextProfile: IngredientNutritionProfile = { ...profile, confirmedAt: now, updatedAt: now };
  await setDoc(doc(db, 'ingredientNutritionProfiles', profile.ingredientId), nextProfile);
  return nextProfile;
};

export const applyIngredientNutritionSelection = async ({
  workspaceId,
  ingredientId,
  confirmedBy,
  selection
}: {
  workspaceId: string;
  ingredientId: string;
  confirmedBy: string;
  selection: IngredientNutritionSelection;
}): Promise<IngredientNutritionProfile | null> => {
  if (selection.source === 'none') return null;
  if (selection.source === 'usda_fdc') {
    return confirmUsdaIngredientNutrition(workspaceId, ingredientId, selection.fdcId, selection.gramsPerPiece);
  }
  if (selection.source === 'chef_non_food') {
    return saveChefNutritionProfile({
      id: ingredientId, ingredientId, workspaceId, kind: 'non_food', status: 'approved', source: 'chef_non_food', confirmedBy
    });
  }
  return saveChefNutritionProfile({
    id: ingredientId,
    ingredientId,
    workspaceId,
    kind: 'food',
    status: 'approved',
    source: 'chef_override',
    ...(selection.kcalPer100g === undefined ? {} : { kcalPer100g: selection.kcalPer100g }),
    ...(selection.kcalPer100ml === undefined ? {} : { kcalPer100ml: selection.kcalPer100ml }),
    ...(selection.gramsPerPiece === undefined ? {} : { gramsPerPiece: selection.gramsPerPiece }),
    confirmedBy
  });
};
