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
    const [ingredients, recipesSnapshot] = await Promise.all([
      ingredientService.listIngredients(workspaceId),
      db ? getDocs(query(collection(db, 'recipes'), where('workspaceId', '==', workspaceId))) : Promise.resolve(null)
    ]);
    const recipes = recipesSnapshot
      ? recipesSnapshot.docs.map(recipeDoc => ({ id: recipeDoc.id, ...recipeDoc.data() } as Recipe))
      : [];
    return calculateRecipeCosting(recipe, ingredients, new Date().toISOString(), [
      ...recipes.filter(candidate => candidate.id !== recipe.id),
      recipe
    ]);
  },

  async recalculateDependentRecipes(changedRecipeId: string, workspaceId: string) {
    if (!db || !changedRecipeId || !workspaceId) return [];
    const [ingredients, recipesSnapshot] = await Promise.all([
      ingredientService.listIngredients(workspaceId),
      getDocs(query(collection(db, 'recipes'), where('workspaceId', '==', workspaceId)))
    ]);
    const recipes = recipesSnapshot.docs.map(recipeDoc => ({ id: recipeDoc.id, ...recipeDoc.data() } as Recipe));
    const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
    const dependsOn = (recipe: Recipe, targetId: string, visited = new Set<string>()): boolean => {
      if (visited.has(recipe.id)) return false;
      visited.add(recipe.id);
      return (recipe.linkedRecipes || []).some(component => (
        component.recipeId === targetId
        || (byId.get(component.recipeId) ? dependsOn(byId.get(component.recipeId)!, targetId, visited) : false)
      ));
    };
    const dependents = recipes.filter(recipe => recipe.id !== changedRecipeId && dependsOn(recipe, changedRecipeId));
    const calculatedAt = new Date().toISOString();
    const updated = dependents.map(recipe => calculateRecipeCosting(recipe, ingredients, calculatedAt, recipes));
    await Promise.all(updated.map(recipe => updateDoc(doc(db, 'recipes', recipe.id), removeUndefinedFields({
      ingredients: recipe.ingredients,
      linkedRecipes: recipe.linkedRecipes,
      sellingPrice: recipe.sellingPrice,
      costing: recipe.costing,
      recipeCostLastCalculatedAt: recipe.recipeCostLastCalculatedAt,
      updatedAt: calculatedAt
    }) as unknown as Record<string, unknown>)));
    return updated;
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

    const recipes = recipesSnapshot.docs.map(recipeDoc => ({ id: recipeDoc.id, ...recipeDoc.data() } as Recipe));
    const updatedRecipes: Recipe[] = [];
    const updatePromises = recipesSnapshot.docs.map(async recipeDoc => {
      const recipe = recipes.find(candidate => candidate.id === recipeDoc.id)!;
      const usesChangedIngredient = (recipe.ingredients || []).some(ingredient => (
        (ingredient.ingredientId && changedIngredientIds.has(ingredient.ingredientId)) ||
        changedIngredientNames.has(normalizeName(ingredient.name))
      ));

      const hasRecipeDependencies = (recipe.linkedRecipes || []).length > 0;
      if (!usesChangedIngredient && !hasRecipeDependencies) return;

      const costedRecipe = calculateRecipeCosting(recipe, ingredients, new Date().toISOString(), recipes);
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
