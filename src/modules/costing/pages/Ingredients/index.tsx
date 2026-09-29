import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Archive, ChevronDown, ChevronLeft, ChevronRight, Edit3, Plus, Search, X } from 'lucide-react';
import { ingredientService, recipeCostService } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import { usageLimitService } from '../../../../services/usageLimitService';
import type { CostingIngredient } from '../../types';
import { formatRegionCurrency, useWorkspaceRegion } from '../../../../regions';
import {
  calculatePackRecipeUnitCost,
  getLegacyFieldsForPack,
  hasIngredientPackData,
  validateIngredientPack,
  type PackValidationInput
} from '../../services/ingredientPackModel';
import IngredientNutritionSetup from '../../../nutrition/components/IngredientNutritionSetup';
import {
  applyIngredientNutritionSelection,
  loadIngredientNutritionProfiles,
  type IngredientNutritionSelection
} from '../../../nutrition/services/ingredientNutritionProfileService';
import type { IngredientNutritionProfile } from '../../../../types';

interface CostingIngredientsPageProps {
  userId?: string;
  workspaceId?: string;
  openCreateRequest?: number;
  onQuickAddHandled?: (requestId: number) => void;
}

type SortKey = 'name' | 'category' | 'currentPrice' | 'updatedAt';
type IngredientFormSection = 'purchase' | 'nutrition' | 'supplier' | 'yieldWaste';

type IngredientFormState = Pick<CostingIngredient,
  'name' | 'category' | 'purchaseUnit' | 'recipeUnit' | 'conversionFactor' | 'currentPrice' | 'currency' | 'supplierId' | 'yieldPercentage' | 'wastePercentage' | 'notes'
> & {
  packQuantity: number;
  packUnit: string;
  packPrice: number;
};

const PAGE_SIZE = 8;
const PACK_UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'pcs', 'Unit'];

const getEmptyForm = (currency: string): IngredientFormState => ({
  name: '',
  category: '',
  packQuantity: 0,
  packUnit: '',
  packPrice: 0,
  purchaseUnit: '',
  recipeUnit: '',
  conversionFactor: 1,
  currentPrice: 0,
  currency,
  supplierId: '',
  yieldPercentage: 100,
  wastePercentage: 0,
  notes: ''
});

const selectionFromProfile = (profile: IngredientNutritionProfile | null): IngredientNutritionSelection => {
  if (!profile) return { source: 'none' };
  if (profile.source === 'usda_fdc' && profile.catalogProfileId) return { source: 'usda_fdc', fdcId: profile.catalogProfileId, ...(profile.gramsPerPiece === undefined ? {} : { gramsPerPiece: profile.gramsPerPiece }) };
  if (profile.source === 'chef_non_food') return { source: 'chef_non_food' };
  return {
    source: 'chef_override',
    ...(profile.kcalPer100g === undefined ? {} : { kcalPer100g: profile.kcalPer100g }),
    ...(profile.kcalPer100ml === undefined ? {} : { kcalPer100ml: profile.kcalPer100ml }),
    ...(profile.gramsPerPiece === undefined ? {} : { gramsPerPiece: profile.gramsPerPiece })
  };
};

const statusClassName: Record<CostingIngredient['status'], string> = {
  Active: 'bg-green-100 text-green-800',
  Archived: 'bg-surface-container-high text-on-surface-variant'
};

const toFormState = (ingredient: CostingIngredient | null | undefined, currency: string): IngredientFormState => ingredient ? {
  name: ingredient.name,
  category: ingredient.category,
  packQuantity: Number(ingredient.packQuantity || 0),
  packUnit: ingredient.packUnit || '',
  packPrice: Number(ingredient.packPrice || 0),
  purchaseUnit: ingredient.purchaseUnit,
  recipeUnit: ingredient.recipeUnit,
  conversionFactor: ingredient.conversionFactor,
  currentPrice: ingredient.currentPrice,
  currency,
  supplierId: ingredient.supplierId,
  yieldPercentage: ingredient.yieldPercentage,
  wastePercentage: ingredient.wastePercentage,
  notes: ingredient.notes
} : getEmptyForm(currency);

const getIngredientPurchaseDisplay = (ingredient: CostingIngredient, fallbackCurrency: string) => {
  if (hasIngredientPackData(ingredient) && Number(ingredient.packQuantity) > 0 && ingredient.packUnit) {
    return `${ingredient.packQuantity} ${ingredient.packUnit} · ${formatRegionCurrency(ingredient.packPrice, fallbackCurrency)}`;
  }

  return `${ingredient.purchaseUnit || 'unit'} · ${formatRegionCurrency(ingredient.currentPrice, fallbackCurrency)}`;
};

const formatCalculatedUnitCost = (value: number, currency: string) => (
  `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
);

const getPurchaseSummary = (formState: IngredientFormState, currency: string) => {
  if (formState.packQuantity > 0 && formState.packUnit && formState.packPrice > 0) {
    return `${formatRegionCurrency(formState.packPrice, currency)} / ${formState.packQuantity} ${formState.packUnit}`;
  }
  if (formState.currentPrice > 0) return `${formatRegionCurrency(formState.currentPrice, currency)} / ${formState.purchaseUnit || 'unit'}`;
  return 'Not configured';
};

const getNutritionSummary = (profile: IngredientNutritionProfile | null, selection: IngredientNutritionSelection, isDirty: boolean) => {
  const source = isDirty ? selection.source : profile?.source;
  if (!source || source === 'none') return 'Not configured';
  if (source === 'chef_non_food') return 'Non-food';
  const kcal = isDirty && selection.source === 'chef_override'
    ? selection.kcalPer100g ?? selection.kcalPer100ml
    : profile?.kcalPer100g ?? profile?.kcalPer100ml;
  const unit = isDirty && selection.source === 'chef_override' && selection.kcalPer100ml !== undefined && selection.kcalPer100g === undefined
    ? '100ml'
    : profile?.kcalPer100ml !== undefined && profile.kcalPer100g === undefined ? '100ml' : '100g';
  const label = source === 'usda_fdc' ? 'USDA' : 'Chef-confirmed';
  return kcal === undefined ? label : `${label} · ${kcal} kcal/${unit}`;
};

function IngredientFormDisclosure({ title, summary, optional = false, isOpen, onToggle, children }: {
  title: string;
  summary: string;
  optional?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-surface-container-high">
      <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-container-low">
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{title}</span>
          <span className="mt-1 block truncate font-sans text-xs font-semibold text-on-surface-variant">{summary}</span>
        </span>
        {optional && <span className="font-sans text-[11px] font-bold text-on-surface-variant">Optional</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-primary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="border-t border-surface-container-high px-4 py-4">{children}</div>}
    </section>
  );
}

export default function CostingIngredientsPage({ userId, workspaceId, openCreateRequest, onQuickAddHandled }: CostingIngredientsPageProps) {
  const region = useWorkspaceRegion();
  const [ingredients, setIngredients] = useState<CostingIngredient[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<CostingIngredient | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [formState, setFormState] = useState<IngredientFormState>(() => getEmptyForm(region.currency));
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [nutritionProfile, setNutritionProfile] = useState<IngredientNutritionProfile | null>(null);
  const [nutritionSelection, setNutritionSelection] = useState<IngredientNutritionSelection>({ source: 'none' });
  const [isNutritionDirty, setIsNutritionDirty] = useState(false);
  const [openSections, setOpenSections] = useState<Record<IngredientFormSection, boolean>>({ purchase: false, nutrition: false, supplier: false, yieldWaste: false });

  useEffect(() => {
    setSelectedIngredient(null);
    setIsDrawerOpen(false);
    setFormState(getEmptyForm(region.currency));

    let isCancelled = false;

    const loadIngredients = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const loadedIngredients = await ingredientService.listIngredients(workspaceId || userId);
        if (!isCancelled) setIngredients(loadedIngredients);
      } catch (err) {
        if (!isCancelled) setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to load ingredients.'));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadIngredients();

    return () => {
      isCancelled = true;
    };
  }, [region.currency, userId, workspaceId]);

  const categories = useMemo(() => {
    const categorySet = new Set<string>(ingredients.map(ingredient => ingredient.category).filter(Boolean));
    return ['All', ...Array.from(categorySet).sort((a, b) => a.localeCompare(b))];
  }, [ingredients]);

  const filteredIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = ingredients.filter(ingredient => {
      const matchesSearch = !query || [ingredient.name, ingredient.category, ingredient.purchaseUnit, ingredient.recipeUnit, ingredient.supplierId]
        .map(value => String(value || ''))
        .some(value => value.toLowerCase().includes(query));
      const matchesCategory = categoryFilter === 'All' || ingredient.category === categoryFilter;
      return ingredient.status === 'Active' && matchesSearch && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === 'currentPrice') return a.currentPrice - b.currentPrice;
      if (sortKey === 'updatedAt') return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      return String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''));
    });
  }, [categoryFilter, ingredients, searchQuery, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredIngredients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedIngredients = filteredIngredients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, searchQuery, sortKey]);

  const openCreateDrawer = () => {
    setSelectedIngredient(null);
    setFormState(getEmptyForm(region.currency));
    setErrorMessage('');
    setMessage('');
    setNutritionProfile(null);
    setNutritionSelection({ source: 'none' });
    setIsNutritionDirty(false);
    setOpenSections({ purchase: false, nutrition: false, supplier: false, yieldWaste: false });
    setIsDrawerOpen(true);
  };

  useEffect(() => {
    if (!openCreateRequest) return;
    openCreateDrawer();
    onQuickAddHandled?.(openCreateRequest);
  }, [onQuickAddHandled, openCreateRequest]);

  const openEditDrawer = (ingredient: CostingIngredient) => {
    setSelectedIngredient(ingredient);
    setFormState(toFormState(ingredient, region.currency));
    setErrorMessage('');
    setMessage('');
    setOpenSections({ purchase: false, nutrition: false, supplier: false, yieldWaste: false });
    setIsDrawerOpen(true);
    void loadIngredientNutritionProfiles([ingredient.id]).then(profiles => {
      const profile = profiles[ingredient.id] || null;
      setNutritionProfile(profile);
      setNutritionSelection(selectionFromProfile(profile));
      setIsNutritionDirty(false);
    });
  };

  const updateField = (field: keyof IngredientFormState, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setFormState(current => ({
      ...current,
      [field]: ['packQuantity', 'packPrice', 'conversionFactor', 'currentPrice', 'yieldPercentage', 'wastePercentage'].includes(field)
        ? Number(value) || 0
        : value
    }));
  };

  const packInput: PackValidationInput = {
    packQuantity: formState.packQuantity,
    packUnit: formState.packUnit,
    packPrice: formState.packPrice,
    recipeUnit: formState.recipeUnit
  };
  const isEditingLegacyIngredient = Boolean(selectedIngredient && !hasIngredientPackData(selectedIngredient));
  const hasEnteredPackInformation = formState.packQuantity !== 0 || Boolean(formState.packUnit) || formState.packPrice !== 0;
  const shouldSavePackInformation = !isEditingLegacyIngredient || hasEnteredPackInformation;
  const packUnitCost = shouldSavePackInformation ? calculatePackRecipeUnitCost(packInput) : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId) {
      setErrorMessage('Sign in to manage ingredients.');
      return;
    }

    if (!formState.name.trim()) {
      setErrorMessage('Ingredient name is required.');
      return;
    }

    if (shouldSavePackInformation) {
      const packValidationError = validateIngredientPack(packInput);
      if (packValidationError) {
        setErrorMessage(packValidationError);
        return;
      }
    }

    setIsSaving(true);
    setErrorMessage('');
    setMessage('');

    try {
      const {
        packQuantity: _packQuantity,
        packUnit: _packUnit,
        packPrice: _packPrice,
        ...legacyFormState
      } = formState;
      const pricingFields = shouldSavePackInformation
        ? {
            packQuantity: formState.packQuantity,
            packUnit: formState.packUnit,
            packPrice: formState.packPrice,
            ...getLegacyFieldsForPack(packInput)
          }
        : {};
      const ingredientDraft = {
        ...legacyFormState,
        ...pricingFields,
        name: formState.name.trim(),
        category: formState.category.trim()
      };

      let savedIngredient: CostingIngredient;
      if (selectedIngredient) {
        const updatedIngredient = await ingredientService.updateIngredient({
          ...selectedIngredient,
          ...ingredientDraft
        });
        savedIngredient = updatedIngredient;
        const previousCost = Number(selectedIngredient.currentPrice || 0);
        const nextCost = Number(updatedIngredient.currentPrice || 0);
        const packPricingChanged = ['packQuantity', 'packUnit', 'packPrice', 'recipeUnit'].some(field => (
          selectedIngredient[field as keyof CostingIngredient] !== updatedIngredient[field as keyof CostingIngredient]
        ));
        if (previousCost !== nextCost || packPricingChanged) {
          recipeCostService.recalculateRecipesForCostChanges({
            costChanges: [{
              ingredientId: updatedIngredient.id,
              ingredientName: updatedIngredient.name,
              previousCost,
              newCost: nextCost
            }],
            userId,
            workspaceId: workspaceId || userId
          }).catch(error => {
            console.warn('Recipe costs could not be recalculated after ingredient update.', error);
          });
        }
        setIngredients(current => current.map(ingredient => ingredient.id === updatedIngredient.id ? updatedIngredient : ingredient));
        setMessage('Ingredient updated.');
      } else {
        const currentIngredientCount = ingredients.filter(ingredient => ingredient.status === 'Active').length;
        const limitCheck = await usageLimitService.canCreateResource(workspaceId || userId, 'ingredient', currentIngredientCount);
        if (!limitCheck.allowed) {
          setErrorMessage(limitCheck.message);
          return;
        }

        const createdIngredient = await ingredientService.createIngredient({
          ...ingredientDraft,
          status: 'Active'
        }, userId, workspaceId || userId);
        savedIngredient = createdIngredient;
        setIngredients(current => [createdIngredient, ...current]);
        setMessage('Ingredient created.');
      }

      if (isNutritionDirty) {
        try {
          const profile = await applyIngredientNutritionSelection({
            workspaceId: workspaceId || userId,
            ingredientId: savedIngredient.id,
            confirmedBy: userId,
            selection: nutritionSelection
          });
          setNutritionProfile(profile);
          setIsNutritionDirty(false);
        } catch (nutritionError) {
          setSelectedIngredient(savedIngredient);
          setNutritionProfile(null);
          setErrorMessage(getCustomerFriendlyErrorMessage(nutritionError, 'Ingredient saved, but Nutrition is not configured. Update it and retry Save Ingredient.'));
          return;
        }
      }
      setIsDrawerOpen(false);
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to save ingredient.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedIngredient) return;

    setIsSaving(true);
    setErrorMessage('');
    setMessage('');

    try {
      const archivedIngredient = await ingredientService.archiveIngredient(selectedIngredient);
      setIngredients(current => current.map(ingredient => ingredient.id === archivedIngredient.id ? archivedIngredient : ingredient));
      setIsDrawerOpen(false);
      setMessage('Ingredient archived.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to archive ingredient.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Costing</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Ingredient Library</h2>
            <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Manage the master ingredient records that will power invoices, recipes, and costing.</p>
          </div>
          <button type="button" onClick={openCreateDrawer} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary shadow-sm active:scale-95 transition-all">
            <Plus className="h-4 w-4" />
            Add Ingredient
          </button>
        </div>
      </section>

      {(message || errorMessage) && (
        <div className={`rounded-2xl border p-4 font-sans text-sm font-bold ${errorMessage ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}>
          {errorMessage || message}
        </div>
      )}

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm space-y-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative block">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search ingredients, suppliers, units..." className="w-full rounded-full border border-surface-container-high bg-surface-container-low py-3 pl-11 pr-4 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
            <option value="name">Sort by Name</option>
            <option value="category">Sort by Category</option>
            <option value="currentPrice">Sort by Price</option>
            <option value="updatedAt">Sort by Updated</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-surface-container-high">
          <table className="w-full min-w-[900px] text-left font-sans text-sm">
            <thead className="bg-surface-container-low text-primary">
              <tr>
                {['Ingredient', 'Category', 'Purchase Information', 'Recipe Unit', 'Yield', 'Waste', 'Status', 'Action'].map(header => (
                  <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center font-bold text-on-surface-variant">Loading ingredients...</td></tr>
              ) : paginatedIngredients.length > 0 ? paginatedIngredients.map(ingredient => (
                <tr key={ingredient.id} className="border-t border-surface-container-high hover:bg-surface-container-low/60">
                  <td className="px-4 py-3 font-extrabold text-primary">{ingredient.name}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.category || '-'}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{getIngredientPurchaseDisplay(ingredient, region.currency)}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.recipeUnit || '-'}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.yieldPercentage}%</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.wastePercentage}%</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${statusClassName[ingredient.status]}`}>{ingredient.status}</span></td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => openEditDrawer(ingredient)} className="inline-flex items-center gap-2 rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary">
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="font-display text-xl font-bold text-primary">No ingredients found</p>
                    <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Create your first ingredient manually. Invoice-driven ingredient creation comes next.</p>
                    <button type="button" onClick={openCreateDrawer} className="mt-5 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Add Ingredient</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-sans text-xs font-bold text-on-surface-variant">Showing {paginatedIngredients.length} of {filteredIngredients.length} active ingredients</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={currentPage === 1} className="rounded-full border border-surface-container-high p-2 text-primary disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-sans text-xs font-extrabold text-primary">Page {currentPage} of {totalPages}</span>
            <button type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={currentPage === totalPages} className="rounded-full border border-surface-container-high p-2 text-primary disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
          <button type="button" aria-label="Close ingredient drawer" onClick={() => setIsDrawerOpen(false)} className="hidden flex-1 sm:block" />
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Ingredient Detail</p>
                <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">{selectedIngredient ? 'Edit Ingredient' : 'New Ingredient'}</h3>
              </div>
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="rounded-full border border-surface-container-high p-2 text-primary"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <section className="space-y-3">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Basic Information</p>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Ingredient Name</span>
                  <input value={formState.name} onChange={event => updateField('name', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Category</span><input value={formState.category} onChange={event => updateField('category', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
                  <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Recipe Unit</span><select value={formState.recipeUnit} onChange={event => updateField('recipeUnit', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"><option value="">Select unit</option>{!PACK_UNIT_OPTIONS.includes(formState.recipeUnit) && formState.recipeUnit && <option value={formState.recipeUnit}>{formState.recipeUnit}</option>}{PACK_UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                </div>
              </section>

              <IngredientFormDisclosure title="Purchase Information" summary={getPurchaseSummary(formState, region.currency)} isOpen={openSections.purchase} onToggle={() => setOpenSections(current => ({ ...current, purchase: !current.purchase }))}>
                <div className="space-y-4">
                  {isEditingLegacyIngredient && !hasEnteredPackInformation && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">This ingredient uses legacy pricing ({formatRegionCurrency(selectedIngredient?.currentPrice, region.currency)} per {selectedIngredient?.purchaseUnit || 'unit'}). Add complete pack information to move it to automatic pack costing.</div>}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Pack Quantity</span><input type="number" min="0" step="0.001" value={formState.packQuantity || ''} onChange={event => updateField('packQuantity', event)} placeholder="50" className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
                    <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Pack Unit</span><select value={formState.packUnit} onChange={event => updateField('packUnit', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"><option value="">Select unit</option>{!PACK_UNIT_OPTIONS.includes(formState.packUnit) && formState.packUnit && <option value={formState.packUnit}>{formState.packUnit}</option>}{PACK_UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                    <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Pack Price</span><div className="mt-2 flex overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-low focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"><span className="flex items-center border-r border-surface-container-high px-3 font-sans text-xs font-extrabold text-on-surface-variant">{formState.currency}</span><input type="number" min="0" step="0.01" value={formState.packPrice ?? ''} onChange={event => updateField('packPrice', event)} placeholder="2.45" className="min-w-0 flex-1 border-none bg-transparent px-4 py-3 font-sans text-sm font-bold text-primary outline-none" /></div></label>
                    <label className="block"><span className="font-sans text-xs font-extrabold text-primary">Currency</span><input value={region.currency} readOnly aria-readonly="true" className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none" /></label>
                  </div>
                  {packUnitCost?.unitCost !== null && packUnitCost?.unitCost !== undefined ? <div className="rounded-xl bg-primary/5 px-4 py-3 font-sans text-sm font-extrabold text-primary">Unit Cost: {formatCalculatedUnitCost(packUnitCost.unitCost, formState.currency)} / {formState.recipeUnit}</div> : packUnitCost?.warning ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-sans text-xs font-bold text-amber-900">{packUnitCost.warning}</div> : null}
                </div>
              </IngredientFormDisclosure>

              <IngredientFormDisclosure title="Nutrition" summary={getNutritionSummary(nutritionProfile, nutritionSelection, isNutritionDirty)} optional isOpen={openSections.nutrition} onToggle={() => setOpenSections(current => ({ ...current, nutrition: !current.nutrition }))}>
                <IngredientNutritionSetup ingredientName={formState.name} workspaceId={workspaceId || userId} profile={nutritionProfile} value={nutritionSelection} disabled={isSaving} embedded showPieceWeight={['pcs', 'nos'].includes(formState.recipeUnit.trim().toLowerCase())} onChange={selection => { setNutritionSelection(selection); setIsNutritionDirty(true); }} />
              </IngredientFormDisclosure>

              <IngredientFormDisclosure title="Supplier" summary={formState.supplierId || 'Not configured'} isOpen={openSections.supplier} onToggle={() => setOpenSections(current => ({ ...current, supplier: !current.supplier }))}>
                <div className="space-y-3"><label className="block"><span className="font-sans text-xs font-extrabold text-primary">Supplier</span><input value={formState.supplierId} onChange={event => updateField('supplierId', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label><label className="block"><span className="font-sans text-xs font-extrabold text-primary">Notes</span><textarea value={formState.notes} onChange={event => updateField('notes', event)} rows={4} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label></div>
              </IngredientFormDisclosure>

              <IngredientFormDisclosure title="Yield & Waste" summary={`Yield ${formState.yieldPercentage}% · Waste ${formState.wastePercentage}%`} isOpen={openSections.yieldWaste} onToggle={() => setOpenSections(current => ({ ...current, yieldWaste: !current.yieldWaste }))}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block"><span className="font-sans text-xs font-extrabold text-primary">Yield</span><input type="number" min="0" step="0.01" value={String(formState.yieldPercentage)} onChange={event => updateField('yieldPercentage', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label><label className="block"><span className="font-sans text-xs font-extrabold text-primary">Waste</span><input type="number" min="0" step="0.01" value={String(formState.wastePercentage)} onChange={event => updateField('wastePercentage', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label></div>
              </IngredientFormDisclosure>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <button type="submit" disabled={isSaving} className="flex-1 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Ingredient'}</button>
                {selectedIngredient && selectedIngredient.status === 'Active' && (
                  <button type="button" onClick={handleArchive} disabled={isSaving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-surface-container-high px-5 py-3 font-sans text-xs font-extrabold text-secondary disabled:opacity-50">
                    <Archive className="h-4 w-4" />
                    Archive
                  </button>
                )}
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
