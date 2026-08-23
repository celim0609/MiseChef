import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';
import type { CostingIngredient } from '../types';
import { ingredientService } from './ingredientService';
import type { IngredientCostChange } from './costIntelligenceService';
import { calculateRecipeCosting } from './recipeCostCalculator';

const normalizeName = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');

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
    return calculateRecipeCosting(recipe, ingredients, calculatedAt);
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
