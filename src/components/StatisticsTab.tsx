/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Recipe, RecipeCategory } from '../types';

interface StatisticsTabProps {
  recipes: Recipe[];
  categories: RecipeCategory[];
}

export default function StatisticsTab({ recipes, categories }: StatisticsTabProps) {
  const favoriteCount = recipes.filter(recipe => recipe.isSaved).length;

  const stats = [
    { label: 'Total Recipes', value: recipes.length },
    { label: 'Favorites', value: favoriteCount },
    { label: 'Categories', value: categories.length }
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Personal Cookbook
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight">
          Statistics
        </h2>
      </div>

      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <h3 className="font-display text-xl font-bold text-primary">Kitchen Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map(stat => (
            <div
              key={stat.label}
              className="bg-white border border-surface-container-high rounded-2xl p-4 text-center"
            >
              <span className="block font-display text-3xl font-bold text-primary">
                {stat.value}
              </span>
              <span className="block font-sans text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mt-1">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
