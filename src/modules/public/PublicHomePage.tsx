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
        <SectionHeading title="Why MiseChef" description="One place for culinary work to be discovered and shared." />
        <div className="grid gap-5 md:grid-cols-3">
          {[['Discover Original Recipes', 'Explore public recipes shared directly by professional chefs.'], ['Meet the People Behind the Food', 'Move naturally from every recipe to the chef who created it.'], ['Build a Professional Presence', 'Give your recipes, experience and culinary work a home.']].map(([title, description]) => <article key={title} className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm"><h3 className="font-display text-2xl font-bold text-primary">{title}</h3><p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{description}</p></article>)}
        </div>
      </section>

      <section className="rounded-3xl bg-primary px-6 py-10 text-on-primary sm:px-10 sm:py-12">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary-container">Join MiseChef</p>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold">Create your culinary profile and share the work behind your food.</h2>
        <div className="mt-6 flex flex-wrap gap-3"><a href="/login" className="rounded-full bg-secondary px-5 py-3 font-sans text-sm font-extrabold text-on-secondary">Create Free Account</a><a href="/chefs" className="rounded-full border border-on-primary/25 px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Explore Chefs</a></div>
      </section>
    </div>
  );
}
