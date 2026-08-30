import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { CostingIngredient } from '../modules/costing/types';
import { filterRecipeLibraryIngredients } from '../modules/costing/services/recipeIngredientLibrary';
import { hasIngredientPackData } from '../modules/costing/services/ingredientPackModel';
import { useWorkspaceRegion } from '../regions';

interface IngredientLibraryPickerProps {
  ingredients: CostingIngredient[];
  selectedIngredientId?: string;
  onSelect: (ingredientId: string) => void;
  ariaLabel: string;
}

interface IngredientLibraryPickerResultsProps {
  ingredients: CostingIngredient[];
  selectedIngredientId?: string;
  onSelect: (ingredientId: string) => void;
}

const getIngredientSecondaryText = (ingredient: CostingIngredient, currency: string) => {
  const usesPackPricing = hasIngredientPackData(ingredient) && Number(ingredient.packQuantity) > 0 && Boolean(ingredient.packUnit);
  const purchaseDescription = usesPackPricing
    ? `${ingredient.packQuantity} ${ingredient.packUnit}`
    : ingredient.purchaseUnit?.trim();
  const displayedPrice = Number(usesPackPricing ? ingredient.packPrice : ingredient.currentPrice);
  const price = Number.isFinite(displayedPrice) ? `${currency} ${displayedPrice.toFixed(2)}` : '';

  return [purchaseDescription, price].filter(Boolean).join(' · ');
};

export function IngredientLibraryPickerResults({
  ingredients,
  selectedIngredientId,
  onSelect
}: IngredientLibraryPickerResultsProps) {
  const region = useWorkspaceRegion();

  if (ingredients.length === 0) {
    return <p className="px-3 py-4 text-center text-xs font-semibold text-outline">No ingredients found</p>;
  }

  return (
    <>
      {ingredients.map(ingredient => {
        const isSelected = ingredient.id === selectedIngredientId;
        const secondaryText = getIngredientSecondaryText(ingredient, region.currency);

        return (
          <button
            key={ingredient.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(ingredient.id)}
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-container-high"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-on-surface">{ingredient.name}</span>
              {secondaryText && (
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-outline">{secondaryText}</span>
              )}
            </span>
            {isSelected && <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </>
  );
}

export default function IngredientLibraryPicker({
  ingredients,
  selectedIngredientId,
  onSelect,
  ariaLabel
}: IngredientLibraryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selectedIngredient = ingredients.find(ingredient => ingredient.id === selectedIngredientId);
  const filteredIngredients = useMemo(
    () => filterRecipeLibraryIngredients(ingredients, searchQuery),
    [ingredients, searchQuery]
  );

  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectIngredient = (ingredientId: string) => {
    onSelect(ingredientId);
    setSearchQuery('');
    setIsOpen(false);
  };

  const toggleOpen = () => {
    setSearchQuery('');
    setIsOpen(current => !current);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-outline-variant/40 bg-transparent p-4 text-left font-sans text-xs font-semibold text-on-surface-variant sm:text-sm"
      >
        <span className="truncate">{selectedIngredient?.name || 'Not linked'}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-40 mt-2 w-full min-w-[18rem] overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-xl">
          <div className="border-b border-outline-variant/30 p-2">
            <label className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-outline" />
              <span className="sr-only">Search Ingredient Library</span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search name, code, or supplier"
                className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-semibold text-on-surface outline-none placeholder:text-outline"
              />
            </label>
          </div>

          <div id={listboxId} role="listbox" aria-label="Ingredient Library results" className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={!selectedIngredientId}
              onClick={() => selectIngredient('')}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <span>Not linked</span>
              {!selectedIngredientId && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
            </button>
            <IngredientLibraryPickerResults
              ingredients={filteredIngredients}
              selectedIngredientId={selectedIngredientId}
              onSelect={selectIngredient}
            />
          </div>
        </div>
      )}
    </div>
  );
}
