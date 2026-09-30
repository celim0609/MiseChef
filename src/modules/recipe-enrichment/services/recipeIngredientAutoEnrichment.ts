import type { Ingredient } from '../../../types';

export const markUnlinkedRecipeIngredientRowsForAutoEnrichment = (
  ingredients: Ingredient[],
  pendingRowIds: Set<string>
) => {
  ingredients.forEach(ingredient => {
    if (ingredient.name.trim() && !ingredient.ingredientId) pendingRowIds.add(ingredient.id);
  });
};

export const getPendingRecipeIngredientEnrichmentTargets = (
  ingredients: Ingredient[],
  pendingRowIds: Set<string>,
  attemptedNamesByRowId: Map<string, string>
) => ingredients.filter(ingredient => {
  const name = ingredient.name.trim();
  return Boolean(
    pendingRowIds.has(ingredient.id)
    && name
    && !ingredient.ingredientId
    && attemptedNamesByRowId.get(ingredient.id) !== name
  );
});
