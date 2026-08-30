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
    '<meta property="og:type" content="website" />',
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

const readStoreSlug = path => {
  const match = /^\/store\/([^/?#]+)\/?$/.exec(readPublicText(path));
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim().slice(0, 240);
  } catch {
    return '';
  }
};

export const createStoreSocialPreviewHandler = ({
  loadStore,
  loadAppShell,
  projectId = '',
  configuredOrigin = '',
  logError = () => {}
}) => async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.status(405).set('Allow', 'GET, HEAD').send('Method not allowed');
    return;
  }

  const slug = readStoreSlug(request.path || request.url || '');
  if (!slug) {
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
    const [store, appShell] = await Promise.all([loadStore(slug), loadAppShell()]);
    const metadata = buildStoreSocialMetadata({ store, origin, slug });
    const html = injectStoreSocialMetadata(appShell, metadata);

    response.status(200);
    response.set('Content-Type', 'text/html; charset=utf-8');
    response.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
    response.set('Vary', 'Host');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.method === 'HEAD') response.end();
    else response.send(html);
  } catch (error) {
    logError(error, { slug });
    response.status(500).send('This Store is temporarily unavailable.');
  }
};

export const STORE_SOCIAL_DEFAULTS = {
  description: DEFAULT_STORE_DESCRIPTION,
  imagePath: DEFAULT_STORE_IMAGE_PATH,
  siteName: SITE_NAME
};
