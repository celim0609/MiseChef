import type { CostingIngredient } from '../types';

export const normalizeIngredient = (ingredient: CostingIngredient): CostingIngredient => ({
  ...ingredient,
  ...(ingredient.packQuantity !== undefined ? { packQuantity: Number(ingredient.packQuantity) } : {}),
  ...(ingredient.packPrice !== undefined ? { packPrice: Number(ingredient.packPrice) } : {}),
  conversionFactor: Number(ingredient.conversionFactor || 1),
  currentPrice: Number(ingredient.currentPrice || 0),
  yieldPercentage: Number(ingredient.yieldPercentage || 100),
  wastePercentage: Number(ingredient.wastePercentage || 0),
  status: ingredient.status || 'Active'
});
