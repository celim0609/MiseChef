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
  available: product.available,
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
  available: draft.available,
  optionGroupIds: [...draft.optionGroupIds],
  updatedAt
});
