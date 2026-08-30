import type { Recipe } from '../../types';
import type { PublicChefSummary } from './PublicContent';

const INTERNAL_AUTHOR_LABELS = new Set([
  'user log', 'user profile', 'unknown member', 'workspace member', 'chef', 'user'
]);

export const safePublicDisplayName = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || INTERNAL_AUTHOR_LABELS.has(name.toLowerCase())) return '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return '';
  if (/^[A-Za-z0-9_-]{24,}$/.test(name)) return '';
  return name;
};

export const resolvePublicRecipeAuthors = (recipes: Recipe[], chefs: PublicChefSummary[] = []) => (
  recipes.map(recipe => {
    const chef = recipe.chefUsername
      ? chefs.find(candidate => candidate.username === recipe.chefUsername)
      : undefined;
    const publicDisplayName = safePublicDisplayName(chef?.publicDisplayName || chef?.name) || 'MiseChef';
    return { ...recipe, publicDisplayName, chefName: publicDisplayName };
  })
);
