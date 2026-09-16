export const toStoreSlug = value => String(value)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'store';

export const createStoreProductSlug = (name, productId) => {
  const nameSlug = toStoreSlug(name).slice(0, 60) || 'product';
  // Firestore-generated document IDs are URL-safe and make this immutable slug
  // collision-free without introducing a mutable name lookup contract.
  const idSlug = String(productId).trim();
  return idSlug ? `${nameSlug}-${idSlug}`.slice(0, 100) : nameSlug;
};
