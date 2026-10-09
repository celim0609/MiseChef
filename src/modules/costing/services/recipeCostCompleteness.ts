import type { Recipe } from '../../../types';

const validCost = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const getRecipeCostCompleteness = (recipe?: Recipe): 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE' => {
  if (!recipe || !validCost(recipe.costing?.totalRecipeCost)) return 'INCOMPLETE';
  const eligible = (recipe.ingredients || []).filter(row => !(recipe.linkedRecipes || []).some(link => link.associatedIngredientId === row.id));
  const known = eligible.filter(row => validCost(row.ingredientCost) && !row.costingWarning);
  const hasKnown = Boolean(recipe.costing?.breakdown?.length) || known.length > 0;
  if (!hasKnown) return 'INCOMPLETE';
  return known.length < eligible.length || Boolean(recipe.costing?.linkedRecipeWarnings?.length) ? 'PARTIAL' : 'COMPLETE';
};
