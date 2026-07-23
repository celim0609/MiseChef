import { readPublicExternalUrl } from './publicRecipeProjection.js';
import { APPROVED_CATALOG_HOSTNAME, normalizeRecommendedProductIds, sanitizeApprovedCatalogDisplay } from './approvedProductCatalog.js';

const CREATOR_CODE_PATTERN = /^MC[0-9]{3,6}$/;
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const readString = value => typeof value === 'string' ? value.trim() : '';

export const normalizeCreatorCode = value => {
  const code = readString(value).toUpperCase();
  return CREATOR_CODE_PATTERN.test(code) ? code : '';
};

export const sanitizeVerifiedCreatorProductLink = (link, creatorCode, productId) => {
  if (!link || typeof link !== 'object' || link.active !== true) return null;
  const normalizedCreatorCode = normalizeCreatorCode(creatorCode);
  const normalizedProductId = readString(productId);
  if (!normalizedCreatorCode || !PRODUCT_ID_PATTERN.test(normalizedProductId)) return null;
  if (readString(link.creatorCode) !== normalizedCreatorCode || readString(link.productId) !== normalizedProductId) return null;
  if (!link.verifiedAt || !readString(link.verifiedBy)) return null;

  const url = readPublicExternalUrl(link.affiliateUrl);
  if (!url) return null;
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== APPROVED_CATALOG_HOSTNAME
    || parsed.username
    || parsed.password
    || readString(link.merchantHostname).toLowerCase() !== APPROVED_CATALOG_HOSTNAME
  ) {
    return null;
  }

  return {
    creatorCode: normalizedCreatorCode,
    catalogProductId: normalizedProductId,
    destinationUrl: parsed.toString(),
    destinationHostname: APPROVED_CATALOG_HOSTNAME
  };
};

export const resolveCreatorCatalogProducts = async ({
  creatorCode,
  productIds,
  loadCreatorProfile,
  loadProduct,
  loadCreatorProductLink
}) => {
  const normalizedCreatorCode = normalizeCreatorCode(creatorCode);
  if (!normalizedCreatorCode) return [];

  const profile = await loadCreatorProfile(normalizedCreatorCode);
  if (
    !profile
    || profile.active !== true
    || normalizeCreatorCode(profile.creatorCode) !== normalizedCreatorCode
    || !readString(profile.userId)
  ) {
    return [];
  }

  const ids = normalizeRecommendedProductIds(productIds);
  const loaded = await Promise.all(ids.map(async productId => ({
    productId,
    product: await loadProduct(productId),
    link: await loadCreatorProductLink(normalizedCreatorCode, productId)
  })));

  return loaded.flatMap(({ productId, product, link }) => {
    if (product?.active !== true) return [];
    const display = sanitizeApprovedCatalogDisplay(product);
    const redirect = sanitizeVerifiedCreatorProductLink(link, normalizedCreatorCode, productId);
    if (!display || !redirect) return [];
    return [{
      publicProduct: display,
      redirect: {
        attributionType: 'creator_affiliate',
        productIndex: -1,
        productName: display.name,
        ...redirect
      }
    }];
  });
};
