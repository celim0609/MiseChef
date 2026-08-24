import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { PublicDiscoverStoreSummary } from '../publicDiscoverModel';

const listFeaturedStores = async (): Promise<PublicDiscoverStoreSummary[]> => {
  if (!functions) return [];
  const loadDiscoverContent = httpsCallable<Record<string, never>, { stores?: unknown[] }>(
    functions,
    'getPublicDiscoverContent'
  );
  const result = await loadDiscoverContent({});

  return Array.isArray(result.data.stores)
    ? result.data.stores.flatMap(value => {
      if (!value || typeof value !== 'object') return [];
      const source = value as Record<string, unknown>;
      const slug = typeof source.slug === 'string' ? source.slug : '';
      const name = typeof source.name === 'string' ? source.name : '';
      if (!slug || !name) return [];
      const products = Array.isArray(source.products)
        ? source.products.flatMap(productValue => {
          if (!productValue || typeof productValue !== 'object') return [];
          const product = productValue as Record<string, unknown>;
          const id = typeof product.id === 'string' ? product.id : '';
          const productName = typeof product.name === 'string' ? product.name : '';
          if (!id || !productName) return [];
          return [{
            id,
            name: productName,
            description: typeof product.description === 'string' ? product.description : '',
            ...(typeof product.imageUrl === 'string' && product.imageUrl ? { imageUrl: product.imageUrl } : {})
          }];
        })
        : [];
      return [{
        slug,
        name,
        description: typeof source.description === 'string' ? source.description : '',
        ...(typeof source.imageUrl === 'string' && source.imageUrl ? { imageUrl: source.imageUrl } : {}),
        products
      }];
    })
    : [];
};

export const publicDiscoverService = {
  listFeaturedStores
};
