import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChefHat, Moon, Search, Sun } from 'lucide-react';
import type { User } from 'firebase/auth';
import BrandLogo from '../../components/BrandLogo';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import PublicHomePage from './PublicHomePage';
import { PublicChefCard, PublicSectionState, type PublicChefSummary, type PublicSectionStatus } from './PublicContent';
import { resolvePublicRoute, toPublicSlug } from './publicRoutes';
import {
  resolveLoggedOutPublicAccountLink,
  resolvePublicHostMenuAction,
  resolvePublicHostStoreCandidate,
  type PublicHostLookup
} from './hostReturnNavigation';
import { publicChefProfileService, publicDiscoverService, publicRecipeService } from './services';
import type { PublicDiscoverStoreSummary } from './publicDiscoverModel';
import PublicChefProfilePage from './PublicChefProfilePage';
import PublicRecipeDiscoveryPage from './PublicRecipeDiscoveryPage';
import { HostProgramPage, PublicGroupOrderPage, PublicStorePage } from '../store';
import { HomepageAnnouncementCarousel } from './HomepageCarousels';
import type { HomepagePromotion } from './homepagePromotions';
import { resolvePublicRecipeAuthors } from './publicRecipeAuthor';
import { groupOrderService } from '../store/services';
import PublicAccountMenu from './PublicAccountMenu';
import PublicOrdersPage from './PublicOrdersPage';

const publicNavigation = [
  { label: 'Home', href: '/' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Chefs', href: '/chefs' }
];

const EmptyPublicState = ({ title, message, icon }: { title: string; message: string; icon: ReactNode }) => (
  <section className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-12 text-center">
    <span className="mx-auto inline-flex rounded-full bg-primary/10 p-3 text-primary">{icon}</span>
    <h2 className="mt-4 font-display text-2xl font-semibold text-primary">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{message}</p>
  </section>
);

export default function PublicLayout({ pathname, currentUser, onSignOut }: { pathname: string; currentUser: User | null; onSignOut: () => Promise<void> }) {
  const route = resolvePublicRoute(pathname) || { page: 'home' as const };
  const [publicRecipes, setPublicRecipes] = useState<Recipe[]>([]);
  const [publicChefs, setPublicChefs] = useState<PublicChefSummary[]>([]);
  const [publicDiscoverStores, setPublicDiscoverStores] = useState<PublicDiscoverStoreSummary[]>([]);
  const [homepagePromotions, setHomepagePromotions] = useState<HomepagePromotion[]>([]);
  const [chefSearch, setChefSearch] = useState('');
  const [recipeStatus, setRecipeStatus] = useState<PublicSectionStatus>('loading');
  const [groupStoreSlug, setGroupStoreSlug] = useState('');
  const [hostLookup, setHostLookup] = useState<PublicHostLookup>({ status: 'unavailable', storeSlug: '', userId: '' });
  const [isNightMode, setIsNightMode] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.appearance === 'dark');

  const routeStoreSlug = route.page === 'store' || route.page === 'host' ? route.slug : '';
  const hostStoreCandidate = resolvePublicHostStoreCandidate(
    routeStoreSlug,
    route.page === 'group' ? groupStoreSlug : '',
    route.page === 'group' ? [] : publicDiscoverStores.map(store => store.slug)
  );
  const hostAction = resolvePublicHostMenuAction(hostLookup, hostStoreCandidate, currentUser?.uid || '');
  const loggedOutAccountLink = resolveLoggedOutPublicAccountLink(route.page === 'host' ? route.slug : '');

  const toggleAppearance = () => {
    const nextMode = isNightMode ? 'light' : 'dark';
    document.documentElement.dataset.appearance = nextMode;
    localStorage.setItem('ce_lims_kitchen_appearance_v1', nextMode);
    setIsNightMode(!isNightMode);
  };

  useEffect(() => {
    let isCancelled = false;
    setRecipeStatus('loading');

    publicRecipeService.listPublicRecipes()
      .then(recipes => {
        if (isCancelled) return;
        setPublicRecipes(recipes);
        setRecipeStatus('ready');
      })
      .catch(() => {
        if (isCancelled) return;
        setPublicRecipes([]);
        setRecipeStatus('error');
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    if (!currentUser || !hostStoreCandidate) {
      setHostLookup({ status: 'unavailable', storeSlug: '', userId: currentUser?.uid || '' });
      return;
    }

    setHostLookup({ status: 'loading', storeSlug: hostStoreCandidate, userId: currentUser.uid });

    groupOrderService.listMine(hostStoreCandidate)
      .then(result => {
        if (!isCancelled) setHostLookup({
          status: result.hostActive ? 'host' : 'non-host',
          storeSlug: hostStoreCandidate,
          userId: currentUser.uid
        });
      })
      .catch(() => {
        if (!isCancelled) setHostLookup({ status: 'unknown', storeSlug: hostStoreCandidate, userId: currentUser.uid });
      });

    return () => { isCancelled = true; };
  }, [currentUser?.uid, hostStoreCandidate]);

  useEffect(() => {
    let isCancelled = false;
    publicDiscoverService.getHomepageContent()
      .then(content => {
        if (!isCancelled) {
          setPublicDiscoverStores(content.stores);
          setHomepagePromotions(content.promotions);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setPublicDiscoverStores([]);
          setHomepagePromotions([]);
        }
      });
    return () => { isCancelled = true; };
  }, []);

  const filteredPublicChefs = useMemo(() => {
    const searchTerm = chefSearch.trim().toLowerCase();
    if (!searchTerm) return publicChefs;

    return publicChefs.filter(chef => [
      chef.name,
      chef.professionalTitle,
      chef.country,
      ...chef.skills
    ].filter(Boolean).join(' ').toLowerCase().includes(searchTerm));
  }, [chefSearch, publicChefs]);

  const resolvedPublicRecipes = useMemo(
    () => resolvePublicRecipeAuthors(publicRecipes, publicChefs),
    [publicChefs, publicRecipes]
  );

  useEffect(() => {
    let isCancelled = false;
    publicChefProfileService.listPublicProfiles()
      .then(profiles => {
        if (!isCancelled) setPublicChefs(profiles);
      })
      .catch(() => {
        if (!isCancelled) setPublicChefs([]);
      });
    return () => { isCancelled = true; };
  }, []);

  const renderPage = () => {
    if (route.page === 'home') {
      return <PublicHomePage publicRecipes={resolvedPublicRecipes} publicChefs={publicChefs} publicDiscoverStores={publicDiscoverStores} promotions={homepagePromotions} status={recipeStatus} />;
    }

    if (route.page === 'recipes') {
      return (
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Public recipes</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary">Recipes</h1>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Only recipes shared publicly appear here.</p>
          <div className="mt-6">
            <PublicSectionState status={recipeStatus} isEmpty={resolvedPublicRecipes.length === 0} emptyTitle="No public recipes yet" emptyMessage="Recipes marked public will appear here. Private and workspace recipes remain hidden.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {resolvedPublicRecipes.map(recipe => (
                <a key={recipe.id} href={`/recipes/${toPublicSlug(recipe.title) || recipe.id}`} className="overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm">
                  <img src={recipe.coverImage} alt={recipe.title} className="h-44 w-full object-cover" referrerPolicy="no-referrer" />
                  <div className="p-5">
                    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-secondary">{getRecipeCategories(recipe).join(', ')}</p>
                    <h2 className="mt-2 font-display text-xl font-semibold text-primary">{recipe.title}</h2>
                    <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">By {recipe.publicDisplayName || 'MiseChef'}</p>
                  </div>
                </a>
              ))}
              </div>
            </PublicSectionState>
          </div>
        </div>
      );
    }

    if (route.page === 'recipe') {
      if (recipeStatus === 'loading') {
        return <div className="h-80 animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading public recipe" />;
      }
      if (recipeStatus === 'error') {
        return <EmptyPublicState title="Recipe temporarily unavailable" message="This public recipe could not be loaded. Please try again later." icon={<Search className="h-5 w-5" />} />;
      }
      const recipe = resolvedPublicRecipes.find(item => toPublicSlug(item.title) === route.slug || item.id === route.slug);
      return recipe ? <PublicRecipeDiscoveryPage recipe={recipe} publicRecipes={resolvedPublicRecipes} publicChefs={publicChefs} /> : <EmptyPublicState title="Recipe not available" message="This recipe is not public or could not be found." icon={<Search className="h-5 w-5" />} />;
    }

    if (route.page === 'store') {
      return <PublicStorePage slug={route.slug} currentUser={currentUser} />;
    }

    if (route.page === 'orders') {
      return <PublicOrdersPage currentUser={currentUser} />;
    }

    if (route.page === 'host') {
      return <HostProgramPage slug={route.slug} currentUser={currentUser} />;
    }

    if (route.page === 'group') {
      return <PublicGroupOrderPage shareCode={route.shareCode} onStoreResolved={setGroupStoreSlug} />;
    }

    if (route.page === 'chefs') {
      return (
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Chef discovery</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary">Chefs</h1>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Discover chefs through their publicly shared recipes.</p>
          <label className="relative mt-6 block w-full">
            <span className="sr-only">Search chefs</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
            <input type="search" value={chefSearch} onChange={event => setChefSearch(event.target.value)} placeholder="Search chefs..." className="w-full rounded-2xl border border-surface-container-high bg-background py-4 pl-12 pr-4 font-sans text-sm font-bold text-on-surface outline-none transition focus:border-primary" />
          </label>
          {filteredPublicChefs.length > 0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredPublicChefs.map(chef => <PublicChefCard key={chef.username} chef={chef} />)}</div>
          ) : chefSearch.trim() ? (
            <div className="mt-6"><EmptyPublicState title="No chefs found." message="Try searching by name, professional title, skill or country." icon={<Search className="h-5 w-5" />} /></div>
          ) : <div className="mt-6"><EmptyPublicState title="No public chefs yet" message="Chef profiles will appear when they have publicly shared recipes." icon={<ChefHat className="h-5 w-5" />} /></div>}
        </div>
      );
    }

    return <PublicChefProfilePage username={route.username} />;
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {route.page === 'home' && <HomepageAnnouncementCarousel />}
      <header className="sticky top-0 z-50 border-b border-surface-container-high bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="MiseChef public home">
            <BrandLogo className="h-8 w-auto" />
            <div>
              <p className="font-display text-2xl font-bold italic text-primary">MiseChef</p>
              <p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.18em] text-outline">Recipes, chefs, and stores</p>
            </div>
          </a>
          <form action="/recipes" method="get" className="ml-auto hidden max-w-xs flex-1 items-center gap-2 rounded-full border border-surface-container-high bg-surface-container-low px-4 py-2.5 lg:flex">
            <Search className="h-4 w-4 shrink-0 text-outline" aria-hidden="true" />
            <input name="q" type="search" placeholder="Search recipes or chefs" aria-label="Search recipes or chefs" className="min-w-0 flex-1 bg-transparent font-sans text-xs font-bold text-on-surface outline-none placeholder:text-outline" />
          </form>
          <nav className="ml-auto flex items-center gap-1 lg:ml-0" aria-label="Public navigation">
            {publicNavigation.map(item => (
              <a key={item.href} href={item.href} className="hidden rounded-full px-3 py-2 font-sans text-xs font-extrabold text-primary transition hover:bg-surface-container active:scale-95 sm:inline-flex sm:px-4">{item.label}</a>
            ))}
            {currentUser
              ? <PublicAccountMenu hostAction={hostAction} onSignOut={onSignOut} />
              : <a href={loggedOutAccountLink.href} className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 font-sans text-xs font-extrabold text-on-primary transition hover:bg-primary-container active:scale-95 sm:px-4">{loggedOutAccountLink.label}</a>}
            <button type="button" onClick={toggleAppearance} aria-label={isNightMode ? 'Switch to Light Mode' : 'Switch to Night Mode'} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-surface-container-high text-primary transition hover:bg-surface-container active:scale-95">{isNightMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </nav>
        </div>
      </header>
      <main className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${route.page === 'home' ? 'py-6 sm:py-8' : 'py-10'}`}>{renderPage()}</main>
      <footer className="border-t border-surface-container-high bg-surface-container-low">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="font-display text-xl font-bold italic text-primary">MiseChef</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Public footer">
            {[
              { label: 'Recipes', href: '/recipes' },
              { label: 'Chefs', href: '/chefs' },
              { label: 'Pricing', href: '/pricing' },
              ...(!currentUser ? [loggedOutAccountLink] : []),
              { label: 'Contact', href: '/contact' }
            ].map(item => <a key={item.href} href={item.href} className="font-sans text-xs font-extrabold text-on-surface-variant hover:text-primary">{item.label}</a>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}
