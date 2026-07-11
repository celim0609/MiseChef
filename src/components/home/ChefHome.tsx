import React, { useMemo } from 'react';
import { Bot, FolderOpen, Heart, Plus, Search, Sparkles } from 'lucide-react';
import type { Recipe, RootTab } from '../../types';
import { getRecipeCategories } from '../../utils/categoryUtils';
import TodaysTasks from './TodaysTasks';

interface ChefHomeProps {
  recipes: Recipe[];
  displayName: string;
  onSelectRecipe: (recipe: Recipe) => void;
  onToggleFavorite: (recipeId: string) => void;
  onCreateRecipe?: () => void;
  onNavigate?: (tab: RootTab) => void;
  workspaceId?: string;
  userId?: string;
}

const recipeTimestamp = (recipe: Recipe) => {
  const value = recipe.recipeCostLastCalculatedAt || recipe.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

function RecipeList({
  title,
  recipes,
  emptyMessage,
  onSelectRecipe,
  onToggleFavorite
}: {
  title: string;
  recipes: Recipe[];
  emptyMessage: string;
  onSelectRecipe: (recipe: Recipe) => void;
  onToggleFavorite: (recipeId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{title}</p>
      <div className="mt-4 space-y-3">
        {recipes.length > 0 ? recipes.map(recipe => (
          <div key={recipe.id} className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low p-3">
            <button type="button" onClick={() => onSelectRecipe(recipe)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <img src={recipe.coverImage} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
              <span className="min-w-0">
                <span className="block truncate font-sans text-sm font-extrabold text-primary">{recipe.title}</span>
                <span className="mt-1 block truncate font-sans text-xs font-bold text-on-surface-variant">{getRecipeCategories(recipe).join(', ')}</span>
              </span>
            </button>
            <button type="button" onClick={() => onToggleFavorite(recipe.id)} aria-label={recipe.isSaved ? `Remove ${recipe.title} from favorites` : `Add ${recipe.title} to favorites`} className="rounded-full p-2 text-secondary transition-colors hover:bg-secondary/10">
              <Heart className={`h-4 w-4 ${recipe.isSaved ? 'fill-secondary' : ''}`} />
            </button>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-5 text-center">
            <p className="font-sans text-sm font-bold text-on-surface-variant">{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ChefHome({ recipes, displayName, onSelectRecipe, onToggleFavorite, onCreateRecipe, onNavigate, workspaceId, userId }: ChefHomeProps) {
  const recentRecipes = recipes.slice(0, 4);
  const favoriteRecipes = recipes.filter(recipe => recipe.isSaved).slice(0, 4);
  const recentlyEditedRecipes = useMemo(
    () => [...recipes].sort((a, b) => recipeTimestamp(b) - recipeTimestamp(a)).slice(0, 4),
    [recipes]
  );
  const categories = useMemo(
    () => Array.from(new Set(recipes.flatMap(getRecipeCategories))).slice(0, 8),
    [recipes]
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 animate-fade-in">
      <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:p-8">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Chef Home</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">Welcome back, {displayName}</h1>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Your recipes, favorites, and kitchen tools for today.</p>
      </section>

      <TodaysTasks workspaceId={workspaceId} userId={userId} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RecipeList title="Recent Recipes" recipes={recentRecipes} emptyMessage="No recipes yet." onSelectRecipe={onSelectRecipe} onToggleFavorite={onToggleFavorite} />
        <RecipeList title="Favorite Recipes" recipes={favoriteRecipes} emptyMessage="No favorite recipes yet." onSelectRecipe={onSelectRecipe} onToggleFavorite={onToggleFavorite} />
        <RecipeList title="Recently Edited Recipes" recipes={recentlyEditedRecipes} emptyMessage="No recently edited recipes yet." onSelectRecipe={onSelectRecipe} onToggleFavorite={onToggleFavorite} />

        <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Recipe Categories</p>
            <FolderOpen className="h-5 w-5 text-outline" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.length > 0 ? categories.map(category => (
              <button key={category} type="button" onClick={() => onNavigate?.('search')} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-2 font-sans text-xs font-extrabold text-primary transition-colors hover:bg-primary/5">
                {category}
              </button>
            )) : <p className="font-sans text-sm font-bold text-on-surface-variant">No recipe categories yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <span className="inline-flex rounded-full bg-secondary/10 p-2 text-secondary"><Bot className="h-5 w-5" /></span>
          <p className="mt-4 font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">AI Recipe Assistant</p>
          <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Start a recipe and use the existing AI tools to help build your method.</p>
          <button type="button" onClick={onCreateRecipe} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary transition-transform active:scale-95">
            <Sparkles className="h-4 w-4" /> Start a Recipe
          </button>
        </section>

        <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Recipe Quick Actions</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button type="button" onClick={onCreateRecipe} className="flex items-center gap-3 rounded-xl bg-primary p-4 text-left font-sans text-xs font-extrabold text-on-primary"><Plus className="h-4 w-4" /> New Recipe</button>
            <button type="button" onClick={() => onNavigate?.('search')} className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low p-4 text-left font-sans text-xs font-extrabold text-primary"><Search className="h-4 w-4" /> Browse Recipes</button>
            <button type="button" onClick={() => onNavigate?.('favorites')} className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low p-4 text-left font-sans text-xs font-extrabold text-primary"><Heart className="h-4 w-4" /> Favorites</button>
          </div>
        </section>
      </div>
    </div>
  );
}
