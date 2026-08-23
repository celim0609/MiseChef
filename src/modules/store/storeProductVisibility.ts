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
  available: draft.available,
  optionGroupIds: [...draft.optionGroupIds],
  updatedAt
});
