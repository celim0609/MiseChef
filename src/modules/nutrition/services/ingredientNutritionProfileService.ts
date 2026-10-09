import { createNutritionRefresh } from './nutritionSubscription';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../firebase';
import type { IngredientNutritionProfile } from '../../../types';

export type IngredientNutritionSelection =
  | { source: 'none' }
  | { source: 'chef_non_food' }
  | { source: 'chef_override'; kcalPer100g?: number; kcalPer100ml?: number; gramsPerPiece?: number }
  | { source: 'usda_fdc'; fdcId: string; description?: string; gramsPerPiece?: number };

export const loadIngredientNutritionProfiles = async (_ingredientIds: string[], workspaceId?: string) => {
  if (!workspaceId) return {} as Record<string, IngredientNutritionProfile | undefined>;
  if (!functions) throw new Error('Nutrition service is unavailable.');
  const call = httpsCallable<{ workspaceId: string }, { profiles: Record<string, IngredientNutritionProfile> }>(functions, 'getWorkspaceNutritionProfiles');
  return (await call({ workspaceId })).data.profiles;
};

export const subscribeWorkspaceNutritionProfiles = (
  workspaceId: string,
  onProfiles: (profiles: Record<string, IngredientNutritionProfile | undefined>) => void,
  onError: (error: unknown) => void,
  onLoading: () => void = () => {}
) => {
  if (!db) { onError(new Error('Nutrition service is unavailable.')); return () => {}; }
  const refresh = createNutritionRefresh(() => loadIngredientNutritionProfiles([], workspaceId), onProfiles, onError, onLoading);
  const unsubscribe = onSnapshot(query(collection(db, 'ingredientNutritionProfiles'), where('workspaceId', '==', workspaceId)), () => {
    void refresh.refresh();
  }, onError);
  return () => { refresh.dispose(); unsubscribe(); };
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
  if (!functions) throw new Error('Nutrition profiles are unavailable.');
  const call = httpsCallable<{ workspaceId: string; profile: typeof profile }, { profile: IngredientNutritionProfile }>(functions, 'saveChefIngredientNutrition');
  return (await call({ workspaceId: profile.workspaceId, profile })).data.profile;
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
