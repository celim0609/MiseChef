import { injectStoreSocialMetadata } from './storeSocialPreview.js';

const SITE_NAME = 'MiseChef';
const DEFAULT_DESCRIPTION = 'Discover this chef-made recipe on MiseChef.';
const DEFAULT_IMAGE_PATH = '/assets/store-share-default.png';
const MAX_TEXT_LENGTH = 5000;

const readText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, MAX_TEXT_LENGTH) : fallback;
};

const safeImageUrl = value => {
  const candidate = readText(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
};

const safeOrigin = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
  } catch { return ''; }
};

export const readRecipeRequest = path => {
  const match = /^\/recipes\/([^/?#]+)\/?$/.exec(readText(path));
  if (!match) return null;
  try {
    const recipeId = decodeURIComponent(match[1]).trim().slice(0, 240);
    return recipeId ? { recipeId } : null;
  } catch { return null; }
};

export const buildRecipeSocialMetadata = ({ recipe, origin, recipeId }) => {
  const originValue = safeOrigin(origin) || 'https://misechef.ai';
  const title = readText(recipe?.title, 'MiseChef Recipe');
  const story = readText(recipe?.story);
  const chefName = readText(recipe?.chefName);
  const description = story || (chefName ? `A recipe by ${chefName} on MiseChef.` : DEFAULT_DESCRIPTION);
  const image = safeImageUrl(recipe?.coverImage) || new URL(DEFAULT_IMAGE_PATH, originValue).toString();
  const canonicalUrl = new URL(`/recipes/${encodeURIComponent(recipeId)}`, originValue).toString();
  return { title, description, image, canonicalUrl, siteName: SITE_NAME, type: 'article' };
};

export const createRecipeSocialPreviewHandler = ({ loadRecipe, loadAppShell, projectId = '', configuredOrigin = '', logError = () => {} }) => async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.status(405).set('Allow', 'GET, HEAD').send('Method not allowed');
    return;
  }
  const route = readRecipeRequest(request.path || request.url || '');
  if (!route) {
    response.status(404).send('Recipe not found');
    return;
  }
  try {
    const host = readText(request.get?.('x-forwarded-host') || request.get?.('host') || '').toLowerCase().replace(/:\d+$/, '');
    const configured = safeOrigin(configuredOrigin);
    const allowed = new Set([configured ? new URL(configured).host.toLowerCase() : '', projectId ? `${projectId}.web.app` : '', projectId ? `${projectId}.firebaseapp.com` : ''].filter(Boolean));
    const origin = allowed.has(host) ? `https://${host}` : configured || (projectId ? `https://${projectId}.web.app` : 'https://misechef.ai');
    const [recipe, appShell] = await Promise.all([loadRecipe(route.recipeId), loadAppShell()]);
    if (!recipe || recipe.visibility !== 'public') {
      response.status(404).send('Recipe not found');
      return;
    }
    const html = injectStoreSocialMetadata(appShell, buildRecipeSocialMetadata({ recipe, origin, recipeId: route.recipeId }));
    response.status(200);
    response.set('Content-Type', 'text/html; charset=utf-8');
    response.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
    response.set('Vary', 'Host');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.method === 'HEAD') response.end(); else response.send(html);
  } catch (error) {
    logError(error, { recipeId: route.recipeId });
    response.status(500).send('This Recipe is temporarily unavailable.');
  }
};
