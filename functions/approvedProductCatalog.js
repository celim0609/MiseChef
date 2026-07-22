import { readPublicExternalUrl } from './publicRecipeProjection.js';
import { APPROVED_MERCHANT_DOMAINS } from './publicProductClickTracking.js';

export const APPROVED_CATALOG_HOSTNAME = APPROVED_MERCHANT_DOMAINS[0];
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const readString = value => typeof value === 'string' ? value.trim() : '';

export const normalizeRecommendedProductIds = value => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const rawId of value) {
    const id = readString(rawId);
    if (!PRODUCT_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === 100) break;
  }
  return ids;
};

const readApprovedDestination = value => {
  const url = readPublicExternalUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  return parsed.protocol === 'https:'
    && parsed.hostname.toLowerCase() === APPROVED_CATALOG_HOSTNAME
    && !parsed.username
    && !parsed.password
    ? parsed.toString()
    : '';
};

export const sanitizeApprovedCatalogProduct = product => {
  if (!product || typeof product !== 'object') return null;
  const name = readString(product.name);
  const url = readApprovedDestination(product.affiliateUrl);
  if (!name || !url || readString(product.merchantHostname).toLowerCase() !== APPROVED_CATALOG_HOSTNAME) return null;

  const sanitized = { name, url };
  const image = readString(product.imageUrl);
  if (image) sanitized.image = image;
  return sanitized;
};

export const toApprovedProductSummary = (id, product) => {
  const sanitized = sanitizeApprovedCatalogProduct(product);
  if (!sanitized) return null;
  return {
    id,
    name: sanitized.name,
    ...(sanitized.image ? { imageUrl: sanitized.image } : {}),
    active: product.active === true
  };
};

export const resolveApprovedCatalogProducts = async (ids, loadProduct) => {
  const normalizedIds = normalizeRecommendedProductIds(ids);
  const loaded = await Promise.all(normalizedIds.map(async id => ({ id, product: await loadProduct(id) })));
  return loaded.flatMap(({ product }) => {
    if (product?.active !== true) return [];
    const sanitized = sanitizeApprovedCatalogProduct(product);
    return sanitized ? [sanitized] : [];
  });
};

export const combineRecommendedProducts = (legacyProducts, catalogProducts) => [
  ...(Array.isArray(legacyProducts) ? legacyProducts : []),
  ...(Array.isArray(catalogProducts) ? catalogProducts : [])
];
