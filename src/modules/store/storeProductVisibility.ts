import type { StoreProduct, StoreProductDraft } from './types';

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

export const getStoreProductEditorDraft = (product: StoreProduct): StoreProductDraft => ({
  photoUrl: product.photoUrl,
  name: product.name,
  description: product.description,
  price: product.price,
  ...(product.linkedRecipeId ? { linkedRecipeId: product.linkedRecipeId } : {}),
  ...(product.linkedRecipeTitle ? { linkedRecipeTitle: product.linkedRecipeTitle } : {}),
  ...(Number.isFinite(product.estimatedCost) ? { estimatedCost: product.estimatedCost } : {}),
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

export type StoreProductValidationTarget = 'photo' | 'name' | 'description' | 'price' | 'options';

export const getStoreProductValidationTarget = (
  validationMessage: string
): StoreProductValidationTarget => {
  const message = validationMessage.toLocaleLowerCase();
  if (message.includes('photo')) return 'photo';
  if (message.includes('product name')) return 'name';
  if (message.includes('description')) return 'description';
  if (message.includes('price')) return 'price';
  return 'options';
};

export const buildUpdatedStoreProduct = (
  product: StoreProduct,
  draft: StoreProductDraft,
  updatedAt: string
): StoreProduct => ({
  ...product,
  photoUrl: draft.photoUrl.trim(),
  name: draft.name.trim(),
  description: draft.description.trim(),
  price: draft.price,
  linkedRecipeId: draft.linkedRecipeId,
  linkedRecipeTitle: draft.linkedRecipeTitle,
  estimatedCost: draft.estimatedCost,
  available: draft.available,
  optionGroupIds: [...draft.optionGroupIds],
  updatedAt
});
