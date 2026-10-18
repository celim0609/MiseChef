import { useEffect, useMemo, useState } from 'react';
import type { IngredientNutritionProfile, Recipe, RecipeNutritionSummary } from '../../../types';
import { calculateRecipeNutrition, type NutritionRecipe } from '../services/recipeNutritionCalculator';

export const useWorkspaceNutritionProfiles = (workspaceId?: string) => {
  const [state, setState] = useState<{ workspaceId?: string; profiles?: Record<string, IngredientNutritionProfile | undefined>; error?: boolean }>({});
  useEffect(() => {
    setState({ workspaceId });
    if (!workspaceId) { setState({ workspaceId, profiles: {} }); return; }
    let active = true;
    let unsubscribe = () => {};
    void import('../services/ingredientNutritionProfileService').then(({ subscribeWorkspaceNutritionProfiles }) => {
      if (!active) return;
      unsubscribe = subscribeWorkspaceNutritionProfiles(workspaceId,
        profiles => { if (active) setState({ workspaceId, profiles }); },
        () => { if (active) setState({ workspaceId, error: true }); },
        () => { if (active) setState({ workspaceId }); });
    }).catch(() => { if (active) setState({ workspaceId, error: true }); });
    return () => { active = false; unsubscribe(); };
  }, [workspaceId]);
  return state.workspaceId === workspaceId ? state : {};
};

export const unavailableNutrition = (error?: boolean): RecipeNutritionSummary => ({
  status: 'INCOMPLETE', incompleteReasons: [error ? 'Nutrition service is unavailable. Please retry.' : 'Nutrition data is loading.']
});

export const useRecipeNutrition = (recipe: NutritionRecipe, recipes: Recipe[] = [], workspaceId = recipe.workspaceId) => {
  const state = useWorkspaceNutritionProfiles(workspaceId);
  return useMemo(() => state.profiles ? calculateRecipeNutrition(recipe, state.profiles, recipes) : unavailableNutrition(state.error), [recipe, recipes, state.profiles, state.error]);
};
