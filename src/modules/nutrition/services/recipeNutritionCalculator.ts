import { resolveLinkedRecipeUsage } from '../../costing/services/linkedRecipeUsage';
import type { IngredientNutritionProfile, Recipe, RecipeIngredientNutrition, RecipeNutritionSummary } from '../../../types';
import { getNutritionUnit } from './nutritionUnits';
import { resolveRecipeNutritionIdentity } from './recipeNutritionIdentity';

export type NutritionRecipe = Pick<Recipe, 'ingredients' | 'servings'> & Partial<Pick<Recipe, 'id' | 'workspaceId' | 'linkedRecipes' | 'nutritionYield'>>;

export const calculateRecipeNutrition = (
  recipe: NutritionRecipe,
  profiles: Record<string, IngredientNutritionProfile | undefined>,
  recipes: Recipe[] = [],
  path: string[] = []
): RecipeNutritionSummary => {
  const reasons: string[] = [];
  const reviewWarnings: string[] = [];
  if (recipe.id && path.includes(recipe.id)) return { status: 'INCOMPLETE', incompleteReasons: ['Circular linked Recipe nutrition dependency.'], calculatedIngredientCount: 0, totalIngredientCount: 1 };
  if (path.length >= 50) return { status: 'INCOMPLETE', incompleteReasons: ['Linked Recipe nutrition depth exceeds the safety limit.'], calculatedIngredientCount: 0, totalIngredientCount: 1 };
  const nextPath = recipe.id ? [...path, recipe.id] : path;
  const links = recipe.linkedRecipes || [];
  const associations = links.map(link => link.associatedIngredientId).filter(Boolean);
  if (new Set(associations).size !== associations.length) reasons.push('Multiple linked Recipes replace the same ingredient. Review associations.');
  const ingredientBreakdown: RecipeIngredientNutrition[] = [];
  let totalKcal = 0;
  let calculatedIngredientCount = 0;
  let usableFoodCount = 0;
  let totalIngredientCount = 0;

  for (const ingredient of recipe.ingredients) {
    if (links.some(link => link.associatedIngredientId === ingredient.id)) continue;
    const label = ingredient.name.trim() || 'Unnamed ingredient';
    const profile = resolveRecipeNutritionIdentity(label, ingredient.ingredientId ? profiles[ingredient.ingredientId] : undefined);
    const profileInWorkspace = !profile || !('workspaceId' in profile) || !profile.workspaceId || !recipe.workspaceId || profile.workspaceId === recipe.workspaceId;
    if (profileInWorkspace && profile?.status === 'approved' && profile.kind === 'non_food') continue;
    totalIngredientCount += 1;
    const breakdownRow: RecipeIngredientNutrition = { id: ingredient.id, name: ingredient.name, quantity: ingredient.qty, unit: ingredient.unit };
    ingredientBreakdown.push(breakdownRow);
    if (profile && 'workspaceId' in profile && profile.workspaceId && recipe.workspaceId && profile.workspaceId !== recipe.workspaceId) { reasons.push(`${label}: nutrition profile belongs to another workspace.`); continue; }
    if (profile && 'foodDescription' in profile) breakdownRow.foodDescription = profile.foodDescription as string;
    if (profile && 'reviewWarnings' in profile) { breakdownRow.reviewWarnings = profile.reviewWarnings as string[]; reviewWarnings.push(...(profile.reviewWarnings as string[]).map(warning => `${label}: ${warning}`)); }
    if (!profile || profile.status !== 'approved') {
      reasons.push(`${label} nutrition data unavailable${ingredient.ingredientId ? '' : ' (link a canonical Ingredient).'}`);
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
      breakdownRow.kcal = contribution;
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
    breakdownRow.kcal = contribution;
    totalKcal += contribution;
    calculatedIngredientCount += 1;
    if (quantity > 0) usableFoodCount += 1;
  }

  for (const link of links) {
    const child = recipes.find(candidate => candidate.id === link.recipeId && (!recipe.workspaceId || candidate.workspaceId === recipe.workspaceId));
    const label = child?.title || link.recipeTitle || 'Linked Recipe';
    const associated = recipe.ingredients.find(ingredient => ingredient.id === link.associatedIngredientId);
    const row: RecipeIngredientNutrition = { id: link.id, name: label, quantity: link.nutritionUseAssociatedQuantity ? (associated?.qty || '') : String(link.quantity), unit: link.nutritionUseAssociatedQuantity ? (associated?.unit || '') : (link.unit || 'portion') };
    const fail = (message: string) => { totalIngredientCount++; ingredientBreakdown.push(row); reasons.push(`${label}: ${message}`); };
    if (!child) { fail('linked Recipe is unavailable in this workspace.'); continue; }
    if (link.associatedIngredientId && !associated) { fail('associated ingredient is unavailable.'); continue; }
    const usage = link.nutritionUseAssociatedQuantity
      ? resolveLinkedRecipeUsage(child, associated?.qty.trim() ? Number(associated.qty) : NaN, associated?.unit || '')
      : resolveLinkedRecipeUsage(child, link.quantity, link.unit || 'portion');
    if (usage.ratio === null) { fail(usage.reason || 'Linked quantity is unavailable.'); continue; }
    const ratio = usage.ratio;
    const nutrition = calculateRecipeNutrition(child, profiles, recipes, nextPath);
    // A child containing only confirmed non-food contributes neither coverage nor energy.
    if (nutrition.totalIngredientCount === 0) continue;
    totalIngredientCount += nutrition.totalIngredientCount || 1;
    ingredientBreakdown.push(row);
    reviewWarnings.push(...(nutrition.reviewWarnings || []).map(warning => `${label}: ${warning}`));
    if (nutrition.status === 'INCOMPLETE' || nutrition.totalKcal === undefined || !Number.isFinite(nutrition.totalKcal * ratio)) {
      reasons.push(`${label}: child nutrition is unavailable.`, ...nutrition.incompleteReasons.map(reason => `${label}: ${reason}`)); continue;
    }
    calculatedIngredientCount += nutrition.calculatedIngredientCount || 0;
    row.kcal = nutrition.totalKcal * ratio;
    totalKcal += row.kcal;
    usableFoodCount++;
    reasons.push(...nutrition.incompleteReasons.map(reason => `${label}: ${reason}`));
  }

  if (!Number.isInteger(recipe.servings) || recipe.servings <= 0) reasons.push('Recipe servings must be a positive whole number.');
  const coverage = { calculatedIngredientCount, totalIngredientCount, ingredientBreakdown, ...(reviewWarnings.length ? { reviewWarnings } : {}) };
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
