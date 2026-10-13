import { WEEKLY_DAYS, resolvePlanMeal, datedWeeks } from '../../../functions/storeWeeklyMealPlan.js';
import type { Recipe, RecipeNutritionSummary } from '../../types';
import { getSnapshotCalories } from '../nutrition/services/recipeNutritionCalculator';
import type { StoreProduct, StoreProductDraft } from './types';

export const getReadyToSellProductDraft = (
  recipe: Pick<Recipe, 'id' | 'title' | 'sellingPrice' | 'costing'>,
  nutrition?: RecipeNutritionSummary
): StoreProductDraft => {
  const requestedPrice = Number(recipe.sellingPrice ?? recipe.costing?.sellingPrice ?? 0);
  const price = Number.isFinite(requestedPrice) && requestedPrice >= 0 ? requestedPrice : 0;

  return {
    photoUrl: '',
    name: recipe.title.trim(),
    description: nutrition?.status === 'ESTIMATED' && typeof nutrition.kcalPerServing === 'number' && Number.isFinite(nutrition.kcalPerServing) && nutrition.kcalPerServing >= 0
      ? `Partial nutrition (estimated): ${Math.round(nutrition.kcalPerServing * 10) / 10} kcal per serving. Some ingredient nutrition is unavailable.`
      : '',
    price,
    ...(getSnapshotCalories(nutrition) !== undefined ? { calories: getSnapshotCalories(nutrition) } : {}),
    recipeId: recipe.id,
    available: true,
    optionGroupIds: []
  };
};

export const filterAdminStoreProducts = (
  products: StoreProduct[],
  workspaceId: string,
  search: string
) => {
  const query = search.trim().toLocaleLowerCase();

  return products.filter(product => {
    if (product.workspaceId !== workspaceId) return false;
    if (!query) return true;

    return [product.name, product.description]
      .some(value => value.toLocaleLowerCase().includes(query));
  });
};

export const filterPublicAvailableProducts = (
  products: StoreProduct[],
  storeId: string
) => products.filter(product => product.storeId === storeId && product.available);

export const resolvePublicStoreProduct = (
  products: StoreProduct[],
  productSlug: string | undefined
) => productSlug
  ? products.find(product => product.productSlug === productSlug) || null
  : null;

export const getStoreProductEditorDraft = (product: StoreProduct): StoreProductDraft => ({
  photoUrl: product.photoUrl,
  ...(product.socialImageUrl ? { socialImageUrl: product.socialImageUrl } : {}),
  name: product.name,
  description: product.description,
  price: product.price,
  ...(product.calories !== undefined ? { calories: product.calories } : {}),
  ...(product.recipeId ? { recipeId: product.recipeId } : {}),
  ...(product.productType !== undefined ? { productType: product.productType } : {}),
  ...(product.weeklyMenuVersion !== undefined ? { weeklyMenuVersion: product.weeklyMenuVersion } : {}),
  ...(product.weeklyWeeks ? { weeklyWeeks: structuredClone(product.weeklyWeeks) } : {}),
  ...(product.weeklyMeals ? { weeklyMeals: { ...product.weeklyMeals } } : {}),
  available: product.available,
  availableDay: product.availableDay ?? 'all',
  optionGroupIds: [...product.optionGroupIds]
});

export const getStoreProductEditorPresentation = (product: StoreProduct | null) => product
  ? {
      title: 'Edit Product',
      context: `Editing: ${product.name}`,
      primaryAction: 'Save Changes',
      cancelAction: 'Cancel Edit'
    }
  : {
      title: 'Add Product',
      context: 'Create a new product for this Store.',
      primaryAction: 'Add Product',
      cancelAction: 'Cancel'
    };

export type StoreProductValidationTarget = 'photo' | 'name' | 'description' | 'price' | 'calories' | 'options';

export const getStoreProductValidationTarget = (
  validationMessage: string
): StoreProductValidationTarget => {
  const message = validationMessage.toLocaleLowerCase();
  if (message.includes('photo')) return 'photo';
  if (message.includes('product name')) return 'name';
  if (message.includes('description')) return 'description';
  if (message.includes('price')) return 'price';
  if (message.includes('calories')) return 'calories';
  return 'options';
};

export const buildUpdatedStoreProduct = (
  product: StoreProduct,
  draft: StoreProductDraft,
  updatedAt: string
): StoreProduct => ({
  ...product,
  photoUrl: draft.photoUrl.trim(),
  ...(draft.socialImageUrl ? { socialImageUrl: draft.socialImageUrl.trim() } : {}),
  name: draft.name.trim(),
  description: draft.description.trim(),
  price: draft.price,
  calories: draft.calories,
  recipeId: draft.recipeId,
  productType: draft.productType,
  weeklyMenuVersion: draft.productType === 'weekly_meal_plan' ? draft.weeklyMenuVersion : undefined,
  weeklyWeeks: draft.productType === 'weekly_meal_plan' && draft.weeklyWeeks ? structuredClone(draft.weeklyWeeks) : undefined,
  weeklyMeals: draft.productType === 'weekly_meal_plan' && draft.weeklyMeals ? { ...draft.weeklyMeals } : undefined,
  available: draft.available,
  availableDay: draft.availableDay ?? 'all',
  optionGroupIds: [...draft.optionGroupIds],
  updatedAt
});

// Conversion is a draft-only operation; purchased orders and Single Products
// are untouched. Undated legacy menus need a Monday before conversion saves.
export const getEmbeddedHealthyLunchDraft = (product: StoreProduct, products: StoreProduct[]): StoreProductDraft => {
  const draft = getStoreProductEditorDraft(product);
  if (product.weeklyMenuVersion === 2) return draft;
  const menus = product.weeklyWeeks ? Object.entries(product.weeklyWeeks) : [['week1', { startMonday: '', meals: product.weeklyMeals }]];
  const weeklyWeeks = Object.fromEntries(menus.map(([slot, week]) => [slot, {
    startMonday: week.startMonday,
    meals: Object.fromEntries(WEEKLY_DAYS.map(day => {
      const meal = resolvePlanMeal(product, products, week.startMonday, day);
      return [day, { photoUrl: meal?.photoUrl || '', name: meal?.name || '', price: meal?.price ?? 0,
        ...(meal?.calories !== undefined ? { calories: meal.calories } : {}), ...(meal?.description ? { description: meal.description } : {}) }];
    }))
  }]));
  return { ...draft, weeklyMenuVersion: 2, weeklyWeeks, weeklyMeals: undefined };
};

export const prepareHealthyLunchDraft = (draft: StoreProductDraft): StoreProductDraft => {
  if (draft.weeklyMenuVersion !== 2) return draft;
  const weeklyWeeks = Object.fromEntries(Object.entries(draft.weeklyWeeks || {}).filter(([, week]) => Boolean(week?.startMonday)).map(([slot, week]) => [slot, {
    ...week, meals: Object.fromEntries(Object.entries(week.meals).map(([day, meal]) => [day, typeof meal === 'object' ? { ...meal,
      name: meal.name.trim(), photoUrl: meal.photoUrl.trim(), ...(meal.description !== undefined ? { description: meal.description.trim() } : {}) } : meal]))
  }])) as StoreProductDraft['weeklyWeeks'];
  const first = Object.values(weeklyWeeks).sort((a, b) => a.startMonday.localeCompare(b.startMonday))[0];
  const cover = first?.meals.mon;
  return { ...draft, weeklyWeeks, weeklyMeals: undefined, photoUrl: typeof cover === 'object' ? cover.photoUrl : draft.photoUrl };
};

export const updateHealthyLunchMeal = (meal: import('./types').HealthyLunchMeal, patch: Partial<import('./types').HealthyLunchMeal>): import('./types').HealthyLunchMeal => {
  const nextMeal = { ...meal, ...patch };
  if (Object.hasOwn(patch, 'recipeId') && patch.recipeId === undefined) delete nextMeal.recipeId;
  return nextMeal;
};

/** Recipe display data is copied into the menu; selling price and order snapshots stay independent. */
export const syncHealthyLunchRecipe = (meal: import('./types').HealthyLunchMeal, recipe: Recipe, nutrition?: RecipeNutritionSummary): import('./types').HealthyLunchMeal => {
  const display = getReadyToSellProductDraft(recipe, nutrition);
  return { ...meal, recipeId: recipe.id, name: display.name || meal.name,
    photoUrl: recipe.imageUrl || recipe.coverImage || meal.photoUrl,
    calories: display.calories,
    description: recipe.story?.trim().slice(0, 1200) || display.description || meal.description };
};
