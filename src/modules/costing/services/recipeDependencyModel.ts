import type { LinkedRecipeComponent, Recipe } from '../../../types';

export class CircularRecipeDependencyError extends Error {
  constructor(path: string[]) {
    super(`Circular recipe dependency detected: ${path.join(' → ')}`);
    this.name = 'CircularRecipeDependencyError';
  }
}

export const validateRecipeDependencies = (
  recipeId: string,
  linkedRecipes: LinkedRecipeComponent[],
  recipes: Recipe[]
) => {
  if (linkedRecipes.some(component => !component.recipeId || !Number.isFinite(component.quantity) || component.quantity <= 0)) {
    return 'Every linked recipe needs a recipe and a quantity greater than zero.';
  }
  if (new Set(linkedRecipes.map(component => component.recipeId)).size !== linkedRecipes.length) {
    return 'Link each component recipe only once; adjust its quantity instead.';
  }
  const graph = new Map(recipes.map(recipe => [
    recipe.id,
    (recipe.id === recipeId ? linkedRecipes : recipe.linkedRecipes || []).map(component => component.recipeId)
  ]));
  graph.set(recipeId, linkedRecipes.map(component => component.recipeId));

  const visit = (currentId: string, path: string[]): string => {
    if (path.includes(currentId)) {
      return `Recipes cannot contain circular links (${[...path, currentId].join(' → ')}).`;
    }
    for (const childId of graph.get(currentId) || []) {
      const error = visit(childId, [...path, currentId]);
      if (error) return error;
    }
    return '';
  };

  return visit(recipeId, []);
};
