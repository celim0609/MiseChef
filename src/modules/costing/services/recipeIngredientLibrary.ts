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

type SearchableIngredientFields = {
  sku?: unknown;
  itemCode?: unknown;
  code?: unknown;
  supplierName?: unknown;
  productName?: unknown;
};

export const filterRecipeLibraryIngredients = (
  ingredients: CostingIngredient[],
  searchQuery: string
) => {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) return ingredients;

  return ingredients.filter(ingredient => {
    const searchableIngredient = ingredient as CostingIngredient & SearchableIngredientFields;
    return [
      ingredient.name,
      searchableIngredient.sku,
      searchableIngredient.itemCode,
      searchableIngredient.code,
      searchableIngredient.supplierName,
      searchableIngredient.productName,
      ingredient.supplierId
    ].some(value => String(value ?? '').toLocaleLowerCase().includes(normalizedQuery));
  });
};

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
