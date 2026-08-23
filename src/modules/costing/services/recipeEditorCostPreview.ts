import type { Ingredient, Recipe } from '../../../types';
import type { CostingIngredient } from '../types';
import { calculateRecipeCosting } from './recipeCostCalculator';

export const calculateRecipeEditorCostPreview = ({
  recipe,
  ingredients,
  libraryIngredients,
  servings,
  sellingPrice,
  calculatedAt = new Date().toISOString()
}: {
  recipe: Recipe;
  ingredients: Ingredient[];
  libraryIngredients: CostingIngredient[];
  servings: string;
  sellingPrice: string;
  calculatedAt?: string;
}) => {
  const parsedServings = Number(servings);
  const parsedSellingPrice = sellingPrice.trim() ? Number(sellingPrice) : 0;

  return calculateRecipeCosting({
    ...recipe,
    ingredients,
    servings: Number.isFinite(parsedServings) && parsedServings > 0 ? parsedServings : 0,
    sellingPrice: Number.isFinite(parsedSellingPrice) && parsedSellingPrice >= 0 ? parsedSellingPrice : 0
  }, libraryIngredients, calculatedAt);
};
