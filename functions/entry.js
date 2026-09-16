export * from './index.js';

import { readFileSync } from 'node:fs';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { createRecipeSocialPreviewHandler } from './recipeSocialPreview.js';

const REGION = 'us-central1';
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const db = getFirestore();
const appShell = readFileSync(new URL('./generated/publicStoreAppShell.html', import.meta.url), 'utf8');

const toPublicSlug = value => String(value || '')
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const loadPublicRecipe = async routeValue => {
  const direct = await db.collection('publicRecipes').doc(routeValue).get();
  if (direct.exists) return { id: direct.id, ...direct.data() };

  // Public discovery already supports title slugs. Keep the crawler route consistent
  // without reading the private recipes collection.
  const snapshot = await db.collection('publicRecipes').limit(100).get();
  const match = snapshot.docs.find(document => toPublicSlug(document.data()?.title) === routeValue);
  return match ? { id: match.id, ...match.data() } : null;
};

const recipePreviewHandler = createRecipeSocialPreviewHandler({
  projectId,
  configuredOrigin: process.env.PUBLIC_SITE_ORIGIN || '',
  loadRecipe: loadPublicRecipe,
  loadAppShell: async () => appShell,
  logError: (error, context) => logger.error('Public Recipe social preview failed', {
    ...context,
    message: error?.message || ''
  })
});

export const renderPublicRecipe = onRequest({
  region: REGION,
  invoker: 'public',
  timeoutSeconds: 10,
  memory: '256MiB',
  maxInstances: 20,
  concurrency: 80
}, recipePreviewHandler);
