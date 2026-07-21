import { MapPin, UserRound, UsersRound } from 'lucide-react';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import { PublicChefCard, PublicRecipeCard, type PublicChefSummary } from './PublicContent';

type RecipeWithChefUsername = Recipe & { chefUsername?: string };

const readChefUsername = (recipe: Recipe) =>
  (recipe as RecipeWithChefUsername).chefUsername || '';

export default function PublicRecipeDiscoveryPage({ recipe, publicRecipes, publicChefs }: { recipe: Recipe; publicRecipes: Recipe[]; publicChefs: PublicChefSummary[] }) {
  const chefUsername = readChefUsername(recipe);
  const chef = chefUsername ? publicChefs.find(profile => profile.username === chefUsername) : undefined;
  const moreRecipes = chefUsername
    ? publicRecipes.filter(item => item.id !== recipe.id && readChefUsername(item) === chefUsername).slice(0, 4)
    : [];
  const moreChefs = [
    ...publicChefs.filter(profile => profile.username !== chefUsername),
    ...publicChefs.filter(profile => profile.username === chefUsername)
  ].slice(0, 4);
  const ingredients = (recipe.ingredients || []).filter(item => item.name?.trim());
  const recommendedProducts = recipe.recommendedProducts || [];
  const instructions = (recipe.method || []).filter(step => step.description?.trim() || step.image);
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

    {ingredients.length > 0 && <section className="mx-auto max-w-4xl"><h2 className="font-display text-3xl font-bold text-primary">Ingredients</h2><ul className="mt-5 divide-y divide-surface-container-high border-y border-surface-container-high">{ingredients.map((ingredient, index) => {
      const quantityAndUnit = [ingredient.qty?.trim(), ingredient.unit?.trim()].filter(Boolean).join(' ');
      const preparation = ingredient.notes?.trim();
      return <li key={`${ingredient.name}-${index}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 py-3 font-sans sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-6">
        <span className="font-extrabold tabular-nums text-on-surface-variant">{quantityAndUnit}</span>
        <span className="min-w-0">
          <span className="block font-extrabold text-primary">{ingredient.name.trim()}</span>
          {preparation && <span className="mt-1 block text-sm font-medium text-on-surface-variant">{preparation}</span>}
        </span>
      </li>;
    })}</ul></section>}

    {recommendedProducts.length > 0 && <section className="mx-auto max-w-4xl"><h2 className="font-display text-3xl font-bold text-primary">Chef Recommended Products</h2><ul className="mt-5 divide-y divide-surface-container-high border-y border-surface-container-high">{recommendedProducts.map((product, index) => <li key={`${product.name}-${index}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-center gap-3 font-sans text-base font-extrabold text-primary"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />{product.name}</span>
      <a href={product.url} target="_blank" rel="noopener noreferrer sponsored" className="ml-4 w-fit rounded-full bg-primary px-4 py-2 font-sans text-sm font-extrabold text-on-primary sm:ml-0">View Product</a>
    </li>)}</ul></section>}

    {instructions.length > 0 && <section className="mx-auto max-w-4xl"><h2 className="font-display text-3xl font-bold text-primary">Instructions</h2><ol className="mt-8">{instructions.map((step, index) => {
      const stepNumber = step.stepNumber || index + 1;
      return <li key={`${stepNumber}-${index}`} className="relative grid grid-cols-[3.75rem_minmax(0,1fr)] gap-4 pb-10 last:pb-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-6 print:break-inside-avoid">
        {index < instructions.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[1.875rem] top-14 w-px bg-surface-container-high sm:left-10" />}
        <div className="relative z-10 bg-background py-1 text-center">
          <span className="block font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-secondary">Step</span>
          <span className="mt-1 block font-display text-3xl font-bold tabular-nums text-primary">{stepNumber}</span>
        </div>
        <div className={`min-w-0 ${index < instructions.length - 1 ? 'border-b border-surface-container-high pb-10' : ''}`}>
          {step.description?.trim() && <p className="whitespace-pre-line font-sans text-lg font-semibold leading-8 text-on-surface">{step.description.trim()}</p>}
          {step.image && <img src={step.image} alt={`Step ${stepNumber}`} className="mt-5 max-h-[32rem] w-full rounded-2xl object-cover" referrerPolicy="no-referrer" />}
        </div>
      </li>;
    })}</ol></section>}

    {moreRecipes.length > 0 && <section><h2 className="font-display text-3xl font-bold text-primary">More Recipes from this Chef</h2><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{moreRecipes.map(item => <PublicRecipeCard key={item.id} recipe={item} />)}</div></section>}

    {moreChefs.length > 0 && <section><div className="flex items-center gap-3"><UsersRound className="h-6 w-6 text-secondary" /><h2 className="font-display text-3xl font-bold text-primary">Discover More Chefs</h2></div><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{moreChefs.map(profile => <PublicChefCard key={profile.username} chef={profile} />)}</div></section>}

    <section className="rounded-3xl bg-primary px-6 py-10 text-on-primary sm:px-10"><h2 className="max-w-3xl font-display text-4xl font-bold">Join thousands of professional chefs building their culinary portfolio on MiseChef.</h2><div className="mt-6 flex flex-wrap gap-3"><a href="/login" className="rounded-full bg-secondary px-5 py-3 font-sans text-sm font-extrabold text-on-secondary">Create Free Account</a><a href="/chefs" className="rounded-full border border-on-primary/25 px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Explore Chefs</a></div></section>
  </div>;
}
