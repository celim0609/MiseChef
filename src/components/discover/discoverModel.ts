import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';

export const DISCOVER_AUTOPLAY_MS = 9_000;
export const DISCOVER_TRANSITION_MS = 520;
export const DISCOVER_SWIPE_THRESHOLD_PX = 42;

export type DiscoverContentType =
  | 'new-recipe'
  | 'featured-recipe'
  | 'featured-store'
  | 'featured-product'
  | 'announcement';

export type DiscoverLabel = 'New' | 'Featured' | 'Recommended' | 'Discover' | 'MiseChef' | 'Sponsored';
export type DiscoverDisclosure = 'organic' | 'sponsored';

export type DiscoverDestination =
  | { kind: 'recipe'; recipeId: string }
  | { kind: 'href'; href: string };

export interface DiscoverItem {
  id: string;
  type: DiscoverContentType;
  label: DiscoverLabel;
  disclosure: DiscoverDisclosure;
  title: string;
  description: string;
  ctaLabel: string;
  destination: DiscoverDestination;
  imageUrl?: string;
  imageAlt?: string;
}

export const getDiscoverDisplayLabel = (item: DiscoverItem): DiscoverLabel => (
  item.disclosure === 'sponsored' ? 'Sponsored' : item.label
);

export const getNextDiscoverIndex = (currentIndex: number, itemCount: number) => (
  itemCount > 0 ? (currentIndex + 1) % itemCount : 0
);

export const getPreviousDiscoverIndex = (currentIndex: number, itemCount: number) => (
  itemCount > 0 ? (currentIndex - 1 + itemCount) % itemCount : 0
);

export const getDiscoverSwipeDirection = (startX: number, endX: number) => {
  const distance = endX - startX;
  if (Math.abs(distance) < DISCOVER_SWIPE_THRESHOLD_PX) return 0;
  return distance < 0 ? 1 : -1;
};

export const shouldAutoPlayDiscover = ({
  itemCount,
  prefersReducedMotion,
  isInteracting
}: {
  itemCount: number;
  prefersReducedMotion: boolean;
  isInteracting: boolean;
}) => itemCount > 1 && !prefersReducedMotion && !isInteracting;

const toTime = (value?: string) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const recipeDescription = (recipe: Recipe) => {
  const category = getRecipeCategories(recipe)[0] || 'Recipe';
  return `${category} · ${recipe.prepTime} min prep`;
};

const toRecipeItem = (
  recipe: Recipe,
  type: 'new-recipe' | 'featured-recipe',
  label: 'New' | 'Featured' | 'Recommended'
): DiscoverItem => ({
  id: `${type}-${recipe.id}`,
  type,
  label,
  disclosure: 'organic',
  title: recipe.title,
  description: type === 'featured-recipe'
    ? `Featured from your recipe library · ${recipeDescription(recipe)}`
    : `Recently added · ${recipeDescription(recipe)}`,
  ctaLabel: 'View Recipe',
  destination: { kind: 'recipe', recipeId: recipe.id },
  imageUrl: recipe.coverImage || recipe.imageUrl,
  imageAlt: recipe.title
});

export const RECIPE_LIBRARY_DISCOVER_ANNOUNCEMENTS: DiscoverItem[] = [{
  id: 'announcement-public-recipes',
  type: 'announcement',
  label: 'Discover',
  disclosure: 'organic',
  title: 'Explore recipes from the MiseChef community',
  description: 'Find public recipes and the chefs behind them.',
  ctaLabel: 'Explore Recipes',
  destination: { kind: 'href', href: '/recipes' }
}];

export const createRecipeLibraryDiscoverItems = (recipes: Recipe[]): DiscoverItem[] => {
  const sortedRecipes = [...recipes].sort((a, b) => (
    toTime(b.createdAt || b.updatedAt) - toTime(a.createdAt || a.updatedAt)
  ));
  const latestRecipe = sortedRecipes[0];
  const featuredRecipe = sortedRecipes.find(recipe => recipe.isFeatured && recipe.id !== latestRecipe?.id);
  const items: DiscoverItem[] = [];

  if (latestRecipe) {
    items.push(toRecipeItem(latestRecipe, 'new-recipe', latestRecipe.createdAt ? 'New' : 'Recommended'));
  }
  if (featuredRecipe) {
    items.push(toRecipeItem(featuredRecipe, 'featured-recipe', 'Featured'));
  }

  return [...items, ...RECIPE_LIBRARY_DISCOVER_ANNOUNCEMENTS];
};
