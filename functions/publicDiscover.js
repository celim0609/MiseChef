export const PUBLIC_DISCOVER_STORE_SLUGS = ['misechef-s-grab-go-store'];

const readString = value => typeof value === 'string' ? value : '';

export const buildPublicDiscoverStoreSummary = ({ store, products }) => ({
  slug: readString(store.slug),
  name: readString(store.name),
  description: readString(store.description),
  imageUrl: readString(store.coverImageUrl) || readString(store.logoUrl),
  products: products
    .filter(product => product.available === true)
    .map(product => ({
      id: readString(product.id),
      name: readString(product.name),
      description: readString(product.description),
      imageUrl: readString(product.photoUrl)
    }))
    .filter(product => product.id && product.name)
});

export const loadPublicDiscoverStores = async ({ loadStore, loadAvailableProducts }) => {
  const stores = [];
  for (const slug of PUBLIC_DISCOVER_STORE_SLUGS) {
    const store = await loadStore(slug);
    if (!store) continue;
    const products = await loadAvailableProducts(store.id);
    const summary = buildPublicDiscoverStoreSummary({ store, products });
    if (summary.slug && summary.name) stores.push(summary);
  }
  return stores;
};
