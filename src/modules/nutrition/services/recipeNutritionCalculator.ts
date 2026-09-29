import type { IngredientNutritionProfile, Recipe, RecipeNutritionSummary } from '../../../types';
import { getNutritionUnit } from './nutritionUnits';

const incomplete = (reasons: string[]): RecipeNutritionSummary => ({ status: 'INCOMPLETE', incompleteReasons: reasons });

export const calculateRecipeNutrition = (
  recipe: Pick<Recipe, 'ingredients' | 'servings'>,
  profiles: Record<string, IngredientNutritionProfile | undefined>
): RecipeNutritionSummary => {
  const reasons: string[] = [];
  let totalKcal = 0;

  for (const ingredient of recipe.ingredients) {
    const label = ingredient.name.trim() || 'Unnamed ingredient';
    if (!ingredient.ingredientId) {
      reasons.push(`${label}: link a canonical Ingredient.`);
      continue;
    }
    const profile = profiles[ingredient.ingredientId];
    if (!profile || profile.status !== 'approved') {
      reasons.push(`${label}: nutrition profile is required.`);
      continue;
    }
    if (profile.kind === 'non_food') continue;

    const quantity = Number(ingredient.qty);
    if (!Number.isFinite(quantity) || quantity < 0 || !ingredient.qty.trim()) {
      reasons.push(`${label}: enter a non-negative numeric quantity.`);
      continue;
    }
    const unit = getNutritionUnit(ingredient.unit);
    if (!unit) {
      reasons.push(`${label}: ${ingredient.unit || 'missing unit'} is not supported for nutrition.`);
      continue;
    }
    if (unit.dimension === 'count') {
      if (!Number.isFinite(profile.kcalPer100g) || (profile.kcalPer100g as number) < 0) {
        reasons.push(`${label}: approved nutrition does not support piece units.`);
        continue;
      }
      if (!Number.isFinite(profile.gramsPerPiece) || (profile.gramsPerPiece as number) <= 0) {
        reasons.push(`${label}: approved nutrition needs Weight per piece (g) for ${ingredient.unit || 'piece'} units.`);
        continue;
      }
      totalKcal += quantity * (profile.gramsPerPiece as number) * (profile.kcalPer100g as number) / 100;
      continue;
    }
    const per100 = unit.dimension === 'mass' ? profile.kcalPer100g : profile.kcalPer100ml;
    if (!Number.isFinite(per100) || (per100 as number) < 0) {
      reasons.push(`${label}: approved nutrition does not support ${unit.dimension} units.`);
      continue;
    }
    totalKcal += quantity * unit.baseQuantity * (per100 as number) / 100;
  }

  if (!Number.isInteger(recipe.servings) || recipe.servings <= 0) reasons.push('Recipe servings must be a positive whole number.');
  if (reasons.length) return incomplete(reasons);
  return { status: 'COMPLETE', totalKcal, kcalPerServing: totalKcal / recipe.servings, incompleteReasons: [] };
};

export const getSnapshotCalories = (nutrition: RecipeNutritionSummary | undefined) => (
  nutrition?.status === 'COMPLETE' && Number.isFinite(nutrition.kcalPerServing)
    ? Math.round(nutrition.kcalPerServing as number)
    : undefined
);
