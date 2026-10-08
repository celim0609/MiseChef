import type { RecipeNutritionSummary } from '../types';

export function RecipeNutritionSummaryView({ nutrition }: { nutrition: RecipeNutritionSummary }) {
  const usable = nutrition.status !== 'INCOMPLETE'
    && nutrition.calculatedIngredientCount !== 0
    && Number.isFinite(nutrition.totalKcal) && Number.isFinite(nutrition.kcalPerServing);
  const partial = nutrition.status === 'ESTIMATED';
  return (
    <div className="space-y-1 font-sans text-xs">
      <p className={`font-bold ${usable ? 'text-primary' : 'text-on-surface-variant'}`}>
        {usable
          ? `${partial ? 'Partial Total' : 'Total Calories'}: ${Math.round(nutrition.totalKcal as number)} kcal · ${partial ? 'Partial ' : ''}${Math.round(nutrition.kcalPerServing as number)} kcal per serving`
          : 'Incomplete — not enough usable nutrition data to estimate nutrition.'}
      </p>
      {nutrition.calculatedIngredientCount !== undefined && (
        <p>{nutrition.calculatedIngredientCount} / {nutrition.totalIngredientCount} ingredients calculated</p>
      )}
    </div>
  );
}

export function RecipeNutritionResult({ nutrition }: { nutrition: RecipeNutritionSummary }) {
  return (
    <div className="space-y-1 font-sans text-xs">
      <RecipeNutritionSummaryView nutrition={nutrition} />
      {nutrition.ingredientBreakdown && nutrition.ingredientBreakdown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left" aria-label="Ingredient nutrition breakdown">
            <thead><tr><th scope="col">Ingredient</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col" className="text-right">kcal</th></tr></thead>
            <tbody>
              {nutrition.ingredientBreakdown.map((ingredient, index) => (
                <tr key={`${ingredient.id}-${index}`}>
                  <th scope="row" className="py-1 font-normal">{ingredient.name}</th>
                  <td>{ingredient.quantity}</td>
                  <td>{ingredient.unit}</td>
                  <td className="text-right">{ingredient.kcal !== undefined && Number.isFinite(ingredient.kcal) ? `${Number(ingredient.kcal.toFixed(2))} kcal` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nutrition.incompleteReasons.length > 0 && (
        <ul className="space-y-1 text-on-surface-variant">
          {nutrition.incompleteReasons.map((reason, index) => <li key={index}>{reason}</li>)}
        </ul>
      )}
    </div>
  );
}
