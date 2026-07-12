import { MapPin, UserRound, UsersRound } from 'lucide-react';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import { PublicChefCard, PublicRecipeCard, type PublicChefSummary } from './PublicContent';

const readOwnerId = (recipe: Recipe) => {
  const ownership = recipe as Recipe & { createdBy?: string; userId?: string };
  return ownership.createdBy || ownership.userId || '';
};

export default function PublicRecipeDiscoveryPage({ recipe, publicRecipes, publicChefs }: { recipe: Recipe; publicRecipes: Recipe[]; publicChefs: PublicChefSummary[] }) {
  const ownerId = readOwnerId(recipe);
  const chef = publicChefs.find(profile => profile.ownerId === ownerId);
  const moreRecipes = publicRecipes.filter(item => item.id !== recipe.id && readOwnerId(item) === ownerId).slice(0, 4);
  const moreChefs = [
    ...publicChefs.filter(profile => profile.ownerId !== ownerId),
    ...publicChefs.filter(profile => profile.ownerId === ownerId)
  ].slice(0, 4);
  const ingredients = (recipe.ingredients || []).map(item => item.name?.trim()).filter(Boolean);
  const cuisines = getRecipeCategories(recipe);
  const overview = [
    cuisines.length ? { label: 'Cuisine', value: cuisines.join(', ') } : null,
    recipe.prepTime > 0 ? { label: 'Prep Time', value: `${recipe.prepTime} minutes` } : null,
    recipe.cookTime && recipe.cookTime > 0 ? { label: 'Cook Time', value: `${recipe.cookTime} minutes` } : null,
    recipe.servings > 0 ? { label: 'Servings', value: String(recipe.servings) } : null
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return <div className="mx-auto max-w-6xl space-y-16 pb-8">
    <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm">
      {recipe.coverImage && <img src={recipe.coverImage} alt={recipe.title} className="max-h-[32rem] w-full object-cover" referrerPolicy="no-referrer" />}
      <div className="p-6 sm:p-10"><p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Public recipe</p><h1 className="mt-3 font-display text-4xl font-bold text-primary sm:text-5xl">{recipe.title}</h1>{recipe.story?.trim() && <p className="mt-6 font-sans text-base font-bold leading-relaxed text-on-surface-variant">{recipe.story}</p>}</div>
    </article>

    {chef && <section><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">About the Chef</p><div className="mt-4 flex flex-col gap-5 rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:flex-row sm:items-center"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-on-primary">{chef.avatar ? <img src={chef.avatar} alt={chef.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="h-8 w-8" />}</div><div className="flex-1"><h2 className="font-display text-3xl font-bold text-primary">{chef.name}</h2>{chef.professionalTitle && <p className="mt-1 font-sans text-sm font-extrabold text-on-surface-variant">{chef.professionalTitle}</p>}{chef.country && <p className="mt-2 flex items-center gap-2 font-sans text-xs font-bold text-outline"><MapPin className="h-4 w-4" />{chef.country}</p>}</div><a href={`/chef/${chef.username}`} className="rounded-full bg-primary px-5 py-3 text-center font-sans text-sm font-extrabold text-on-primary">View Chef</a></div></section>}

    {overview.length > 0 && <section><h2 className="font-display text-3xl font-bold text-primary">Recipe Overview</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{overview.map(item => <div key={item.label} className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5"><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-secondary">{item.label}</p><p className="mt-2 font-display text-xl font-bold text-primary">{item.value}</p></div>)}</div></section>}

    {ingredients.length > 0 && <section><h2 className="font-display text-3xl font-bold text-primary">Ingredients Preview</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{ingredients.map((name, index) => <div key={`${name}-${index}`} className="rounded-2xl bg-surface-container-low px-5 py-4 font-sans text-sm font-extrabold text-primary">{name}</div>)}</div></section>}

    {moreRecipes.length > 0 && <section><h2 className="font-display text-3xl font-bold text-primary">More Recipes from this Chef</h2><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{moreRecipes.map(item => <PublicRecipeCard key={item.id} recipe={item} />)}</div></section>}

    {moreChefs.length > 0 && <section><div className="flex items-center gap-3"><UsersRound className="h-6 w-6 text-secondary" /><h2 className="font-display text-3xl font-bold text-primary">Discover More Chefs</h2></div><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{moreChefs.map(profile => <PublicChefCard key={profile.username} chef={profile} />)}</div></section>}

    <section className="rounded-3xl bg-primary px-6 py-10 text-on-primary sm:px-10"><h2 className="max-w-3xl font-display text-4xl font-bold">Join thousands of professional chefs building their culinary portfolio on MiseChef.</h2><div className="mt-6 flex flex-wrap gap-3"><a href="/login" className="rounded-full bg-secondary px-5 py-3 font-sans text-sm font-extrabold text-on-secondary">Create Free Account</a><a href="/chefs" className="rounded-full border border-on-primary/25 px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Explore Chefs</a></div></section>
  </div>;
}
