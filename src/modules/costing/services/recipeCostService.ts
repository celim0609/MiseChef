import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Ingredient, Recipe, RecipeCostBreakdownItem } from '../../../types';
import type { CostingIngredient } from '../types';
import { ingredientService } from './ingredientService';
import type { IngredientCostChange } from './costIntelligenceService';
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

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

export const recipeCostService = {
  calculateRecipeCosting(recipe: Recipe, ingredients: CostingIngredient[], calculatedAt = new Date().toISOString()): Recipe {
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
  },

  async applyCosting(recipe: Recipe, userId: string, workspaceId = userId): Promise<Recipe> {
    const ingredients = await ingredientService.listIngredients(workspaceId);
    return this.calculateRecipeCosting(recipe, ingredients);
  },

  async recalculateRecipesForCostChanges({
    costChanges,
    userId,
    workspaceId = userId
  }: {
    costChanges: IngredientCostChange[];
    userId: string;
    workspaceId?: string;
  }) {
    if (!db || costChanges.length === 0) return [];

    const changedIngredientIds = new Set(costChanges.map(change => change.ingredientId));
    const changedIngredientNames = new Set(costChanges.map(change => normalizeName(change.ingredientName)));
    const [ingredients, recipesSnapshot] = await Promise.all([
      ingredientService.listIngredients(workspaceId),
      getDocs(query(collection(db, 'recipes'), where('workspaceId', '==', workspaceId)))
    ]);

    const updatedRecipes: Recipe[] = [];
    const updatePromises = recipesSnapshot.docs.map(async recipeDoc => {
      const recipe = { id: recipeDoc.id, ...recipeDoc.data() } as Recipe;
      const usesChangedIngredient = (recipe.ingredients || []).some(ingredient => (
        (ingredient.ingredientId && changedIngredientIds.has(ingredient.ingredientId)) ||
        changedIngredientNames.has(normalizeName(ingredient.name))
      ));

      if (!usesChangedIngredient) return;

      const costedRecipe = this.calculateRecipeCosting(recipe, ingredients);
      updatedRecipes.push(costedRecipe);
      await updateDoc(doc(db, 'recipes', recipe.id), removeUndefinedFields({
        ingredients: costedRecipe.ingredients,
        sellingPrice: costedRecipe.sellingPrice,
        costing: costedRecipe.costing,
        recipeCostLastCalculatedAt: costedRecipe.recipeCostLastCalculatedAt,
        updatedAt: new Date().toISOString()
      }) as unknown as Record<string, unknown>);
    });

    await Promise.all(updatePromises);
    return updatedRecipes;
  }
};
