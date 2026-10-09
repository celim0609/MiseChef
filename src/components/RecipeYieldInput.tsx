import { parseMeasuredRecipeYield } from '../modules/nutrition/services/recipeYield';

export function RecipeYieldInput({ value, needsConfirmation, onChange, onConfirm }: {
  value: string; needsConfirmation: boolean; onChange: (value: string) => void; onConfirm: () => void;
}) {
  const measured = parseMeasuredRecipeYield(value);
  return <div className="space-y-1.5">
    <label htmlFor="recipe-yield" className="font-sans font-bold text-xs text-on-surface-variant/90 px-1">Yield</label>
    <input id="recipe-yield" type="text" value={value} onChange={event => onChange(event.target.value)} placeholder="e.g. 290g, 500ml, 12 pcs, 20 servings" className="w-full bg-surface-container border-none rounded-xl font-sans text-xs sm:text-sm text-on-surface px-4 py-3.5 focus:ring-1 focus:ring-primary font-bold" />
    {measured && needsConfirmation
      ? <div className="font-sans text-xs"><p>Saved Yield is display text only until confirmed as measured finished output.</p><button type="button" onClick={onConfirm} className="mt-1 rounded-full border px-3 py-2 font-bold">Confirm {value.trim()} as measured finished yield</button></div>
      : <p className="font-sans text-xs text-on-surface-variant">Measured quantities are used for linked kcal and cost when saved. Servings and portion links stay separate. No g/ml conversion is assumed.</p>}
  </div>;
}
