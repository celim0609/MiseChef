import type { Recipe } from '../../../types';
import type { PortfolioFeaturedRecipe, PortfolioVisibility } from '../types';

interface FeaturedRecipesManagerProps {
  featuredRecipes: PortfolioFeaturedRecipe[];
  recipes: Recipe[];
  onChange: (featuredRecipes: PortfolioFeaturedRecipe[]) => void;
}

const normalizeFeaturedOrder = (items: PortfolioFeaturedRecipe[]) => (
  items.map((item, index) => ({
    ...item,
    sortOrder: index
  }))
);

const getSortedFeaturedRecipes = (items: PortfolioFeaturedRecipe[]) => (
  [...items].sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function FeaturedRecipesManager({ featuredRecipes, recipes, onChange }: FeaturedRecipesManagerProps) {
  const sortedFeaturedRecipes = getSortedFeaturedRecipes(featuredRecipes);
  const selectedRecipeIds = new Set(sortedFeaturedRecipes.map(item => item.recipeId));
  const availableRecipes = recipes.filter(recipe => !selectedRecipeIds.has(recipe.id));

  const addFeaturedRecipe = (recipeId: string) => {
    if (!recipeId || selectedRecipeIds.has(recipeId)) return;

    onChange(normalizeFeaturedOrder([
      ...sortedFeaturedRecipes,
      {
        recipeId,
        sortOrder: sortedFeaturedRecipes.length,
        visibility: 'public'
      }
    ]));
  };

  const removeFeaturedRecipe = (recipeId: string) => {
    onChange(normalizeFeaturedOrder(sortedFeaturedRecipes.filter(item => item.recipeId !== recipeId)));
  };

  const moveFeaturedRecipe = (recipeId: string, direction: -1 | 1) => {
    const currentIndex = sortedFeaturedRecipes.findIndex(item => item.recipeId === recipeId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedFeaturedRecipes.length) return;

    const nextItems = [...sortedFeaturedRecipes];
    const [movedItem] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);
    onChange(normalizeFeaturedOrder(nextItems));
  };

  const toggleVisibility = (recipeId: string) => {
    onChange(sortedFeaturedRecipes.map(item => {
      if (item.recipeId !== recipeId) return item;
      const nextVisibility: PortfolioVisibility = item.visibility === 'public' ? 'private' : 'public';
      return {
        ...item,
        visibility: nextVisibility
      };
    }));
  };

  const getRecipe = (recipeId: string) => recipes.find(recipe => recipe.id === recipeId);

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Chef Profile Studio
        </p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
          Featured Recipes
        </h3>
      </div>

      <label className="block space-y-2">
        <span className="font-sans text-xs font-extrabold text-primary">Select Existing Recipe</span>
        <select value="" disabled={availableRecipes.length === 0} onChange={event => addFeaturedRecipe(event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
          <option value="">Choose a recipe to feature</option>
          {availableRecipes.map(recipe => (
            <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
          ))}
        </select>
        {availableRecipes.length === 0 && <p className="font-sans text-xs font-bold text-on-surface-variant">All available recipes are already featured.</p>}
      </label>

      <div className="space-y-3">
        {sortedFeaturedRecipes.length > 0 ? sortedFeaturedRecipes.map((item, index) => {
          const recipe = getRecipe(item.recipeId);

          return (
            <article key={item.recipeId} className="rounded-2xl border border-surface-container-high bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {recipe && (
                  <img src={recipe.imageUrl || recipe.coverImage} alt="" className="h-28 w-full sm:w-36 rounded-xl object-cover bg-surface-container" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">
                    {item.visibility === 'public' ? 'Public' : 'Private'} | Order {index + 1}
                  </p>
                  <h4 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
                    {recipe?.title || 'Missing recipe'}
                  </h4>
                  {recipe ? (
                    <p className="font-sans text-sm font-bold text-on-surface-variant">
                      {[recipe.category, recipe.difficulty, recipe.yield].filter(Boolean).join(' | ')}
                    </p>
                  ) : (
                    <p className="font-sans text-sm font-bold text-secondary">
                      This recipe is no longer available in the library.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => moveFeaturedRecipe(item.recipeId, -1)} disabled={index === 0} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-40">Up</button>
                <button type="button" onClick={() => moveFeaturedRecipe(item.recipeId, 1)} disabled={index === sortedFeaturedRecipes.length - 1} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-40">Down</button>
                <button type="button" onClick={() => toggleVisibility(item.recipeId)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Toggle Visibility</button>
                <button type="button" onClick={() => removeFeaturedRecipe(item.recipeId)} className="rounded-full bg-secondary/10 px-3 py-2 font-sans text-xs font-extrabold text-secondary">Remove</button>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-6 text-center">
            <p className="font-sans text-sm font-bold text-on-surface-variant">
              No featured recipes selected yet. Choose recipes from your library to feature them here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
