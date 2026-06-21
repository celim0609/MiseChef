import { Recipe } from '../types';

export const FALLBACK_CATEGORY_NAME = 'Others';

export const normalizeCategoryName = (value: string) => value.trim();

export const normalizeRecipeCategories = (values: Array<string | undefined | null>) => {
  const seen = new Set<string>();

  return values
    .map(value => normalizeCategoryName(value || ''))
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getRecipeCategories = (recipe: Pick<Recipe, 'category' | 'categories'>) => {
  const categories = Array.isArray(recipe.categories) && recipe.categories.length > 0
    ? recipe.categories
    : [recipe.category];

  const normalized = normalizeRecipeCategories(categories);
  return normalized.length > 0 ? normalized : [FALLBACK_CATEGORY_NAME];
};

export const getPrimaryCategory = (recipe: Pick<Recipe, 'category' | 'categories'>) => {
  return getRecipeCategories(recipe)[0] || FALLBACK_CATEGORY_NAME;
};

export const recipeHasCategory = (recipe: Pick<Recipe, 'category' | 'categories'>, categoryName: string) => {
  const target = categoryName.trim().toLowerCase();
  return getRecipeCategories(recipe).some(category => category.toLowerCase() === target);
};
