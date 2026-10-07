import type { IngredientNutritionProfile, Recipe, RecipeNutritionSummary } from '../../../types';
import { getNutritionUnit } from './nutritionUnits';

export const calculateRecipeNutrition = (
  recipe: Pick<Recipe, 'ingredients' | 'servings'>,
  profiles: Record<string, IngredientNutritionProfile | undefined>
): RecipeNutritionSummary => {
  const reasons: string[] = [];
  let totalKcal = 0;
  let calculatedIngredientCount = 0;
  let usableFoodCount = 0;

  for (const ingredient of recipe.ingredients) {
    const label = ingredient.name.trim() || 'Unnamed ingredient';
    if (!ingredient.ingredientId) {
      reasons.push(`${label} nutrition data unavailable (link a canonical Ingredient).`);
      continue;
    }
    const profile = profiles[ingredient.ingredientId];
    if (!profile || profile.status !== 'approved') {
      reasons.push(`${label} nutrition data unavailable`);
      continue;
    }
    if (profile.kind === 'non_food') {
      calculatedIngredientCount += 1;
      continue;
    }

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
      const contribution = quantity * (profile.gramsPerPiece as number) * (profile.kcalPer100g as number) / 100;
      if (!Number.isFinite(contribution)) { reasons.push(`${label}: nutrition calculation is out of range.`); continue; }
      totalKcal += contribution;
      calculatedIngredientCount += 1;
      if (quantity > 0) usableFoodCount += 1;
      continue;
    }
    const per100 = unit.dimension === 'mass' ? profile.kcalPer100g : profile.kcalPer100ml;
    if (!Number.isFinite(per100) || (per100 as number) < 0) {
      reasons.push(`${label}: approved nutrition does not support ${unit.dimension} units.`);
      continue;
    }
    const contribution = quantity * unit.baseQuantity * (per100 as number) / 100;
    if (!Number.isFinite(contribution)) { reasons.push(`${label}: nutrition calculation is out of range.`); continue; }
    totalKcal += contribution;
    calculatedIngredientCount += 1;
    if (quantity > 0) usableFoodCount += 1;
  }

  if (!Number.isInteger(recipe.servings) || recipe.servings <= 0) reasons.push('Recipe servings must be a positive whole number.');
  const coverage = { calculatedIngredientCount, totalIngredientCount: recipe.ingredients.length };
  if (!usableFoodCount || !Number.isFinite(totalKcal) || !Number.isInteger(recipe.servings) || recipe.servings <= 0) {
    if (!usableFoodCount) reasons.push('Not enough usable food nutrition data to estimate nutrition.');
    return { status: 'INCOMPLETE', incompleteReasons: reasons, ...coverage };
  }
  return { status: reasons.length ? 'ESTIMATED' : 'COMPLETE', totalKcal, kcalPerServing: totalKcal / recipe.servings, incompleteReasons: reasons, ...coverage };
};

export const getSnapshotCalories = (nutrition: RecipeNutritionSummary | undefined) => (
  nutrition?.status === 'COMPLETE' && Number.isFinite(nutrition.kcalPerServing)
    ? Math.round(nutrition.kcalPerServing as number)
    : undefined
);
