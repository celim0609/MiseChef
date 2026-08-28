import { useMemo, type Key } from 'react';
import { ArrowRight, ChefHat, Clock3, Search, Sparkles, Utensils } from 'lucide-react';
import { DiscoverCarousel } from '../../components/discover';
import type { Recipe } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import { PublicChefCard, PublicSectionState, type PublicChefSummary, type PublicSectionStatus } from './PublicContent';
import { HomepagePromotionCarousel } from './HomepageCarousels';
import { DEFAULT_HOMEPAGE_PROMOTIONS, type HomepagePromotion } from './homepagePromotions';
import { createPublicHomeDiscoverItems, type PublicDiscoverStoreSummary } from './publicDiscoverModel';
import { toPublicSlug } from './publicRoutes';
import { safePublicDisplayName } from './publicRecipeAuthor';

interface PublicHomePageProps {
  publicRecipes: Recipe[];
  publicChefs: PublicChefSummary[];
  publicDiscoverStores: PublicDiscoverStoreSummary[];
  promotions: HomepagePromotion[];
  status?: PublicSectionStatus;
}

const SectionHeading = ({ id, eyebrow, title, description, link, linkLabel }: { id?: string; eyebrow?: string; title: string; description: string; link?: string; linkLabel?: string }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-secondary">{eyebrow}</p>}
      <h2 id={id} className="mt-1 font-display text-3xl font-bold text-primary sm:text-4xl">{title}</h2>
      <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">{description}</p>
    </div>
    {link && linkLabel && <a href={link} className="inline-flex items-center gap-1 font-sans text-sm font-extrabold text-secondary transition hover:text-primary">{linkLabel}<ArrowRight className="h-4 w-4" /></a>}
  </div>
);

const RecipeRailCard = ({ recipe }: { recipe: Recipe; key?: Key }) => (
  <a href={`/recipes/${toPublicSlug(recipe.title) || recipe.id}`} className="homepage-recipe-card group">
    <div className="relative h-52 overflow-hidden bg-surface-container-low sm:h-56">
      {recipe.coverImage || recipe.imageUrl ? (
        <img src={recipe.coverImage || recipe.imageUrl} alt={recipe.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
      ) : (
        <span className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/15 text-primary"><Utensils className="h-8 w-8" /></span>
      )}
      {recipe.isFeatured && <span className="absolute left-4 top-4 rounded-full bg-[#f39a42] px-3 py-1 font-sans text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#172b20]">Popular</span>}
    </div>
    <div className="flex min-w-0 flex-1 flex-col justify-center p-5 sm:p-6">
      <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-secondary">{getRecipeCategories(recipe).slice(0, 2).join(' · ') || 'Recipe'}</p>
      <h3 className="mt-2 line-clamp-2 font-display text-2xl font-bold leading-tight text-primary sm:text-3xl">{recipe.title}</h3>
      <p className="mt-3 font-sans text-xs font-bold text-on-surface-variant">By {safePublicDisplayName(recipe.publicDisplayName || recipe.chefName) || 'MiseChef'}</p>
      <span className="mt-4 inline-flex items-center gap-1 font-sans text-xs font-extrabold text-secondary">View recipe <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
    </div>
  </a>
);

export default function PublicHomePage({ publicRecipes, publicChefs, publicDiscoverStores, promotions, status = 'ready' }: PublicHomePageProps) {
  const featuredRecipes = [...publicRecipes].sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))).slice(0, 8);
  const featuredChefs = publicChefs.slice(0, 4);
  const discoverItems = useMemo(
    () => createPublicHomeDiscoverItems(publicRecipes, publicDiscoverStores),
    [publicDiscoverStores, publicRecipes]
  );
  const categories = useMemo(() => Array.from(new Set(publicRecipes.flatMap(getRecipeCategories))).filter(Boolean).slice(0, 8), [publicRecipes]);
  const promotionItems = useMemo(() => {
    if (promotions.length > 0) return promotions;
    const featuredStore = publicDiscoverStores[0];
    const featuredProduct = featuredStore?.products[0];
    return DEFAULT_HOMEPAGE_PROMOTIONS.map(promotion => {
      if (promotion.id === 'featured-store' && featuredStore) return { ...promotion, title: featuredStore.name, description: featuredStore.description || promotion.description, href: `/store/${encodeURIComponent(featuredStore.slug)}`, imageUrl: featuredStore.imageUrl };
      if (promotion.id === 'sets' && featuredStore) return { ...promotion, href: `/store/${encodeURIComponent(featuredStore.slug)}`, imageUrl: featuredProduct?.imageUrl || featuredStore.imageUrl };
      return promotion;
    });
  }, [promotions, publicDiscoverStores]);

  return (
    <div className="space-y-16 pb-8 sm:space-y-20">
      <section className="homepage-section-enter" aria-labelledby="homepage-hero-title">
        <div className="sr-only"><h1 id="homepage-hero-title">MiseChef culinary discovery</h1></div>
        <DiscoverCarousel items={discoverItems} ariaLabel="MiseChef featured stories" autoplayMs={5_200} variant="hero" />
      </section>

      <HomepagePromotionCarousel promotions={promotionItems} />

      <section className="homepage-section-enter" aria-labelledby="category-shortcuts-title">
        <SectionHeading id="category-shortcuts-title" eyebrow="Browse the pantry" title="Find your next favourite" description="Jump into the flavours and formats MiseChef cooks are sharing." />
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(categories.length ? categories : ['Breakfast', 'Baking', 'Main Course', 'Dessert', 'Drinks', 'Vegetarian']).map((category, index) => (
            <a key={category} href="/recipes" className="group flex min-w-36 flex-1 items-center gap-3 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md active:scale-[0.98]">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index % 3 === 0 ? 'bg-primary text-on-primary' : index % 3 === 1 ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'}`}>{index % 2 === 0 ? <Utensils className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}</span>
              <span className="whitespace-nowrap font-sans text-xs font-extrabold text-primary">{category}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="homepage-section-enter" aria-labelledby="popular-recipes-title">
        <SectionHeading id="popular-recipes-title" eyebrow="From the community" title="Popular & newly discovered" description="Food-first stories from chefs building their craft on MiseChef." link="/recipes" linkLabel="View all recipes" />
        <PublicSectionState status={status} isEmpty={featuredRecipes.length === 0} emptyTitle="No public recipes yet" emptyMessage="Public recipes will appear here when they are available.">
          <div className="homepage-recipe-rail" aria-label="Popular and newly discovered recipes">
            {featuredRecipes.map(recipe => <RecipeRailCard key={recipe.id} recipe={recipe} />)}
          </div>
        </PublicSectionState>
      </section>

      <section className="homepage-section-enter">
        <SectionHeading eyebrow="People behind the food" title="Chefs to know" description="Meet the makers, ideas and experience behind each plate." link="/chefs" linkLabel="View all chefs" />
        <PublicSectionState status={status} isEmpty={featuredChefs.length === 0} emptyTitle="No featured chefs yet" emptyMessage="Public chef profiles will appear when they are available.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featuredChefs.map(chef => <PublicChefCard key={chef.username} chef={chef} />)}</div>
        </PublicSectionState>
      </section>

      <section className="homepage-section-enter overflow-hidden rounded-[2rem] bg-[#203b2a] px-6 py-10 text-white shadow-sm sm:px-10 sm:py-12 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.22em] text-[#f7a24b]">Your culinary home</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight text-white sm:text-5xl">Keep the craft. Share the story. Grow what comes next.</h2>
            <p className="mt-4 max-w-2xl font-sans text-sm font-bold leading-relaxed text-white/75">Create a professional home for your recipes, kitchen knowledge and food business.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/login" className="inline-flex items-center gap-2 rounded-full bg-[#f39a42] px-5 py-3 font-sans text-sm font-extrabold text-[#172b20] transition hover:bg-[#ffad5d] active:scale-95"><ChefHat className="h-4 w-4" />Create Free Account</a>
            <a href="/recipes" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 font-sans text-sm font-extrabold text-white transition hover:bg-white/10 active:scale-95"><Search className="h-4 w-4" />Explore Recipes</a>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/15 pt-5 font-sans text-[11px] font-bold text-white/65"><span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#f7a24b]" />Built for daily kitchen rhythm</span><span>Light and Night Mode ready</span><span>Made for mobile</span></div>
      </section>
    </div>
  );
}
