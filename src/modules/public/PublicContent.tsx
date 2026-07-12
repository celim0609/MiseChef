import type { Key, ReactNode } from 'react';
import { ArrowRight, Utensils } from 'lucide-react';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import { toPublicSlug } from './publicRoutes';

export interface PublicChefSummary {
  ownerId: string;
  username: string;
  name: string;
  avatar?: string;
  cover?: string;
  professionalTitle?: string;
  country?: string;
  skills: string[];
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

export const PublicChefCard = ({ chef }: { chef: PublicChefSummary; key?: Key }) => {
  const initials = chef.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'MC';
  return (
    <article className="group overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="h-28 bg-surface-container-low">{chef.cover && <img src={chef.cover} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}</div>
      <div className="px-5 pb-5">
        <div className="-mt-9 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary text-on-primary shadow-sm">
          {chef.avatar ? <img src={chef.avatar} alt={chef.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="font-display text-xl font-bold tracking-wide">{initials}</span>}
        </div>
        <h3 className="mt-4 font-display text-2xl font-bold text-primary">{chef.name}</h3>
        {chef.professionalTitle && <p className="mt-1 font-sans text-xs font-extrabold text-on-surface-variant">{chef.professionalTitle}</p>}
        {chef.country && <p className="mt-2 font-sans text-xs font-bold text-outline">{chef.country}</p>}
        {chef.skills.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{chef.skills.slice(0, 3).map(skill => <span key={skill} className="rounded-full bg-surface-container-low px-3 py-1.5 font-sans text-[10px] font-extrabold text-primary">{skill}</span>)}</div>}
        <p className="mt-5 font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-secondary">{chef.publicRecipeCount} public recipe{chef.publicRecipeCount === 1 ? '' : 's'}</p>
        <a href={`/chef/${chef.username}`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 font-sans text-xs font-extrabold text-on-primary">View Profile <ArrowRight className="h-4 w-4" /></a>
      </div>
    </article>
  );
};
