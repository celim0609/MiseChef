import type { Ingredient, Recipe, RecipeCostBreakdownItem } from '../../../types';
import type { CostingIngredient } from '../types';
import { calculateRecipeIngredientCost, parseRecipeQuantity } from './ingredientPackModel';
import { CircularRecipeDependencyError } from './recipeDependencyModel';

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
  calculatedAt = new Date().toISOString(),
  recipes: Recipe[] = [],
  dependencyPath: string[] = []
): Recipe => {
  if (dependencyPath.includes(recipe.id)) {
    throw new CircularRecipeDependencyError([...dependencyPath, recipe.id]);
  }
  const nextDependencyPath = [...dependencyPath, recipe.id];
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

  const linkedRecipeBreakdown: RecipeCostBreakdownItem[] = (recipe.linkedRecipes || []).map(component => {
    if (component.recipeId === recipe.id) throw new CircularRecipeDependencyError([recipe.id, recipe.id]);
    const linkedRecipe = recipes.find(candidate => candidate.id === component.recipeId);
    if (!linkedRecipe) {
      return {
        recipeIngredientId: component.id,
        linkedRecipeId: component.recipeId,
        itemType: 'linkedRecipe' as const,
        ingredientName: component.recipeTitle || 'Unavailable linked recipe',
        quantity: roundQuantity(Number(component.quantity)),
        unit: 'portion',
        unitCost: 0,
        ingredientCost: 0,
        percentageOfTotalRecipeCost: 0
      };
    }
    const calculatedLinkedRecipe = calculateRecipeCosting(
      linkedRecipe,
      ingredients,
      calculatedAt,
      recipes,
      nextDependencyPath
    );
    const quantity = Math.max(0, Number(component.quantity) || 0);
    const unitCost = Number(calculatedLinkedRecipe.costing?.costPerPortion || 0);
    return {
      recipeIngredientId: component.id,
      linkedRecipeId: component.recipeId,
      itemType: 'linkedRecipe' as const,
      ingredientName: component.recipeTitle || linkedRecipe.title,
      quantity: roundQuantity(quantity),
      unit: 'portion',
      unitCost,
      ingredientCost: roundMoney(quantity * unitCost),
      percentageOfTotalRecipeCost: 0
    };
  });
  const ingredientTotal = costedIngredients.reduce((total, ingredient) => total + Number(ingredient.ingredientCost || 0), 0);
  const linkedRecipeTotal = linkedRecipeBreakdown.reduce((total, item) => total + item.ingredientCost, 0);
  const totalRecipeCost = roundMoney(ingredientTotal + linkedRecipeTotal);
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
      itemType: 'ingredient',
      ingredientName: ingredient.name,
      quantity: roundQuantity(parseRecipeQuantity(ingredient.qty)),
      unit: ingredient.costingUnit || ingredient.unit,
      unitCost: Number(ingredient.unitCost || 0),
      ingredientCost: Number(ingredient.ingredientCost || 0),
      percentageOfTotalRecipeCost: totalRecipeCost > 0
        ? roundPercent((Number(ingredient.ingredientCost || 0) / totalRecipeCost) * 100)
        : 0
    }));
  const completeBreakdown = [...breakdown, ...linkedRecipeBreakdown]
    .filter(item => item.ingredientCost > 0)
    .map(item => ({
      ...item,
      percentageOfTotalRecipeCost: totalRecipeCost > 0
        ? roundPercent((item.ingredientCost / totalRecipeCost) * 100)
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
      breakdown: completeBreakdown,
      lastCalculatedAt: calculatedAt
    },
    recipeCostLastCalculatedAt: calculatedAt
  };
};
