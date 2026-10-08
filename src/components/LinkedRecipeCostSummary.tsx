import type { Recipe } from '../types';
import { resolveRecipePerPortionCost } from '../modules/costing/services/recipeCostCalculator';
import { formatRegionCurrency, useWorkspaceRegion } from '../regions';

export function LinkedRecipeCostSummary({ child, quantity }: { child?: Recipe; quantity: number }) {
  const region = useWorkspaceRegion();
  const cost = resolveRecipePerPortionCost(child);
  const unavailable = cost === null || Boolean(child?.costing?.linkedRecipeWarnings?.length);
  return <div className="font-sans text-xs text-on-surface-variant">
    <p>Child servings: {child?.servings || '—'}</p>
    <p>Cost per portion: {unavailable ? '—' : formatRegionCurrency(cost, region.currency)}</p>
    <p>Contribution: {unavailable ? '—' : formatRegionCurrency(Number((quantity * cost!).toFixed(2)), region.currency)}</p>
    {unavailable && <p role="alert" className="font-bold text-amber-800">Child costing unavailable. Check the child recipe’s ingredients and servings.</p>}
  </div>;
}
