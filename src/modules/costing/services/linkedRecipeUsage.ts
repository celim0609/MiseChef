import type { Recipe } from '../../../types';
import { getNutritionUnit } from '../../nutrition/services/nutritionUnits';

type RecipeOutput = Pick<Recipe, 'servings' | 'nutritionYield'>;
// Both nutrition and costing use this batch ratio. Free-text Yield and raw
// ingredient weights are deliberately excluded from the conversion inputs.
export const resolveLinkedRecipeUsage = (child: RecipeOutput, quantity: number, unit = 'portion') => {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ratio: null, reason: 'A positive linked quantity is required.' };
  if (unit === 'portion') {
    if (!Number.isInteger(child.servings) || child.servings <= 0) return { ratio: null, reason: 'Valid child servings are required for portion links.' };
    return { ratio: quantity / child.servings };
  }
  const usedUnit = getNutritionUnit(unit);
  const finished = child.nutritionYield;
  const finishedUnit = finished && getNutritionUnit(finished.unit);
  if (!finished || !Number.isFinite(finished.quantity) || finished.quantity <= 0 || !usedUnit || !finishedUnit || usedUnit.dimension !== finishedUnit.dimension) {
    return { ratio: null, reason: 'A compatible, explicitly confirmed finished yield is required.' };
  }
  const ratio = quantity * usedUnit.baseQuantity / (finished.quantity * finishedUnit.baseQuantity);
  return Number.isFinite(ratio) && ratio > 0 ? { ratio } : { ratio: null, reason: 'Linked quantity conversion is out of range.' };
};

// New links reuse structured measured output only. Existing portion links are untouched.
export const getDefaultLinkedRecipeUnit = (child: RecipeOutput) => {
  const finished = child.nutritionYield;
  return finished && resolveLinkedRecipeUsage(child, 1, finished.unit).ratio !== null ? finished.unit : 'portion';
};
