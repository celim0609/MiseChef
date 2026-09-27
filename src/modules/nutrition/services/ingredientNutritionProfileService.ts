import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebase';
import type { IngredientNutritionProfile } from '../../../types';

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

export const searchUsdaIngredientNutrition = async (workspaceId: string, ingredientId: string, query: string) => {
  if (!functions) throw new Error('Nutrition lookup is unavailable.');
  const call = httpsCallable<{ workspaceId: string; ingredientId: string; query: string }, { candidates: UsdaNutritionCandidate[] }>(functions, 'searchUsdaNutritionCatalog');
  return (await call({ workspaceId, ingredientId, query })).data.candidates;
};

export const confirmUsdaIngredientNutrition = async (workspaceId: string, ingredientId: string, fdcId: string) => {
  if (!functions) throw new Error('Nutrition lookup is unavailable.');
  const call = httpsCallable<{ workspaceId: string; ingredientId: string; fdcId: string }, { profile: IngredientNutritionProfile }>(functions, 'confirmUsdaIngredientNutrition');
  return (await call({ workspaceId, ingredientId, fdcId })).data.profile;
};

export const saveChefNutritionProfile = async (profile: Omit<IngredientNutritionProfile, 'confirmedAt' | 'updatedAt'>) => {
  if (!db) throw new Error('Nutrition profiles are unavailable.');
  const now = new Date().toISOString();
  const nextProfile: IngredientNutritionProfile = { ...profile, confirmedAt: now, updatedAt: now };
  await setDoc(doc(db, 'ingredientNutritionProfiles', profile.ingredientId), nextProfile);
  return nextProfile;
};
