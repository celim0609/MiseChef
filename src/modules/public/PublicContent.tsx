import type { Key, ReactNode } from 'react';
import { ChefHat, Utensils } from 'lucide-react';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import { toPublicSlug } from './publicRoutes';

export interface PublicChefSummary {
  username: string;
  name: string;
  avatar?: string;
  professionalTitle?: string;
  location?: string;
  publicRecipeCount: number;
}

export type PublicSectionStatus = 'loading' | 'ready' | 'error';

export const PublicSectionState = ({
  status,
  isEmpty,
  emptyTitle,
  emptyMessage,
  children
}: {
  status: PublicSectionStatus;
  isEmpty: boolean;
  emptyTitle: string;
  emptyMessage: string;
  children: ReactNode;
}) => {
  if (status === 'loading') {
    return <div className="h-56 animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading public content" />;
  }

  if (status === 'error') {
    return <p className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center font-sans text-sm font-bold text-on-surface-variant">This section is temporarily unavailable.</p>;
  }

  if (isEmpty) {
    return (
      <div className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center">
        <p className="font-display text-xl font-semibold text-primary">{emptyTitle}</p>
        <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">{emptyMessage}</p>
      </div>
    );
  }

  return children;
};

export const PublicRecipeCard = ({ recipe }: { recipe: Recipe; key?: Key }) => (
  <a href={`/recipes/${toPublicSlug(recipe.title) || recipe.id}`} className="group overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    {recipe.coverImage ? (
      <img src={recipe.coverImage} alt={recipe.title} className="h-48 w-full object-cover" referrerPolicy="no-referrer" />
    ) : (
      <span className="flex h-48 items-center justify-center bg-surface-container-low text-primary"><Utensils className="h-7 w-7" /></span>
    )}
    <div className="p-5">
      <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-secondary">{getRecipeCategories(recipe).join(', ') || 'Recipe'}</p>
      <h3 className="mt-2 font-display text-xl font-semibold text-primary group-hover:text-secondary">{recipe.title}</h3>
      <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">By {recipe.chefName || 'MiseChef'}</p>
    </div>
  </a>
);

export const PublicChefCard = ({ chef }: { chef: PublicChefSummary; key?: Key }) => (
  <a href={`/chef/${chef.username}`} className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-center gap-4">
      {chef.avatar ? <img src={chef.avatar} alt="" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"><ChefHat className="h-7 w-7" /></span>}
      <div>
        <h3 className="font-display text-xl font-semibold text-primary">{chef.name}</h3>
        {chef.professionalTitle && <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{chef.professionalTitle}</p>}
        {chef.location && <p className="mt-1 font-sans text-xs font-bold text-outline">{chef.location}</p>}
      </div>
    </div>
    <p className="mt-5 font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-secondary">{chef.publicRecipeCount} public recipe{chef.publicRecipeCount === 1 ? '' : 's'}</p>
  </a>
);
