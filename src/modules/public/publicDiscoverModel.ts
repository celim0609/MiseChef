import type { DiscoverItem } from '../../components/discover';
import type { Recipe } from '../../types';
import { toPublicSlug } from './publicRoutes';

export interface PublicDiscoverProductSummary {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}

export interface PublicDiscoverStoreSummary {
  slug: string;
  name: string;
  description: string;
  imageUrl?: string;
  products: PublicDiscoverProductSummary[];
}

const toTime = (value?: string) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPublicRecipeItem = (
  recipe: Recipe,
  type: 'new-recipe' | 'featured-recipe',
  label: 'New' | 'Featured'
): DiscoverItem => ({
  id: `public-${type}-${recipe.id}`,
  type,
  label,
  disclosure: 'organic',
  title: recipe.title,
  description: type === 'new-recipe'
    ? `New from ${recipe.chefName || 'the MiseChef community'}.`
    : `A featured recipe from ${recipe.chefName || 'the MiseChef community'}.`,
  ctaLabel: 'View Recipe',
  destination: { kind: 'href', href: `/recipes/${toPublicSlug(recipe.title) || recipe.id}` },
  imageUrl: recipe.coverImage || recipe.imageUrl,
  imageAlt: recipe.title
});

export const createPublicHomeDiscoverItems = (
  recipes: Recipe[],
  stores: PublicDiscoverStoreSummary[]
): DiscoverItem[] => {
  const publicRecipes = recipes
    .filter(recipe => recipe.visibility === 'public')
    .sort((a, b) => toTime(b.createdAt || b.updatedAt) - toTime(a.createdAt || a.updatedAt));
  const newestRecipe = publicRecipes[0];
  const featuredRecipe = publicRecipes.find(recipe => recipe.isFeatured && recipe.id !== newestRecipe?.id)
    || publicRecipes.find(recipe => recipe.id !== newestRecipe?.id);
  const featuredStore = stores.find(store => Boolean(store.slug && store.name));
  const featuredProduct = featuredStore?.products[0];
  const items: DiscoverItem[] = [];

  if (newestRecipe) items.push(toPublicRecipeItem(newestRecipe, 'new-recipe', 'New'));
  if (featuredRecipe) items.push(toPublicRecipeItem(featuredRecipe, 'featured-recipe', 'Featured'));

  if (featuredStore) {
    const storeHref = `/store/${encodeURIComponent(featuredStore.slug)}`;
    items.push({
      id: `public-featured-store-${featuredStore.slug}`,
      type: 'featured-store',
      label: 'Featured',
      disclosure: 'organic',
      title: featuredStore.name,
      description: featuredStore.description || 'Explore a public MiseChef Store and order directly.',
      ctaLabel: 'Visit Store',
      destination: { kind: 'href', href: storeHref },
      imageUrl: featuredStore.imageUrl,
      imageAlt: featuredStore.name
    });

    if (featuredProduct) {
      items.push({
        id: `public-featured-product-${featuredProduct.id}`,
        type: 'featured-product',
        label: 'Recommended',
        disclosure: 'organic',
        title: featuredProduct.name,
        description: featuredProduct.description || `Available from ${featuredStore.name}.`,
        ctaLabel: 'View at Store',
        destination: { kind: 'href', href: storeHref },
        imageUrl: featuredProduct.imageUrl,
        imageAlt: featuredProduct.name
      });
    }
  }

  items.push({
    id: 'public-announcement-misechef-ecosystem',
    type: 'announcement',
    label: 'MiseChef',
    disclosure: 'organic',
    title: 'Discover the people behind the food',
    description: 'Explore public recipes, chefs, and Stores across MiseChef.',
    ctaLabel: 'Meet Chefs',
    destination: { kind: 'href', href: '/chefs' }
  });

  if (items.length === 1) {
    items.unshift(
      {
        id: 'public-announcement-recipes-worth-keeping',
        type: 'announcement',
        label: 'Discover',
        disclosure: 'organic',
        title: 'Recipes worth keeping, stories worth sharing',
        description: 'Build a culinary library around the food that matters to you.',
        ctaLabel: 'Explore Recipes',
        destination: { kind: 'href', href: '/recipes' }
      },
      {
        id: 'public-announcement-kitchen-business',
        type: 'announcement',
        label: 'MiseChef',
        disclosure: 'organic',
        title: 'One home for the craft and business of food',
        description: 'Move from recipe ideas to a more organised kitchen with MiseChef.',
        ctaLabel: 'Open MiseChef',
        destination: { kind: 'href', href: '/login' }
      }
    );
  }

  return items;
};
