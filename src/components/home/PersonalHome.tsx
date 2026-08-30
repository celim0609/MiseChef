import React from 'react';
import { BookOpen, Plus, ShoppingBag, UsersRound } from 'lucide-react';
import type { Recipe, RootTab } from '../../types';

interface PersonalHomeProps {
  recipes: Recipe[];
  greeting: string;
  onCreateRecipe?: () => void;
  onNavigate?: (tab: RootTab) => void;
  onSelectRecipe: (recipe: Recipe) => void;
}

export default function PersonalHome({ recipes, greeting, onCreateRecipe, onNavigate, onSelectRecipe }: PersonalHomeProps) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 animate-fade-in">
      <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:p-8">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Personal MiseChef</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">{greeting}</h1>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Your recipes, orders, and Host tools.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={onCreateRecipe} className="flex items-center gap-3 rounded-xl bg-primary p-4 text-left font-sans text-sm font-extrabold text-on-primary">
            <Plus className="h-5 w-5" /> Add Recipe
          </button>
          <button type="button" onClick={() => onNavigate?.('search')} className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white p-4 text-left font-sans text-sm font-extrabold text-primary">
            <BookOpen className="h-5 w-5" /> My Recipes
          </button>
          <a href="/orders" className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white p-4 font-sans text-sm font-extrabold text-primary">
            <ShoppingBag className="h-5 w-5" /> My Orders
          </a>
          <a href="/" className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white p-4 font-sans text-sm font-extrabold text-primary">
            <UsersRound className="h-5 w-5" /> Host / Stores
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Recent Recipes</p>
          <button type="button" onClick={() => onNavigate?.('search')} className="font-sans text-xs font-extrabold text-secondary">View all</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {recipes.slice(0, 4).map(recipe => (
            <button key={recipe.id} type="button" onClick={() => onSelectRecipe(recipe)} className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low p-3 text-left">
              <img src={recipe.coverImage} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
              <span className="truncate font-sans text-sm font-extrabold text-primary">{recipe.title}</span>
            </button>
          ))}
          {recipes.length === 0 && <p className="font-sans text-sm font-bold text-on-surface-variant">No recipes yet. Add your first recipe when you’re ready.</p>}
        </div>
      </section>
    </div>
  );
}
