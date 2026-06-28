import { Recipe } from '../types';
import { getRecipeCategories } from './categoryUtils';

export const getRecipeSearchText = (recipe: Recipe) => {
  const ingredientText = recipe.ingredients
    .map(ingredient => [
      ingredient.name,
      ingredient.englishName,
      ingredient.chineseName,
      ingredient.qty,
      ingredient.unit,
      ingredient.notes
    ].filter(Boolean).join(' '))
    .join(' ');

  return [
    recipe.title,
    recipe.chefName,
    getRecipeCategories(recipe).join(' '),
    recipe.tags?.join(' ') || '',
    ingredientText,
    recipe.chefNotes || '',
    recipe.story || ''
  ].join(' ').toLowerCase();
};
