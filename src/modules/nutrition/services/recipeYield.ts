import type { Recipe } from '../../../types';
import { getNutritionUnit } from './nutritionUnits';

// Parse explicit finished quantities only. No ingredient-weight inference,
// free-text qualifier stripping, serving conversion or mass/volume conversion.
export const parseMeasuredRecipeYield = (text: string): NonNullable<Recipe['nutritionYield']> | undefined => {
  const match = text.trim().match(/^((?:\d+(?:\.\d*)?|\.\d+))\s*(mg|milligrams?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|pcs?|pieces?)$/i);
  if (!match) return undefined;
  const unit = getNutritionUnit(match[2]);
  const quantity = Number(match[1]) * (unit?.baseQuantity || 0);
  if (!unit || !Number.isFinite(quantity) || quantity <= 0) return undefined;
  return { quantity, unit: unit.dimension === 'mass' ? 'g' : unit.dimension === 'volume' ? 'ml' : 'pcs' };
};

export const resolveRecipeYieldDenominator = ({ text, originalText = '', previous, chefEdited = false, confirmed = false }: {
  text: string; originalText?: string; previous?: Recipe['nutritionYield']; chefEdited?: boolean; confirmed?: boolean;
}): Recipe['nutritionYield'] => {
  if (!chefEdited && !confirmed && text === originalText) return previous;
  const measured = parseMeasuredRecipeYield(text);
  if (measured && (chefEdited || confirmed)) return measured;
  // Explicit null survives the existing callable JSON and Firestore merge path,
  // invalidating a previous denominator only when Yield was actually changed.
  return previous ? null : undefined;
};
