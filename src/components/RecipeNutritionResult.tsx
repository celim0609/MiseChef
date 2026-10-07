import type { RecipeNutritionSummary } from '../types';

export function RecipeNutritionResult({ nutrition }: { nutrition: RecipeNutritionSummary }) {
  const usable = nutrition.status !== 'INCOMPLETE';
  return (
    <div className="space-y-1 font-sans text-xs">
      <p className={`font-bold ${usable ? 'text-primary' : 'text-on-surface-variant'}`}>
        {usable
          ? `${nutrition.status === 'ESTIMATED' ? 'Estimated · ' : ''}${Math.round(nutrition.totalKcal || 0)} kcal total · ${Math.round(nutrition.kcalPerServing || 0)} kcal per serving`
          : 'Incomplete — not enough usable nutrition data to estimate nutrition.'}
      </p>
      {nutrition.calculatedIngredientCount !== undefined && (
        <p>{nutrition.calculatedIngredientCount} / {nutrition.totalIngredientCount} ingredients calculated</p>
      )}
      {nutrition.incompleteReasons.length > 0 && (
        <ul className="space-y-1 text-on-surface-variant">
          {nutrition.incompleteReasons.map((reason, index) => <li key={index}>{reason}</li>)}
        </ul>
      )}
    </div>
  );
}
