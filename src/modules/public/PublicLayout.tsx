import { useMemo, type ReactNode } from 'react';
import { ChefHat, Search, Utensils } from 'lucide-react';
import BrandLogo from '../../components/BrandLogo';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import { resolvePublicRoute, toPublicSlug } from './publicRoutes';

interface PublicLayoutProps {
  pathname: string;
  recipes: Recipe[];
}

const publicNavigation = [
  { label: 'Home', href: '/' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Chefs', href: '/chefs' },
  { label: 'Login', href: '/login' }
];

const EmptyPublicState = ({ title, message, icon }: { title: string; message: string; icon: ReactNode }) => (
  <section className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-12 text-center">
    <span className="mx-auto inline-flex rounded-full bg-primary/10 p-3 text-primary">{icon}</span>
    <h2 className="mt-4 font-display text-2xl font-semibold text-primary">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{message}</p>
  </section>
);

export default function PublicLayout({ pathname, recipes }: PublicLayoutProps) {
  const route = resolvePublicRoute(pathname) || { page: 'home' as const };
  const publicRecipes = useMemo(() => recipes.filter(recipe => recipe.visibility === 'public'), [recipes]);
  const publicChefs = useMemo(() => Array.from(new Map(
    publicRecipes
      .filter(recipe => recipe.chefName)
      .map(recipe => [toPublicSlug(recipe.chefName), { username: toPublicSlug(recipe.chefName), name: recipe.chefName, avatar: recipe.chefAvatar }])
  ).values()), [publicRecipes]);

  const renderPage = () => {
    if (route.page === 'home') {
      return (
        <section className="rounded-3xl border border-surface-container-high bg-surface-container-low px-6 py-12 shadow-sm sm:px-10 sm:py-16">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Public MiseChef</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold tracking-tight text-primary sm:text-6xl">Discover recipes and the chefs behind them.</h1>
          <p className="mt-5 max-w-2xl font-sans text-base font-bold leading-relaxed text-on-surface-variant">The public platform foundation is ready for recipe and chef discovery.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="/recipes" className="rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Browse Recipes</a>
            <a href="/chefs" className="rounded-full border border-primary/20 bg-background px-5 py-3 font-sans text-sm font-extrabold text-primary">Discover Chefs</a>
          </div>
        </section>
      );
    }

    if (route.page === 'recipes') {
      return (
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Public recipes</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary">Recipes</h1>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Only recipes shared publicly appear here.</p>
          {publicRecipes.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicRecipes.map(recipe => (
                <a key={recipe.id} href={`/recipes/${toPublicSlug(recipe.title) || recipe.id}`} className="overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm">
                  <img src={recipe.coverImage} alt={recipe.title} className="h-44 w-full object-cover" referrerPolicy="no-referrer" />
                  <div className="p-5">
                    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-secondary">{getRecipeCategories(recipe).join(', ')}</p>
                    <h2 className="mt-2 font-display text-xl font-semibold text-primary">{recipe.title}</h2>
                    <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">By {recipe.chefName || 'MiseChef'}</p>
                  </div>
                </a>
              ))}
            </div>
          ) : <div className="mt-6"><EmptyPublicState title="No public recipes yet" message="Recipes marked public will appear here. Private and workspace recipes remain hidden." icon={<Utensils className="h-5 w-5" />} /></div>}
        </div>
      );
    }

    if (route.page === 'recipe') {
      const recipe = publicRecipes.find(item => toPublicSlug(item.title) === route.slug || item.id === route.slug);
      return recipe ? (
        <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm">
          <img src={recipe.coverImage} alt={recipe.title} className="max-h-96 w-full object-cover" referrerPolicy="no-referrer" />
          <div className="p-6 sm:p-8">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Public recipe</p>
            <h1 className="mt-3 font-display text-4xl font-bold text-primary">{recipe.title}</h1>
            <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">By {recipe.chefName || 'MiseChef'}</p>
            <p className="mt-6 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{recipe.story}</p>
          </div>
        </article>
      ) : <EmptyPublicState title="Recipe not available" message="This recipe is not public or could not be found." icon={<Search className="h-5 w-5" />} />;
    }

    if (route.page === 'chefs') {
      return (
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Chef discovery</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary">Chefs</h1>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Discover chefs through their publicly shared recipes.</p>
          {publicChefs.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicChefs.map(chef => (
                <a key={chef.username} href={`/chef/${chef.username}`} className="flex items-center gap-4 rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
                  {chef.avatar ? <img src={chef.avatar} alt="" className="h-14 w-14 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><ChefHat className="h-6 w-6" /></span>}
                  <h2 className="font-display text-xl font-semibold text-primary">{chef.name}</h2>
                </a>
              ))}
            </div>
          ) : <div className="mt-6"><EmptyPublicState title="No public chefs yet" message="Chef profiles will appear when they have publicly shared recipes." icon={<ChefHat className="h-5 w-5" />} /></div>}
        </div>
      );
    }

    const chef = publicChefs.find(item => item.username === route.username);
    const chefRecipes = chef ? publicRecipes.filter(recipe => toPublicSlug(recipe.chefName) === chef.username) : [];
    return chef ? (
      <div>
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Public chef</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-primary">{chef.name}</h1>
        <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Public chef profile foundation · {chefRecipes.length} public recipe{chefRecipes.length === 1 ? '' : 's'}</p>
      </div>
    ) : <EmptyPublicState title="Chef not available" message="This public chef profile could not be found." icon={<ChefHat className="h-5 w-5" />} />;
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-50 border-b border-surface-container-high bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="MiseChef public home">
            <BrandLogo className="h-8 w-auto" />
            <div>
              <p className="font-display text-2xl font-bold italic text-primary">MiseChef</p>
              <p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.18em] text-outline">Recipes and chefs</p>
            </div>
          </a>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Public navigation">
            {publicNavigation.map(item => (
              <a key={item.href} href={item.href} className={`rounded-full px-4 py-2 font-sans text-xs font-extrabold ${item.label === 'Login' ? 'bg-primary text-on-primary' : 'text-primary hover:bg-surface-container'}`}>{item.label}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{renderPage()}</main>
    </div>
  );
}
