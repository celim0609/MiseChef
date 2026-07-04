import type { Recipe } from '../../../types';
import type { PortfolioFeaturedRecipe } from '../types';

interface FeaturedRecipesPreviewProps {
  featuredRecipes: PortfolioFeaturedRecipe[];
  recipes: Recipe[];
}

const getPublicFeaturedRecipes = (featuredRecipes: PortfolioFeaturedRecipe[]) => (
  featuredRecipes
    .filter(item => item.visibility === 'public')
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function FeaturedRecipesPreview({ featuredRecipes, recipes }: FeaturedRecipesPreviewProps) {
  const publicFeaturedRecipes = getPublicFeaturedRecipes(featuredRecipes)
    .map(item => ({
      item,
      recipe: recipes.find(recipe => recipe.id === item.recipeId)
    }))
    .filter(entry => entry.recipe);

  if (publicFeaturedRecipes.length === 0) return null;

  return (
    <section className="animate-fade-in pb-10">
      <div className="space-y-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            Featured Recipes
          </p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">
            Signature Recipes
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicFeaturedRecipes.map(({ item, recipe }) => recipe && (
            <article key={item.recipeId} className="rounded-2xl border border-surface-container-high bg-surface-container-low overflow-hidden shadow-sm">
              <img src={recipe.imageUrl || recipe.coverImage} alt={recipe.title} className="h-48 w-full object-cover bg-surface-container" />
              <div className="p-5 space-y-3">
                <div>
                  <h4 className="font-display text-2xl font-bold text-primary tracking-tight">{recipe.title}</h4>
                  <p className="font-sans text-sm font-bold text-on-surface-variant mt-1">
                    {[recipe.category, recipe.difficulty, recipe.yield].filter(Boolean).join(' | ')}
                  </p>
                </div>

                {recipe.story && (
                  <p className="font-sans text-sm font-bold text-on-surface-variant line-clamp-3">{recipe.story}</p>
                )}

                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {recipe.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="rounded-full bg-white px-3 py-1 font-sans text-xs font-extrabold text-primary">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
