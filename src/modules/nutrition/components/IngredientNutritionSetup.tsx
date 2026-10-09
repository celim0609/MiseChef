import { useEffect, useState } from 'react';
import type { IngredientNutritionProfile } from '../../../types';
import type { IngredientNutritionSelection, UsdaNutritionCandidate } from '../services/ingredientNutritionProfileService';
import { getCustomerFriendlyErrorMessage } from '../../../utils/customerErrorMessages';

interface IngredientNutritionSetupProps {
  ingredientName: string;
  workspaceId?: string;
  profile?: IngredientNutritionProfile | null;
  value: IngredientNutritionSelection;
  disabled?: boolean;
  embedded?: boolean;
  showPieceWeight?: boolean;
  onChange: (selection: IngredientNutritionSelection) => void;
}

const numberValue = (value: string) => {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export const withUsdaPieceWeight = (selection: IngredientNutritionSelection, value: string): IngredientNutritionSelection => {
  if (selection.source !== 'usda_fdc') return selection;
  const gramsPerPiece = numberValue(value);
  const { gramsPerPiece: _previousGramsPerPiece, ...usdaSelection } = selection;
  return {
    ...usdaSelection,
    ...(gramsPerPiece !== undefined && gramsPerPiece > 0 ? { gramsPerPiece } : {})
  };
};

export default function IngredientNutritionSetup({ ingredientName, workspaceId, profile, value, disabled = false, embedded = false, showPieceWeight = false, onChange }: IngredientNutritionSetupProps) {
  const initialOverride = value.source === 'chef_override' ? value : null;
  const selectedPieceWeight = value.source === 'usda_fdc' ? value.gramsPerPiece : undefined;
  const [kind, setKind] = useState(value.source === 'chef_non_food' || profile?.kind === 'non_food' ? 'non_food' : 'food');
  const [kcalPer100g, setKcalPer100g] = useState(initialOverride?.kcalPer100g === undefined ? String(profile?.kcalPer100g ?? '') : String(initialOverride.kcalPer100g));
  const [kcalPer100ml, setKcalPer100ml] = useState(initialOverride?.kcalPer100ml === undefined ? String(profile?.kcalPer100ml ?? '') : String(initialOverride.kcalPer100ml));
  const [gramsPerPiece, setGramsPerPiece] = useState(selectedPieceWeight === undefined ? (initialOverride?.gramsPerPiece === undefined ? String(profile?.gramsPerPiece ?? '') : String(initialOverride.gramsPerPiece)) : String(selectedPieceWeight));
  const [candidates, setCandidates] = useState<UsdaNutritionCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [isManualSetupOpen, setIsManualSetupOpen] = useState(value.source === 'chef_override');

  useEffect(() => {
    setKind(value.source === 'chef_non_food' || profile?.kind === 'non_food' ? 'non_food' : 'food');
    if (value.source === 'chef_override') {
      setIsManualSetupOpen(true);
      setKcalPer100g(value.kcalPer100g === undefined ? '' : String(value.kcalPer100g));
      setKcalPer100ml(value.kcalPer100ml === undefined ? '' : String(value.kcalPer100ml));
      setGramsPerPiece(value.gramsPerPiece === undefined ? '' : String(value.gramsPerPiece));
    } else if (value.source === 'usda_fdc') {
      setGramsPerPiece(value.gramsPerPiece === undefined ? String(profile?.gramsPerPiece ?? '') : String(value.gramsPerPiece));
    }
  }, [profile?.id, value]);

  const selectChefOverride = () => {
    const nextKcalPer100g = numberValue(kcalPer100g);
    const nextKcalPer100ml = numberValue(kcalPer100ml);
    const nextGramsPerPiece = numberValue(gramsPerPiece);
    if (nextKcalPer100g === undefined && nextKcalPer100ml === undefined) {
      setError('Enter kcal per 100 g or kcal per 100 ml before saving a food profile.');
      return;
    }
    if (gramsPerPiece.trim() && (nextGramsPerPiece === undefined || nextGramsPerPiece <= 0 || nextKcalPer100g === undefined)) {
      setError('Weight per piece requires kcal per 100 g and must be greater than zero.');
      return;
    }
    setError('');
    onChange({ source: 'chef_override', ...(nextKcalPer100g === undefined ? {} : { kcalPer100g: nextKcalPer100g }), ...(nextKcalPer100ml === undefined ? {} : { kcalPer100ml: nextKcalPer100ml }), ...(nextGramsPerPiece === undefined ? {} : { gramsPerPiece: nextGramsPerPiece }) });
  };

  const findUsda = async () => {
    if (!workspaceId || !ingredientName.trim()) {
      setError('Enter an Ingredient name before searching USDA nutrition.');
      return;
    }
    setIsSearching(true);
    setError('');
    try {
      const { searchUsdaIngredientNutrition } = await import('../services/ingredientNutritionProfileService');
      setCandidates(await searchUsdaIngredientNutrition(workspaceId, ingredientName.trim()));
    } catch (searchError) {
      setError(getCustomerFriendlyErrorMessage(searchError, 'Unable to search USDA nutrition.'));
    } finally {
      setIsSearching(false);
    }
  };

  const changeUsdaPieceWeight = (nextValue: string) => {
    setGramsPerPiece(nextValue);
    if (value.source !== 'usda_fdc') return;
    setError('');
    onChange(withUsdaPieceWeight(value, nextValue));
  };

  const nutritionControls = <>
      <label className="block">
        <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Ingredient type</span>
        <select value={kind} onChange={event => setKind(event.target.value)} disabled={disabled} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary disabled:opacity-50">
          <option value="food">Food</option><option value="non_food">Non-food</option>
        </select>
      </label>
      {kind === 'food' ? <>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setError(''); setIsManualSetupOpen(true); }} disabled={disabled} className="rounded-full border border-primary/30 px-4 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Enter chef-confirmed values</button>
          <button type="button" onClick={() => void findUsda()} disabled={disabled || isSearching} className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSearching ? 'Searching USDA...' : 'Find USDA nutrition'}</button>
        </div>
        {isManualSetupOpen && <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label><span className="font-sans text-xs font-extrabold text-primary">kcal per 100 g</span><input type="number" min="0" step="0.01" value={kcalPer100g} onChange={event => setKcalPer100g(event.target.value)} disabled={disabled} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary disabled:opacity-50" /></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">kcal per 100 ml</span><input type="number" min="0" step="0.01" value={kcalPer100ml} onChange={event => setKcalPer100ml(event.target.value)} disabled={disabled} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary disabled:opacity-50" /></label>
          </div>
          {showPieceWeight && <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Weight per piece (g)</span><input type="number" min="0.001" step="0.001" value={gramsPerPiece} onChange={event => setGramsPerPiece(event.target.value)} disabled={disabled} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary disabled:opacity-50" /><span className="mt-1 block font-sans text-[11px] font-semibold text-on-surface-variant">Required only when Recipes use pcs or nos. Never guessed.</span></label>}
          <button type="button" onClick={selectChefOverride} disabled={disabled} className="rounded-full border border-primary/30 px-4 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Use chef-confirmed values</button>
        </>}
        {value.source === 'usda_fdc' && showPieceWeight && <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Weight per piece (g)</span><input type="number" min="0.001" step="0.001" value={gramsPerPiece} onChange={event => changeUsdaPieceWeight(event.target.value)} disabled={disabled} className="mt-2 w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-primary disabled:opacity-50" /><span className="mt-1 block font-sans text-[11px] font-semibold text-on-surface-variant">Required only when Recipes use pcs or nos. Never guessed.</span></label>}
      </> : <button type="button" onClick={() => { setError(''); onChange({ source: 'chef_non_food' }); }} disabled={disabled} className="rounded-full border border-primary/30 px-4 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Mark as non-food</button>}
      {candidates.map(candidate => <button key={candidate.fdcId} type="button" onClick={() => { setError(''); onChange({ source: 'usda_fdc', fdcId: candidate.fdcId, description: candidate.description }); setCandidates([]); }} disabled={disabled} className="block w-full rounded-xl border border-surface-container-high bg-white px-3 py-2 text-left font-sans text-xs font-bold text-primary"><span>{candidate.description}</span><span className="ml-2 text-on-surface-variant">{candidate.kcalPer100g} kcal/100 g · Select</span></button>)}
      {value.source !== 'none' && <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"><p className="font-sans text-xs font-bold text-primary">{value.source === 'usda_fdc' ? `USDA selected: ${value.description || value.fdcId}` : value.source === 'chef_non_food' ? 'Non-food selected' : 'Chef-confirmed nutrition selected'}</p><button type="button" onClick={() => { setError(''); onChange({ source: 'none' }); }} disabled={disabled} className="font-sans text-xs font-extrabold text-secondary disabled:opacity-50">Clear</button></div>}
      {profile?.foodDescription && <p className="text-xs font-bold">USDA food: {profile.foodDescription}</p>}
      {profile?.reviewWarnings?.map((warning, index) => <p key={index} role="status" className="text-xs text-amber-800">Review: {warning}</p>)}
      {profile && <p className="font-sans text-xs font-bold text-primary">Currently approved: {profile.source.replace(/_/g, ' ')}</p>}
      {!profile && value.source === 'none' && <p className="font-sans text-xs font-bold text-on-surface-variant">Not configured. You can save the Ingredient without Nutrition and configure it later.</p>}
      {error && <p className="font-sans text-xs font-bold text-error">{error}</p>}
  </>;

  if (embedded) return <div className="space-y-3">{nutritionControls}</div>;

  return (
    <section className="space-y-3 rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
      <div>
        <h4 className="font-display text-lg font-bold text-primary">Nutrition setup <span className="font-sans text-xs font-bold text-on-surface-variant">(optional)</span></h4>
        <p className="mt-1 font-sans text-xs font-semibold text-on-surface-variant">Separate from costing. Save Ingredient to apply this approved profile; nutrition is never guessed.</p>
      </div>
      {nutritionControls}
    </section>
  );
}
