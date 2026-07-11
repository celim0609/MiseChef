import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Archive, ChevronLeft, ChevronRight, Edit3, Plus, Search, X } from 'lucide-react';
import { ingredientService, recipeCostService } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import { usageLimitService } from '../../../../services/usageLimitService';
import type { CostingIngredient } from '../../types';

interface CostingIngredientsPageProps {
  userId?: string;
  workspaceId?: string;
}

type SortKey = 'name' | 'category' | 'currentPrice' | 'updatedAt';

type IngredientFormState = Pick<CostingIngredient,
  'name' | 'category' | 'purchaseUnit' | 'recipeUnit' | 'conversionFactor' | 'currentPrice' | 'currency' | 'supplierId' | 'yieldPercentage' | 'wastePercentage' | 'notes'
>;

const PAGE_SIZE = 8;

const emptyForm: IngredientFormState = {
  name: '',
  category: '',
  purchaseUnit: '',
  recipeUnit: '',
  conversionFactor: 1,
  currentPrice: 0,
  currency: 'SGD',
  supplierId: '',
  yieldPercentage: 100,
  wastePercentage: 0,
  notes: ''
};

const statusClassName: Record<CostingIngredient['status'], string> = {
  Active: 'bg-green-100 text-green-800',
  Archived: 'bg-surface-container-high text-on-surface-variant'
};

const formatMoney = (price: number, currency: string) => `${currency || 'SGD'} ${Number(price || 0).toFixed(2)}`;

const toFormState = (ingredient?: CostingIngredient | null): IngredientFormState => ingredient ? {
  name: ingredient.name,
  category: ingredient.category,
  purchaseUnit: ingredient.purchaseUnit,
  recipeUnit: ingredient.recipeUnit,
  conversionFactor: ingredient.conversionFactor,
  currentPrice: ingredient.currentPrice,
  currency: ingredient.currency,
  supplierId: ingredient.supplierId,
  yieldPercentage: ingredient.yieldPercentage,
  wastePercentage: ingredient.wastePercentage,
  notes: ingredient.notes
} : emptyForm;

export default function CostingIngredientsPage({ userId, workspaceId }: CostingIngredientsPageProps) {
  const [ingredients, setIngredients] = useState<CostingIngredient[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<CostingIngredient | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [formState, setFormState] = useState<IngredientFormState>(emptyForm);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
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
  }, [userId, workspaceId]);

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
    setFormState(emptyForm);
    setErrorMessage('');
    setMessage('');
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (ingredient: CostingIngredient) => {
    setSelectedIngredient(ingredient);
    setFormState(toFormState(ingredient));
    setErrorMessage('');
    setMessage('');
    setIsDrawerOpen(true);
  };

  const updateField = (field: keyof IngredientFormState, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setFormState(current => ({
      ...current,
      [field]: ['conversionFactor', 'currentPrice', 'yieldPercentage', 'wastePercentage'].includes(field)
        ? Number(value) || 0
        : value
    }));
  };

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

    setIsSaving(true);
    setErrorMessage('');
    setMessage('');

    try {
      if (selectedIngredient) {
        const updatedIngredient = await ingredientService.updateIngredient({
          ...selectedIngredient,
          ...formState,
          name: formState.name.trim(),
          category: formState.category.trim()
        });
        const previousCost = Number(selectedIngredient.currentPrice || 0);
        const nextCost = Number(updatedIngredient.currentPrice || 0);
        if (previousCost !== nextCost) {
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
          ...formState,
          name: formState.name.trim(),
          category: formState.category.trim(),
          status: 'Active'
        }, userId, workspaceId || userId);
        setIngredients(current => [createdIngredient, ...current]);
        setMessage('Ingredient created.');
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
                {['Ingredient', 'Category', 'Purchase Unit', 'Recipe Unit', 'Price', 'Yield', 'Waste', 'Status', 'Action'].map(header => (
                  <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center font-bold text-on-surface-variant">Loading ingredients...</td></tr>
              ) : paginatedIngredients.length > 0 ? paginatedIngredients.map(ingredient => (
                <tr key={ingredient.id} className="border-t border-surface-container-high hover:bg-surface-container-low/60">
                  <td className="px-4 py-3 font-extrabold text-primary">{ingredient.name}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.category || '-'}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.purchaseUnit || '-'}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{ingredient.recipeUnit || '-'}</td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{formatMoney(ingredient.currentPrice, ingredient.currency)}</td>
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
                  <td colSpan={9} className="px-4 py-12 text-center">
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
              {[
                ['Name', 'name'],
                ['Category', 'category'],
                ['Purchase Unit', 'purchaseUnit'],
                ['Recipe Unit', 'recipeUnit'],
                ['Current Price', 'currentPrice'],
                ['Currency', 'currency'],
                ['Supplier', 'supplierId'],
                ['Yield', 'yieldPercentage'],
                ['Waste', 'wastePercentage']
              ].map(([label, field]) => {
                const numeric = ['currentPrice', 'yieldPercentage', 'wastePercentage'].includes(field);
                return (
                  <label key={field} className="block">
                    <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{label}</span>
                    <input type={numeric ? 'number' : 'text'} step={numeric ? '0.01' : undefined} value={String(formState[field as keyof IngredientFormState])} onChange={event => updateField(field as keyof IngredientFormState, event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                  </label>
                );
              })}

              <label className="block">
                <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Conversion Factor</span>
                <input type="number" step="0.0001" value={formState.conversionFactor} onChange={event => updateField('conversionFactor', event)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
              </label>

              <label className="block">
                <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Notes</span>
                <textarea value={formState.notes} onChange={event => updateField('notes', event)} rows={4} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
              </label>

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
