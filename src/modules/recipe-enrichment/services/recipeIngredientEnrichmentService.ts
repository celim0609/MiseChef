import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { CostingIngredient } from '../../costing/types';
import type { IngredientNutritionProfile } from '../../../types';

export type RecipeIngredientResolutionStatus = 'auto_matched' | 'confirmation_required' | 'unmatched';
export type RecipeIngredientResolution = {
  status: RecipeIngredientResolutionStatus;
  ingredient?: CostingIngredient;
  nutritionProfile?: IngredientNutritionProfile;
  candidates?: Array<{ variantKey: string; label: string }>;
  priceStatus?: 'missing';
};

export const resolveRecipeIngredientEnrichment = async ({ workspaceId, name, variantKey }: {
  workspaceId: string; name: string; variantKey?: string;
}): Promise<RecipeIngredientResolution> => {
  if (!functions) throw new Error('Ingredient enrichment is unavailable.');
  const call = httpsCallable<{ workspaceId: string; name: string; variantKey?: string }, RecipeIngredientResolution>(functions, 'resolveRecipeIngredientEnrichment');
  return (await call({ workspaceId, name, ...(variantKey ? { variantKey } : {}) })).data;
};
