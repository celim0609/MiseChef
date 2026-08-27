import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Recipe } from '../../types';
import PublicHomePage from '../../modules/public/PublicHomePage';
import { createPublicHomeDiscoverItems } from '../../modules/public/publicDiscoverModel';
import DiscoverCarousel from './DiscoverCarousel';
import {
  DISCOVER_AUTOPLAY_MS,
  DISCOVER_TRANSITION_MS,
  createRecipeLibraryDiscoverItems,
  getDiscoverDisplayLabel,
  getDiscoverSwipeDirection,
  getNextDiscoverIndex,
  getPreviousDiscoverIndex,
  shouldAutoPlayDiscover,
  type DiscoverContentType,
  type DiscoverItem
} from './discoverModel';

const componentSource = readFileSync(new URL('./DiscoverCarousel.tsx', import.meta.url), 'utf8');
const searchSource = readFileSync(new URL('../SearchTab.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
const publicHomeSource = readFileSync(new URL('../../modules/public/PublicHomePage.tsx', import.meta.url), 'utf8');
const publicRecipeServiceSource = readFileSync(new URL('../../modules/public/services/publicRecipeService.ts', import.meta.url), 'utf8');

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'recipe-1',
  title: 'Truffle Kombu Angel Hair',
  coverImage: 'https://images.example.com/recipe.jpg',
  category: 'Pasta',
  prepTime: 20,
  servings: 2,
  yield: '2 portions',
  difficulty: 'Medium',
  story: '',
  ingredients: [],
  method: [],
  videoLink: '',
  chefName: 'MiseChef',
  isSaved: false,
  collections: [],
  createdAt: '2026-08-24T10:00:00.000Z',
  ...overrides
});

const item = (overrides: Partial<DiscoverItem> = {}): DiscoverItem => ({
  id: 'discover-1',
  type: 'new-recipe',
  label: 'New',
  disclosure: 'organic',
  title: 'Truffle Kombu Angel Hair',
  description: 'Pasta · 20 min prep',
  ctaLabel: 'View Recipe',
  destination: { kind: 'recipe', recipeId: 'recipe-1' },
  imageUrl: 'https://images.example.com/recipe.jpg',
  imageAlt: 'Truffle Kombu Angel Hair',
  ...overrides
});

test('V1 models every requested discovery content type without paid promotion', () => {
  const supportedTypes: DiscoverContentType[] = [
    'new-recipe',
    'featured-recipe',
    'featured-store',
    'featured-product',
    'announcement'
  ];
  assert.equal(new Set(supportedTypes).size, 5);
  assert.equal(getDiscoverDisplayLabel(item()), 'New');
  assert.equal(getDiscoverDisplayLabel(item({ disclosure: 'sponsored' })), 'Sponsored');
  assert.doesNotMatch(JSON.stringify(createRecipeLibraryDiscoverItems([])), /Sponsored/);
});

test('Recipe Library content reuses the newest and featured recipes plus a controlled announcement', () => {
  const items = createRecipeLibraryDiscoverItems([
    recipe({ id: 'older-featured', title: 'Featured Sambal', isFeatured: true, createdAt: '2026-08-22T10:00:00.000Z' }),
    recipe({ id: 'latest', title: 'Newest Recipe', createdAt: '2026-08-24T10:00:00.000Z' })
  ]);
  assert.deepEqual(items.map(entry => entry.type), ['new-recipe', 'featured-recipe', 'announcement']);
  assert.deepEqual(items.map(entry => entry.title), [
    'Newest Recipe',
    'Featured Sambal',
    'Explore recipes from the MiseChef community'
  ]);
  assert.deepEqual(items[0].destination, { kind: 'recipe', recipeId: 'latest' });
  assert.deepEqual(items[2].destination, { kind: 'href', href: '/recipes' });
});

test('infinite navigation, swipe threshold, and autoplay policy are deterministic', () => {
  assert.equal(DISCOVER_AUTOPLAY_MS, 9_000);
  assert.equal(DISCOVER_TRANSITION_MS, 520);
  assert.equal(getNextDiscoverIndex(2, 3), 0);
  assert.equal(getPreviousDiscoverIndex(0, 3), 2);
  assert.equal(getDiscoverSwipeDirection(200, 130), 1);
  assert.equal(getDiscoverSwipeDirection(100, 155), -1);
  assert.equal(getDiscoverSwipeDirection(100, 125), 0);
  assert.equal(shouldAutoPlayDiscover({ itemCount: 3, prefersReducedMotion: false, isInteracting: false }), true);
  assert.equal(shouldAutoPlayDiscover({ itemCount: 3, prefersReducedMotion: true, isInteracting: false }), false);
  assert.equal(shouldAutoPlayDiscover({ itemCount: 3, prefersReducedMotion: false, isInteracting: true }), false);
});

test('carousel markup is stable, accessible, and keyboard navigable', () => {
  const markup = renderToStaticMarkup(<DiscoverCarousel items={[item(), item({ id: 'discover-2' })]} />);
  assert.match(markup, /aria-roledescription="carousel"/);
  assert.match(markup, /h-\[292px\]/);
  assert.match(markup, /alt="Truffle Kombu Angel Hair"/);
  assert.match(markup, /loading="lazy"/);
  assert.match(markup, /Previous Discover item/);
  assert.match(markup, /Next Discover item/);
  assert.match(markup, /Show Discover item 1 of 2/);
  assert.match(markup, /View Recipe →/);
  assert.match(markup, /hidden w-\[42%\] sm:block/);
  assert.match(markup, /bg-surface-container-low/);
  assert.match(markup, /text-on-surface-variant/);
  assert.match(markup, /Pause Discover carousel/);
});

test('motion pauses during interaction, resumes via cleaned timers, and respects reduced motion', () => {
  assert.match(componentSource, /isHovering \|\| hasFocusWithin \|\| isPointerActive \|\| isPaused/);
  assert.match(componentSource, /window\.setTimeout\(moveNext, autoplayMs\)/);
  assert.match(componentSource, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(componentSource, /prefers-reduced-motion: reduce/);
  assert.match(componentSource, /mediaQuery\.removeEventListener\('change', updatePreference\)/);
  assert.match(componentSource, /onPointerUp=\{finishPointerGesture\}/);
  assert.match(stylesSource, /animation-duration: 520ms/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Recipe Library contains exactly one Discover carousel before Categories', () => {
  assert.equal(searchSource.split('<DiscoverCarousel').length - 1, 1);
  assert.ok(searchSource.indexOf('<DiscoverCarousel') < searchSource.indexOf('<section className="bg-surface-container-low'));
  assert.match(searchSource, /createRecipeLibraryDiscoverItems\(recipes\)/);
  assert.match(searchSource, /onSelectRecipe\(recipe\)/);
});

test('public Discover uses only public recipe projections and minimal public Store fields', () => {
  const storeSummary = {
    slug: 'public-store',
    name: 'Public Store',
    description: 'Breakfast and drinks.',
    imageUrl: 'https://images.example.com/store.jpg',
    products: [
      { id: 'available', name: 'Kopi', description: 'Fresh coffee.', imageUrl: 'https://images.example.com/kopi.jpg' }
    ]
  };
  const items = createPublicHomeDiscoverItems([
    recipe({ id: 'public-new', title: 'Public New', visibility: 'public' }),
    recipe({ id: 'public-featured', title: 'Public Featured', visibility: 'public', isFeatured: true, createdAt: '2026-08-23T10:00:00.000Z' }),
    recipe({ id: 'private', title: 'Private Recipe', visibility: 'private', chefName: 'Private Owner' })
  ], [storeSummary]);

  assert.deepEqual(items.map(entry => entry.type), ['new-recipe', 'featured-recipe', 'featured-store', 'featured-product', 'announcement']);
  assert.doesNotMatch(JSON.stringify(items), /Private Recipe|Private Owner/);
  assert.ok(items.every(entry => entry.destination.kind === 'href' && !entry.destination.href.startsWith('/app')));
  assert.match(publicRecipeServiceSource, /collection\(db, 'publicRecipes'\)/);
});

test('public homepage keeps one hero carousel before promotions, categories, and recipe discovery', () => {
  const discoverIndex = publicHomeSource.indexOf('<DiscoverCarousel');
  const promotionIndex = publicHomeSource.indexOf('<HomepagePromotionCarousel');
  const categoryIndex = publicHomeSource.indexOf('id="category-shortcuts-title"');
  const popularIndex = publicHomeSource.indexOf('id="popular-recipes-title"');
  assert.ok(discoverIndex >= 0 && discoverIndex < promotionIndex && promotionIndex < categoryIndex && categoryIndex < popularIndex);
  assert.equal(publicHomeSource.split('<DiscoverCarousel').length - 1, 1);

  const markup = renderToStaticMarkup(
    <PublicHomePage
      publicRecipes={[recipe({ visibility: 'public' })]}
      publicChefs={[]}
      publicDiscoverStores={[]}
      promotions={[]}
    />
  );
  assert.match(markup, /aria-label="MiseChef featured stories"/);
  assert.match(markup, /Made for the way food moves/);
  assert.match(markup, /Find your next favourite/);
  assert.match(markup, /Popular &amp; newly discovered/);
  assert.doesNotMatch(markup, /Private Recipe/);
});
