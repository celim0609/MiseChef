const SITE_NAME = 'MiseChef';
const DEFAULT_STORE_DESCRIPTION = 'Browse this MiseChef Store and order ahead for pickup.';
const DEFAULT_STORE_IMAGE_PATH = '/assets/store-share-default.png';
const MAX_PUBLIC_TEXT_LENGTH = 5000;

const readPublicText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, MAX_PUBLIC_TEXT_LENGTH) : fallback;
};

const escapeHtmlAttribute = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const toHttpsImageUrl = value => {
  const candidate = readPublicText(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
};

const withStoreImageVersion = (imageUrl, updatedAt) => {
  if (!imageUrl) return '';
  const version = readPublicText(updatedAt);
  if (!version) return imageUrl;
  const url = new URL(imageUrl);
  url.searchParams.set('misechef_store_v', version);
  return url.toString();
};

const normalizeOrigin = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
};

export const resolveStoreRequestOrigin = ({ host, forwardedProto, projectId, configuredOrigin = '' }) => {
  const fallbackOrigin = normalizeOrigin(configuredOrigin)
    || (projectId ? `https://${projectId}.web.app` : 'https://misechef.ai');
  const normalizedHost = readPublicText(host).toLowerCase().replace(/:\d+$/, '');
  if (!normalizedHost) return fallbackOrigin;

  const allowedHosts = new Set();
  if (projectId) {
    allowedHosts.add(`${projectId}.web.app`);
    allowedHosts.add(`${projectId}.firebaseapp.com`);
  }
  const configuredHost = normalizeOrigin(configuredOrigin);
  if (configuredHost) allowedHosts.add(new URL(configuredHost).host.toLowerCase());
  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') {
    const protocol = forwardedProto === 'https' ? 'https' : 'http';
    return `${protocol}://${readPublicText(host).toLowerCase()}`;
  }
  return allowedHosts.has(normalizedHost) ? `https://${normalizedHost}` : fallbackOrigin;
};

export const buildStoreSocialMetadata = ({ store, origin, slug }) => {
  const safeOrigin = normalizeOrigin(origin) || 'https://misechef.ai';
  const canonicalSlug = readPublicText(store?.slug) || readPublicText(slug);
  const canonicalUrl = new URL(`/store/${encodeURIComponent(canonicalSlug)}`, safeOrigin).toString();
  const title = readPublicText(store?.name, 'MiseChef Store');
  const description = readPublicText(store?.description, DEFAULT_STORE_DESCRIPTION);
  const storeImage = toHttpsImageUrl(store?.coverImageUrl) || toHttpsImageUrl(store?.logoUrl);
  const image = storeImage
    ? withStoreImageVersion(storeImage, store?.updatedAt)
    : new URL(DEFAULT_STORE_IMAGE_PATH, safeOrigin).toString();

  return { title, description, image, canonicalUrl, siteName: SITE_NAME };
};

export const buildProductSocialMetadata = ({ store, product, origin, slug, productSlug }) => {
  const safeOrigin = normalizeOrigin(origin) || 'https://misechef.ai';
  const canonicalStoreSlug = readPublicText(store?.slug) || readPublicText(slug);
  const canonicalProductSlug = readPublicText(product?.productSlug) || readPublicText(productSlug);
  const canonicalUrl = new URL(`/store/${encodeURIComponent(canonicalStoreSlug)}/product/${encodeURIComponent(canonicalProductSlug)}`, safeOrigin).toString();
  const productName = readPublicText(product?.name, 'Product');
  const storeName = readPublicText(store?.name, 'MiseChef Store');
  const price = Number(product?.price);
  const currency = ['MYR', 'SGD'].includes(readPublicText(store?.currency)) ? readPublicText(store?.currency) : 'MYR';
  const priceText = Number.isFinite(price) && price >= 0
    ? new Intl.NumberFormat('en', { style: 'currency', currency }).format(price)
    : '';
  const description = readPublicText(product?.description, [productName, priceText, `from ${storeName}`].filter(Boolean).join(' · '));
  const productImage = toHttpsImageUrl(product?.socialImageUrl) || toHttpsImageUrl(product?.photoUrl);
  const storeImage = toHttpsImageUrl(store?.coverImageUrl) || toHttpsImageUrl(store?.logoUrl);
  const image = productImage
    ? withStoreImageVersion(productImage, product?.updatedAt)
    : storeImage
      ? withStoreImageVersion(storeImage, store?.updatedAt)
      : new URL(DEFAULT_STORE_IMAGE_PATH, safeOrigin).toString();
  return { title: `${productName} | ${storeName}`, description, image, canonicalUrl, siteName: SITE_NAME, type: 'product' };
};

const promotionOffer = promotion => {
  if (promotion?.type === 'percentage') return `${Number(promotion.percentageOff)}% off`;
  if (promotion?.type === 'fixed_amount') return `${Number(promotion.fixedAmountOff)} off each item`;
  if (promotion?.type === 'buy_x_get_y') return `Buy ${Number(promotion.buyQuantity)} get ${Number(promotion.getQuantity)} free`;
  return 'Special offer';
};

export const buildPromotionSocialMetadata = ({ store, promotion, origin, slug, promotionId }) => {
  const safeOrigin = normalizeOrigin(origin) || 'https://misechef.ai';
  const canonicalStoreSlug = readPublicText(store?.slug) || readPublicText(slug);
  const canonicalPromotionId = readPublicText(promotion?.id) || readPublicText(promotionId);
  const canonicalUrl = new URL(`/store/${encodeURIComponent(canonicalStoreSlug)}/promotion/${encodeURIComponent(canonicalPromotionId)}`, safeOrigin).toString();
  const promotionName = readPublicText(promotion?.name, 'Store offer');
  const storeName = readPublicText(store?.name, 'MiseChef Store');
  const offer = promotionOffer(promotion);
  const image = toHttpsImageUrl(promotion?.imageUrl)
    || toHttpsImageUrl(store?.coverImageUrl)
    || toHttpsImageUrl(store?.logoUrl)
    || new URL(DEFAULT_STORE_IMAGE_PATH, safeOrigin).toString();
  return { title: `${promotionName} | ${storeName}`, description: `${offer} · ${promotionName}`, image: withStoreImageVersion(image, promotion?.updatedAt || store?.updatedAt), canonicalUrl, siteName: SITE_NAME, type: 'website' };
};

export const renderStoreSocialTags = metadata => {
  const title = escapeHtmlAttribute(metadata.title);
  const description = escapeHtmlAttribute(metadata.description);
  const image = escapeHtmlAttribute(metadata.image);
  const canonicalUrl = escapeHtmlAttribute(metadata.canonicalUrl);
  const siteName = escapeHtmlAttribute(metadata.siteName);
  return [
    '<!-- MISECHEF_STORE_SOCIAL_META_START -->',
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:secure_url" content="${image}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:type" content="${escapeHtmlAttribute(metadata.type || 'website')}" />`,
    `<meta property="og:site_name" content="${siteName}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    '<!-- MISECHEF_STORE_SOCIAL_META_END -->'
  ].join('\n    ');
};

export const injectStoreSocialMetadata = (appShell, metadata) => {
  if (typeof appShell !== 'string' || !/<\/head>/i.test(appShell)) {
    throw new Error('The public application HTML shell is unavailable.');
  }
  const pageTitle = `${metadata.title} | ${metadata.siteName}`;
  const withTitle = /<title>.*?<\/title>/is.test(appShell)
    ? appShell.replace(/<title>.*?<\/title>/is, `<title>${escapeHtmlAttribute(pageTitle)}</title>`)
    : appShell;
  return withTitle.replace(/<\/head>/i, `    ${renderStoreSocialTags(metadata)}\n  </head>`);
};

const readStoreRequest = path => {
  const match = /^\/store\/([^/?#]+)(?:\/(product|promotion)\/([^/?#]+))?\/?$/.exec(readPublicText(path));
  if (!match) return '';
  try {
    const slug = decodeURIComponent(match[1]).trim().slice(0, 240);
    const routeType = match[2] || '';
    const routeValue = match[3] ? decodeURIComponent(match[3]).trim().slice(0, 240) : '';
    return slug ? { slug, productSlug: routeType === 'product' ? routeValue : '', promotionId: routeType === 'promotion' ? routeValue : '' } : null;
  } catch {
    return null;
  }
};

export const createStoreSocialPreviewHandler = ({
  loadStore,
  loadProduct = async () => null,
  loadPromotion = async () => null,
  loadAppShell,
  projectId = '',
  configuredOrigin = '',
  logError = () => {}
}) => async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.status(405).set('Allow', 'GET, HEAD').send('Method not allowed');
    return;
  }

  const route = readStoreRequest(request.path || request.url || '');
  if (!route) {
    response.status(404).send('Store not found');
    return;
  }

  try {
    const origin = resolveStoreRequestOrigin({
      host: request.get?.('x-forwarded-host') || request.get?.('host') || '',
      forwardedProto: request.get?.('x-forwarded-proto') || request.protocol || '',
      projectId,
      configuredOrigin
    });
    const [store, appShell] = await Promise.all([loadStore(route.slug), loadAppShell()]);
    const product = route.productSlug && store ? await loadProduct(store.id, route.productSlug) : null;
    const promotion = route.promotionId && store ? await loadPromotion(store.id, route.promotionId) : null;
    const metadata = product
      ? buildProductSocialMetadata({ store, product, origin, slug: route.slug, productSlug: route.productSlug })
      : promotion
        ? buildPromotionSocialMetadata({ store, promotion, origin, slug: route.slug, promotionId: route.promotionId })
        : buildStoreSocialMetadata({ store, origin, slug: route.slug });
    const html = injectStoreSocialMetadata(appShell, metadata);

    response.status(200);
    response.set('Content-Type', 'text/html; charset=utf-8');
    response.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
    response.set('Vary', 'Host');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.method === 'HEAD') response.end();
    else response.send(html);
  } catch (error) {
    logError(error, { slug: route.slug, productSlug: route.productSlug, promotionId: route.promotionId });
    response.status(500).send('This Store is temporarily unavailable.');
  }
};

export const STORE_SOCIAL_DEFAULTS = {
  description: DEFAULT_STORE_DESCRIPTION,
  imagePath: DEFAULT_STORE_IMAGE_PATH,
  siteName: SITE_NAME
};
