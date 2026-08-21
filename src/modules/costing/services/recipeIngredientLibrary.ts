import type { Ingredient } from '../../../types';
import type { CostingIngredient } from '../types';

type IngredientLister = (workspaceId?: string) => Promise<CostingIngredient[]>;

export const getRecipeIngredientLibraryWorkspaceId = (workspaceId?: string, userId?: string) => (
  workspaceId || userId || ''
);

export const getSelectableRecipeLibraryIngredients = (
  ingredients: CostingIngredient[],
  workspaceId: string
) => ingredients.filter(ingredient => (
  ingredient.workspaceId === workspaceId && ingredient.status === 'Active'
));

export const loadRecipeIngredientLibrary = async (
  workspaceId?: string,
  userId?: string,
  listIngredients?: IngredientLister
) => {
  const resolvedWorkspaceId = getRecipeIngredientLibraryWorkspaceId(workspaceId, userId);
  if (!resolvedWorkspaceId || !listIngredients) return [];

  const ingredients = await listIngredients(resolvedWorkspaceId);
  return getSelectableRecipeLibraryIngredients(ingredients, resolvedWorkspaceId);
};

export const updateRecipeIngredientLibraryLink = (
  recipeIngredient: Ingredient,
  libraryIngredient?: CostingIngredient
): Ingredient => {
  if (!libraryIngredient) {
    const {
      ingredientId: _ingredientId,
      unitCost: _unitCost,
      ingredientCost: _ingredientCost,
      costingUnit: _costingUnit,
      costLastCalculatedAt: _costLastCalculatedAt,
      ...unlinkedIngredient
    } = recipeIngredient;
    return unlinkedIngredient;
  }

  return {
    ...recipeIngredient,
    ingredientId: libraryIngredient.id,
    name: recipeIngredient.name.trim() || libraryIngredient.name,
    unit: recipeIngredient.unit.trim() || libraryIngredient.recipeUnit || libraryIngredient.purchaseUnit
  };
};
