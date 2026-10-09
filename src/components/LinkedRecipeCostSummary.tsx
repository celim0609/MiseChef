import type { LinkedRecipeComponent, Recipe } from '../types';
import { resolveLinkedRecipeCost } from '../modules/costing/services/recipeCostCalculator';
import { formatRegionCurrency, useWorkspaceRegion } from '../regions';

export function LinkedRecipeCostSummary({ child, quantity, unit = 'portion' }: { child?: Recipe; quantity: number; unit?: LinkedRecipeComponent['unit'] }) {
  const region = useWorkspaceRegion();
  const cost = resolveLinkedRecipeCost(child, { quantity, unit });
  const unavailable = cost === null || Boolean(child?.costing?.linkedRecipeWarnings?.length);
  return <div className="font-sans text-xs text-on-surface-variant">
    <p>Child servings: {child?.servings || '—'}</p>
    {unit !== 'portion' && <p>Finished yield: {child?.nutritionYield ? `${child.nutritionYield.quantity} ${child.nutritionYield.unit}` : '—'}</p>}
    <p>Cost per {unit === 'portion' ? 'portion' : unit}: {unavailable ? '—' : formatRegionCurrency(cost!.unitCost, region.currency)}</p>
    <p>Contribution: {unavailable ? '—' : formatRegionCurrency(cost!.contribution, region.currency)}</p>
    {unavailable && <p role="alert" className="font-bold text-amber-800">Child costing unavailable. Check the child recipe’s ingredients, servings or confirmed finished yield.</p>}
  </div>;
}
