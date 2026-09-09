import type { Recipe } from '../../types';
import { resolveRecipePerPortionCost } from '../costing/services/recipeCostCalculator';
import type { StoreProduct } from './types';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const resolveStoreProductEstimatedCost = (
  product: Pick<StoreProduct, 'recipeId'>,
  recipes: Recipe[]
) => {
  if (!product.recipeId) return null;
  return resolveRecipePerPortionCost(recipes.find(candidate => candidate.id === product.recipeId));
};

export const calculateStoreProductCostAnalysis = (
  product: Pick<StoreProduct, 'price' | 'recipeId'>,
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
