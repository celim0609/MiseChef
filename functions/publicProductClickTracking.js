import { createHash } from 'node:crypto';
import { readPublicExternalUrl, sanitizePublicRecommendedProducts } from './publicRecipeProjection.js';
import { createPublicProductIntegrityRevision } from './publicProductIntegrity.js';

// Add approved registrable merchant domains here. Exact domains and their
// subdomains are accepted; lookalike suffixes are not.
export const APPROVED_MERCHANT_DOMAINS = Object.freeze(['s.shopee.sg']);

const RECIPE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PRODUCT_INDEX_PATTERN = /^(0|[1-9]\d?)$/;
const CLICK_PATH_PATTERN = /^\/go\/recipes\/([^/]+)\/products\/([^/]+)\/?$/;

const normalizeHostname = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\.+$/, '');

export const isApprovedMerchantHostname = (hostname, approvedDomains = APPROVED_MERCHANT_DOMAINS) => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) return false;

  return approvedDomains.some(domain => {
    const normalizedDomain = normalizeHostname(domain);
    return normalizedDomain
      && (normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`));
  });
};

export const normalizeProductIdentifier = value => {
  const normalizedName = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalizedName || createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
};

export const toPublicRecipeSlug = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const parseClickPath = path => {
  const match = String(path || '').match(CLICK_PATH_PATTERN);
  if (!match) return null;

  let recipeId;
  try {
    recipeId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  if (!RECIPE_ID_PATTERN.test(recipeId) || !PRODUCT_INDEX_PATTERN.test(match[2])) return null;
  return { recipeId, productIndex: Number(match[2]) };
};

const setResponseHeaders = response => {
  response.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow'
  });
};

const sendNotFound = response => response.status(404).type('text/plain').send('Not found');

export const createPublicProductClickHandler = ({
  loadPublicRecipe,
  loadRedirectManifest = async () => null,
  recordClick,
  serverTimestamp,
  approvedDomains = APPROVED_MERCHANT_DOMAINS
}) => async (request, response) => {
  setResponseHeaders(response);
  if (request.method !== 'GET') return sendNotFound(response);

  const route = parseClickPath(request.path || request.url);
  if (!route) return sendNotFound(response);

  let recipe;
  try {
    recipe = await loadPublicRecipe(route.recipeId);
  } catch {
    return sendNotFound(response);
  }

  if (!recipe || recipe.visibility !== 'public') return sendNotFound(response);

  const rawProducts = Array.isArray(recipe.recommendedProducts) ? recipe.recommendedProducts : [];
  const rawProduct = rawProducts[route.productIndex];
  const [product] = sanitizePublicRecommendedProducts(rawProduct ? [rawProduct] : []);
  if (!product) return sendNotFound(response);

  let redirectManifest;
  try {
    redirectManifest = await loadRedirectManifest(route.recipeId);
  } catch {
    return sendNotFound(response);
  }

  const recipeRevision = String(recipe.revision || '').trim();
  const manifestRevision = String(redirectManifest?.revision || '').trim();
  const hasIntegrityState = Boolean(recipeRevision || manifestRevision || redirectManifest);
  let destinationUrl = '';
  let manifestEntry = null;

  if (hasIntegrityState) {
    const manifestProducts = Array.isArray(redirectManifest?.products) ? redirectManifest.products : [];
    manifestEntry = manifestProducts[route.productIndex];
    if (
      !recipeRevision
      || !manifestRevision
      || recipeRevision !== manifestRevision
      || manifestProducts.length !== rawProducts.length
      || !manifestEntry
      || typeof manifestEntry !== 'object'
      || manifestEntry.productIndex !== route.productIndex
      || String(manifestEntry.productName || '').trim() !== product.name
    ) {
      return sendNotFound(response);
    }
    const publicRecipeForIntegrity = { ...recipe };
    delete publicRecipeForIntegrity.revision;
    const computedRevision = createPublicProductIntegrityRevision({
      recipeId: route.recipeId,
      publicRecipe: publicRecipeForIntegrity,
      redirectProducts: manifestProducts
    });
    if (computedRevision !== recipeRevision) return sendNotFound(response);
    destinationUrl = readPublicExternalUrl(manifestEntry.destinationUrl);
  } else {
    // Preserve the pre-44G legacy projection path exactly. New creator-specific
    // products always use the private revision-matched redirect manifest.
    destinationUrl = readPublicExternalUrl(product.url);
  }

  if (!destinationUrl) return sendNotFound(response);

  const parsedDestination = new URL(destinationUrl);
  if (parsedDestination.username || parsedDestination.password) return sendNotFound(response);
  if (!isApprovedMerchantHostname(parsedDestination.hostname, approvedDomains)) return sendNotFound(response);

  const click = {
    recipeId: route.recipeId,
    productId: normalizeProductIdentifier(product.name),
    productName: product.name,
    destinationHostname: normalizeHostname(parsedDestination.hostname),
    clickedAt: serverTimestamp(),
    source: 'public_recipe'
  };
  const recipeSlug = toPublicRecipeSlug(recipe.title);
  if (recipeSlug) click.recipeSlug = recipeSlug;
  if (manifestEntry?.attributionType === 'creator_affiliate') {
    const creatorCode = String(manifestEntry.creatorCode || '').trim();
    const catalogProductId = String(manifestEntry.catalogProductId || '').trim();
    if (!/^MC[0-9]{3,6}$/.test(creatorCode) || !/^[A-Za-z0-9_-]{1,128}$/.test(catalogProductId)) {
      return sendNotFound(response);
    }
    click.creatorCode = creatorCode;
    click.catalogProductId = catalogProductId;
    click.attributionType = 'creator_affiliate';
  }

  try {
    await recordClick(click);
  } catch {
    // Tracking must never prevent a validated recommendation from opening.
  }

  return response.redirect(302, destinationUrl);
};
