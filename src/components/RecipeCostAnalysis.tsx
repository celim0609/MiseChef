import React, { useState } from 'react';
import { ChevronDown, DollarSign } from 'lucide-react';
import type { Recipe } from '../types';

const formatCurrency = (value: number | undefined) => `$${Number(value || 0).toFixed(2)}`;

const formatUnitCost = (value: number | undefined) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Not calculated yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

interface RecipeCostAnalysisProps {
  recipe: Recipe;
  defaultOpen?: boolean;
  livePreview?: boolean;
}

export default function RecipeCostAnalysis({
  recipe,
  defaultOpen = false,
  livePreview = false
}: RecipeCostAnalysisProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const recipeCosting = recipe.costing;
  const costingWarnings = recipe.ingredients.filter(ingredient => ingredient.costingWarning);
  const hasCostBreakdown = Boolean(recipeCosting?.breakdown?.length);
  const hasTotalCost = hasCostBreakdown && Number.isFinite(Number(recipeCosting?.totalRecipeCost));
  const hasPerPortionCost = hasTotalCost
    && Number(recipe.servings || 0) > 0
    && Number.isFinite(Number(recipeCosting?.costPerPortion));
  const hasProfitMetrics = hasPerPortionCost
    && Number(recipeCosting?.sellingPrice || 0) > 0
    && Number.isFinite(Number(recipeCosting?.foodCostPercentage))
    && Number.isFinite(Number(recipeCosting?.grossProfitPercentage));
  const contentId = `recipe-cost-analysis-${livePreview ? 'editor' : 'detail'}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-container-low/60"
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
            <DollarSign className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold text-primary">Cost Analysis</span>
            <span className="block truncate font-sans text-[11px] font-bold text-on-surface-variant">
              {livePreview ? 'Live preview · ' : 'Last calculated: '}
              {formatDateTime(recipeCosting?.lastCalculatedAt || recipe.recipeCostLastCalculatedAt)}
            </span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-outline transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div id={contentId} className="space-y-5 border-t border-surface-container px-5 py-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-surface-container bg-surface-container-low px-3 py-2">
              <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-outline">Total Cost</span>
              <span className="font-sans text-sm font-extrabold text-primary">
                {hasTotalCost ? formatCurrency(recipeCosting?.totalRecipeCost) : '—'}
              </span>
            </div>
            <div className="rounded-xl border border-surface-container bg-surface-container-low px-3 py-2">
              <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-outline">Per Portion</span>
              <span className="font-sans text-sm font-extrabold text-primary">
                {hasPerPortionCost ? formatCurrency(recipeCosting?.costPerPortion) : '—'}
              </span>
            </div>
            <div className="rounded-xl border border-surface-container bg-surface-container-low px-3 py-2">
              <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-outline">Food Cost</span>
              <span className="font-sans text-sm font-extrabold text-primary">
                {hasProfitMetrics ? `${recipeCosting?.foodCostPercentage}%` : '—'}
              </span>
            </div>
            <div className="rounded-xl border border-surface-container bg-surface-container-low px-3 py-2">
              <span className="block font-sans text-[10px] font-bold uppercase tracking-wider text-outline">Gross Profit</span>
              <span className="font-sans text-sm font-extrabold text-primary">
                {hasProfitMetrics ? `${recipeCosting?.grossProfitPercentage}%` : '—'}
              </span>
            </div>
          </div>

          {costingWarnings.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="font-sans text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-200">Costing warnings</p>
              {costingWarnings.map(ingredient => (
                <p key={ingredient.id} className="font-sans text-xs font-semibold text-amber-800 dark:text-amber-200">
                  <span className="font-extrabold">{ingredient.name}:</span> {ingredient.costingWarning}
                </p>
              ))}
            </div>
          )}

          {hasCostBreakdown ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left font-sans">
                <thead className="border-b border-surface-container text-[10px] uppercase tracking-wider text-outline">
                  <tr>
                    <th className="py-2 pr-4 font-extrabold">Ingredient</th>
                    <th className="px-3 py-2 font-extrabold">Quantity</th>
                    <th className="px-3 py-2 font-extrabold">Unit Cost</th>
                    <th className="px-3 py-2 font-extrabold">Ingredient Cost</th>
                    <th className="py-2 pl-3 text-right font-bold text-outline/70">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/60">
                  {recipeCosting?.breakdown.map(item => (
                    <tr key={item.recipeIngredientId}>
                      <td className="py-4 pr-4">
                        <span className="block font-sans text-sm font-extrabold text-primary">{item.ingredientName}</span>
                      </td>
                      <td className="px-3 py-4 font-sans text-xs font-semibold text-on-surface-variant">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-4 font-sans text-xs font-semibold text-on-surface-variant">
                        {formatUnitCost(item.unitCost)} / {item.unit || 'unit'}
                      </td>
                      <td className="px-3 py-4 font-sans text-sm font-extrabold text-primary">
                        {formatCurrency(item.ingredientCost)}
                      </td>
                      <td className="py-4 pl-3 text-right font-sans text-[11px] font-semibold text-outline">
                        {item.percentageOfTotalRecipeCost}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-container-high bg-surface-container-low/50 p-5 text-center">
              <p className="font-sans text-sm font-bold text-primary">No recipe cost calculated yet.</p>
              <p className="mt-1 font-sans text-xs font-semibold text-on-surface-variant">
                {livePreview
                  ? 'Link a priced Ingredient Library item to preview this recipe cost.'
                  : 'Cost information will appear after priced ingredients are linked and the recipe is saved.'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
