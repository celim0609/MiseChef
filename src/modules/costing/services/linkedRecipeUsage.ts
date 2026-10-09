import { parseMeasuredRecipeYield } from '../../nutrition/services/recipeYield';
import type { Recipe } from '../../../types';
import { getNutritionUnit } from '../../nutrition/services/nutritionUnits';

type RecipeOutput = Pick<Recipe, 'servings' | 'nutritionYield'> & Partial<Pick<Recipe, 'yield'>>;
// The single saved Yield is authoritative for explicit measured mass. Strict
// parsing excludes qualifiers, unitless amounts and mass/volume conversions.
export const getLinkedRecipeFinishedYield = (child: RecipeOutput) => {
  const saved = parseMeasuredRecipeYield(child.yield || '');
  return saved?.unit === 'g' ? saved : child.nutritionYield;
};

// Both nutrition and costing share the same batch ratio; ingredient weights
// and servings are never used as denominators for measured links.
export const resolveLinkedRecipeUsage = (child: RecipeOutput, quantity: number, unit = 'portion') => {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ratio: null, reason: 'A positive linked quantity is required.' };
  if (unit === 'portion') {
    if (!Number.isInteger(child.servings) || child.servings <= 0) return { ratio: null, reason: 'Valid child servings are required for portion links.' };
    return { ratio: quantity / child.servings };
  }
  const usedUnit = getNutritionUnit(unit);
  const finished = getLinkedRecipeFinishedYield(child);
  const finishedUnit = finished && getNutritionUnit(finished.unit);
  if (!finished || !Number.isFinite(finished.quantity) || finished.quantity <= 0 || !usedUnit || !finishedUnit || usedUnit.dimension !== finishedUnit.dimension) {
    return { ratio: null, reason: 'A compatible, explicitly confirmed finished yield is required.' };
  }
  const ratio = quantity * usedUnit.baseQuantity / (finished.quantity * finishedUnit.baseQuantity);
  return Number.isFinite(ratio) && ratio > 0 ? { ratio } : { ratio: null, reason: 'Linked quantity conversion is out of range.' };
};

// New links reuse saved measured output. Existing portion links are untouched.
export const getDefaultLinkedRecipeUnit = (child: RecipeOutput) => {
  const finished = getLinkedRecipeFinishedYield(child);
  return finished && resolveLinkedRecipeUsage(child, 1, finished.unit).ratio !== null ? finished.unit : 'portion';
};
