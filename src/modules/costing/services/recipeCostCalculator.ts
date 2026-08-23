import type { Ingredient, Recipe, RecipeCostBreakdownItem } from '../../../types';
import type { CostingIngredient } from '../types';
import { calculateRecipeIngredientCost, parseRecipeQuantity } from './ingredientPackModel';

const normalizeName = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');
const roundMoney = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
const roundQuantity = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(6));
const roundPercent = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(1));

const removeCalculatedIngredientCost = (ingredient: Ingredient, costingWarning?: string): Ingredient => {
  const {
    unitCost: _unitCost,
    ingredientCost: _ingredientCost,
    costingUnit: _costingUnit,
    costLastCalculatedAt: _costLastCalculatedAt,
    costingWarning: _costingWarning,
    ...uncostedIngredient
  } = ingredient;
  return costingWarning ? { ...uncostedIngredient, costingWarning } : uncostedIngredient;
};

const findIngredientMatch = (recipeIngredient: Ingredient, ingredients: CostingIngredient[]) => {
  if (recipeIngredient.ingredientId) {
    const byId = ingredients.find(ingredient => ingredient.id === recipeIngredient.ingredientId);
    if (byId) return byId;
  }

  const recipeIngredientName = normalizeName(recipeIngredient.name);
  return ingredients.find(ingredient => normalizeName(ingredient.name) === recipeIngredientName) || null;
};

export const calculateRecipeCosting = (
  recipe: Recipe,
  ingredients: CostingIngredient[],
  calculatedAt = new Date().toISOString()
): Recipe => {
  const activeIngredients = ingredients.filter(ingredient => ingredient.status === 'Active');
  const costedIngredients = recipe.ingredients.map(recipeIngredient => {
    const matchedIngredient = findIngredientMatch(recipeIngredient, activeIngredients);
    if (!matchedIngredient) return removeCalculatedIngredientCost(recipeIngredient);
    const calculatedCost = calculateRecipeIngredientCost(recipeIngredient, matchedIngredient);
    if (!('unitCost' in calculatedCost)) {
      return removeCalculatedIngredientCost(recipeIngredient, calculatedCost.warning);
    }

    return {
      ...recipeIngredient,
      ingredientId: matchedIngredient.id,
      unitCost: calculatedCost.unitCost,
      ingredientCost: calculatedCost.ingredientCost,
      costingUnit: calculatedCost.costingUnit,
      costLastCalculatedAt: calculatedAt,
      costingWarning: undefined
    };
  });

  const totalRecipeCost = roundMoney(costedIngredients.reduce((total, ingredient) => total + Number(ingredient.ingredientCost || 0), 0));
  const servings = Number(recipe.servings || 0);
  const costPerPortion = servings > 0 ? roundMoney(totalRecipeCost / servings) : 0;
  const sellingPrice = Number(recipe.sellingPrice ?? recipe.costing?.sellingPrice ?? 0);
  const foodCostPercentage = sellingPrice > 0 ? roundPercent((costPerPortion / sellingPrice) * 100) : 0;
  const grossProfitPercentage = sellingPrice > 0 ? roundPercent(((sellingPrice - costPerPortion) / sellingPrice) * 100) : 0;
  const breakdown: RecipeCostBreakdownItem[] = costedIngredients
    .filter(ingredient => Number(ingredient.ingredientCost || 0) > 0)
    .map(ingredient => ({
      recipeIngredientId: ingredient.id,
      ingredientId: ingredient.ingredientId,
      ingredientName: ingredient.name,
      quantity: roundQuantity(parseRecipeQuantity(ingredient.qty)),
      unit: ingredient.costingUnit || ingredient.unit,
      unitCost: Number(ingredient.unitCost || 0),
      ingredientCost: Number(ingredient.ingredientCost || 0),
      percentageOfTotalRecipeCost: totalRecipeCost > 0
        ? roundPercent((Number(ingredient.ingredientCost || 0) / totalRecipeCost) * 100)
        : 0
    }));

  return {
    ...recipe,
    ingredients: costedIngredients,
    sellingPrice,
    costing: {
      totalRecipeCost,
      costPerPortion,
      sellingPrice,
      foodCostPercentage,
      grossProfitPercentage,
      breakdown,
      lastCalculatedAt: calculatedAt
    },
    recipeCostLastCalculatedAt: calculatedAt
  };
};
