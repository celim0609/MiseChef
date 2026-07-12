import { Search } from 'lucide-react';
import type { Recipe } from '../../types';
import { PublicChefCard, PublicRecipeCard, PublicSectionState, type PublicChefSummary, type PublicSectionStatus } from './PublicContent';

interface PublicHomePageProps {
  publicRecipes: Recipe[];
  publicChefs: PublicChefSummary[];
  status?: PublicSectionStatus;
}

const SectionHeading = ({ title, description, link, linkLabel }: { title: string; description: string; link?: string; linkLabel?: string }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 className="font-display text-3xl font-bold text-primary">{title}</h2>
      <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">{description}</p>
    </div>
    {link && linkLabel && <a href={link} className="font-sans text-sm font-extrabold text-secondary hover:text-primary">{linkLabel}</a>}
  </div>
);

export default function PublicHomePage({ publicRecipes, publicChefs, status = 'ready' }: PublicHomePageProps) {
  const featuredRecipes = [...publicRecipes].sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))).slice(0, 4);
  const trendingRecipes = [...publicRecipes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4);
  const featuredChefs = publicChefs.slice(0, 4);

  return (
    <div className="space-y-20 pb-6">
      <section className="overflow-hidden rounded-3xl bg-primary px-6 py-12 text-on-primary shadow-sm sm:px-10 sm:py-16 lg:px-14">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.24em] text-secondary-container">MISECHEF</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold tracking-tight sm:text-6xl">Discover recipes from chefs worth following.</h1>
        <p className="mt-5 max-w-2xl font-sans text-base font-bold leading-relaxed text-on-primary/75">Explore original recipes, discover professional chefs, and find the people behind the food.</p>
        <form action="/recipes" method="get" className="mt-8 flex max-w-2xl items-center gap-3 rounded-full bg-background p-2 shadow-lg">
          <Search className="ml-3 h-5 w-5 shrink-0 text-outline" />
          <input name="q" type="search" placeholder="Search recipes or chefs" className="min-w-0 flex-1 bg-transparent px-1 py-2 font-sans text-sm font-bold text-on-surface outline-none placeholder:text-outline" />
          <button type="submit" className="rounded-full bg-secondary px-5 py-3 font-sans text-xs font-extrabold text-on-secondary">Search</button>
        </form>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/recipes" className="rounded-full bg-secondary px-5 py-3 font-sans text-sm font-extrabold text-on-secondary">Explore Recipes</a>
          <a href="/chefs" className="rounded-full border border-on-primary/25 px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Meet Chefs</a>
        </div>
      </section>

      <section>
        <SectionHeading title="Featured Recipes" description="Selected recipes from the MiseChef community." link="/recipes" linkLabel="View all recipes" />
        <PublicSectionState status={status} isEmpty={featuredRecipes.length === 0} emptyTitle="No featured recipes yet" emptyMessage="Public recipes will appear here when they are available.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featuredRecipes.map(recipe => <PublicRecipeCard key={recipe.id} recipe={recipe} />)}</div>
        </PublicSectionState>
      </section>

      <section>
        <SectionHeading title="Featured Chefs" description="Meet the chefs behind the recipes." link="/chefs" linkLabel="View all chefs" />
        <PublicSectionState status={status} isEmpty={featuredChefs.length === 0} emptyTitle="No featured chefs yet" emptyMessage="Public chef profiles will appear here when available.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featuredChefs.map(chef => <PublicChefCard key={chef.username} chef={chef} />)}</div>
        </PublicSectionState>
      </section>

      <section>
        <SectionHeading title="Trending Recipes" description="Recipes getting attention from the community." />
        <PublicSectionState status={status} isEmpty={trendingRecipes.length === 0} emptyTitle="No trending recipes yet" emptyMessage="Recently published recipes will appear here.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{trendingRecipes.map(recipe => <PublicRecipeCard key={recipe.id} recipe={recipe} />)}</div>
        </PublicSectionState>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-surface-container-high bg-surface-container-low p-7 sm:p-9">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">For Chefs</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-primary">Build your professional chef profile.</h2>
          <p className="mt-4 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Showcase your recipes, portfolio, experience, and make it easier for restaurants and brands to discover you.</p>
          <a href="/login" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Create Your Chef Profile</a>
        </div>
        <div className="rounded-3xl border border-surface-container-high bg-background p-7 shadow-sm sm:p-9">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">For Restaurants</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-primary">Run your kitchen with MiseChef.</h2>
          <p className="mt-4 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Manage recipes, costing, ingredients, suppliers, invoices, and your team in one workspace.</p>
          <a href="/pricing" className="mt-6 inline-flex rounded-full border border-primary/20 px-5 py-3 font-sans text-sm font-extrabold text-primary">Explore Workspace Plans</a>
        </div>
      </section>
    </div>
  );
}
