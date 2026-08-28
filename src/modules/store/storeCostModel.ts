import type { Recipe } from '../../types';
import type { StoreProduct } from './types';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const resolveStoreProductEstimatedCost = (
  product: Pick<StoreProduct, 'linkedRecipeId' | 'estimatedCost'>,
  recipes: Recipe[]
) => {
  if (product.linkedRecipeId) {
    const recipe = recipes.find(candidate => candidate.id === product.linkedRecipeId);
    const recipeCost = Number(recipe?.costing?.costPerPortion);
    return Number.isFinite(recipeCost) && recipeCost >= 0 ? roundMoney(recipeCost) : null;
  }
  const legacyCost = Number(product.estimatedCost);
  return Number.isFinite(legacyCost) && legacyCost >= 0 ? roundMoney(legacyCost) : null;
};

export const calculateStoreProductCostAnalysis = (
  product: Pick<StoreProduct, 'price' | 'linkedRecipeId' | 'estimatedCost'>,
  recipes: Recipe[]
) => {
  const sellingPrice = roundMoney(Number(product.price) || 0);
  const estimatedCost = resolveStoreProductEstimatedCost(product, recipes);
  const grossProfit = estimatedCost === null ? null : roundMoney(sellingPrice - estimatedCost);
  const grossMargin = grossProfit === null || sellingPrice <= 0
    ? null
    : Math.round((grossProfit / sellingPrice) * 10_000) / 100;
  return { sellingPrice, estimatedCost, grossProfit, grossMargin };
};
