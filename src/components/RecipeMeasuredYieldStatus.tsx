import type { Recipe } from '../types';
import { resolveLinkedRecipeUsage } from '../modules/costing/services/linkedRecipeUsage';

export function RecipeMeasuredYieldStatus({ recipe, measuredLinkNeedsYield = false }: { recipe: Recipe; measuredLinkNeedsYield?: boolean }) {
  const yieldValue = recipe.nutritionYield;
  const verified = yieldValue && resolveLinkedRecipeUsage(recipe, 1, yieldValue.unit).ratio !== null;
  if (verified) return <p className="font-sans text-xs font-bold">Confirmed finished yield: {yieldValue.quantity} {yieldValue.unit}</p>;
  if (!measuredLinkNeedsYield) return null;
  return <p role="note" className="font-sans text-xs text-amber-800">Measured finished yield not set. {recipe.yield ? `Saved Yield “${recipe.yield}” is display text only. ` : ''}Set or confirm the Yield once in Edit Recipe to calculate linked kcal and cost. No weight or volume conversion is assumed.</p>;
}
