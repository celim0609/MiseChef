import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  PRODUCT_SOCIAL_IMAGE,
  buildPublicStorageUrl,
  downloadExternalImage,
  getStorageObjectPath,
  isMissingProductSocialImage,
  isSafeExternalImageUrl,
  optimizeProductSocialImage
} from './backfillProductSocialImages.mjs';
import {
  PRODUCTION_FIRESTORE_READ_LIMIT_CEILINGS,
  createAuthenticatedProductionFirestoreRestClient,
  runProductionFirestoreRead
} from './productionFirestoreReadSafety.mjs';
import { createStoreProductSlug } from '../src/modules/store/storeProductSlug.mjs';

export const PRODUCTION_PROJECT_ID = 'misechef-fa4bf';
export const PRODUCTION_DATABASE_ID = '(default)';
export const PRODUCTION_WORKSPACE_ID = 'stShXwdbIzOh14ItTtQ4hRB5oBz1';
export const EXPECTED_PRODUCT_IDS = Object.freeze([
  '8E9sgz6vMEZ8pqUow1y4', 'A4I6ndOfjPT3HC5Tie4M', 'BjdAGwE8Z6g5nxv21gNH',
  'DMBw9VRrnRgW3nomSSQx', 'Ib7P7RqPQDolgxsYtsIR', 'J4TXNwqBm4WwfXSVkTEQ',
  'NE43JgofeVpd2uQOwdqm', 'NEFCNFyhdw7TrNm4GsXd', 'NjTZyXDbZlbi3CJbiean',
  'Nw7BAfW4X9zRWay2MNIN', 'QwgQUPjfz3NOWZCPUKt9', 'XR6BLMU2re862p3kSpT8',
  'YO4tnhuw5Rtt7WrWtGjy', 'ZpiIICHaS7XNnItSJlEP', 'bXuaMOUxbVvj7oT6XHNd',
  'fDMoLhOpROihFPLsLtZR', 'jDVAb1n6AsHKr5Keiq5O', 'sRwaeRC5OCYxxNdtkvRd'
]);
export const WRITE_FIELD_ALLOWLIST = Object.freeze(['productSlug', 'socialImageUrl']);

const READ_LIMITS = Object.freeze({
  ...PRODUCTION_FIRESTORE_READ_LIMIT_CEILINGS,
  pageSize: 25, maxPages: 2, maxPagesPerCollection: 2,
  maxDocumentsPerCollection: 25, maxDocuments: 25, maxRequests: 2, maxCollectionIds: 1
});

const fieldString = (fields, field) => typeof fields?.[field]?.stringValue === 'string' ? fields[field].stringValue : '';
const documentId = document => {
  const match = /\/documents\/storeProducts\/([^/]+)$/.exec(String(document?.name || ''));
  if (!match) throw new Error('Production Firestore returned a document outside storeProducts.');
  return decodeURIComponent(match[1]);
};
const canonical = value => JSON.stringify(value, (_, nested) => {
  if (!nested || Array.isArray(nested) || typeof nested !== 'object') return nested;
  return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
});
const protectedFields = fields => Object.fromEntries(Object.entries(fields || {}).filter(([field]) => !WRITE_FIELD_ALLOWLIST.includes(field)));

export const assertProductionMigrationAuthority = ({ projectId, databaseId, workspaceId, deploymentTarget }) => {
  if (deploymentTarget !== 'production') throw new Error('Set FIREBASE_DEPLOY_TARGET=production for this Production-only migration.');
  if (projectId !== PRODUCTION_PROJECT_ID) throw new Error(`Production migration is pinned to ${PRODUCTION_PROJECT_ID}.`);
  if (databaseId !== PRODUCTION_DATABASE_ID) throw new Error('Production migration is pinned to Firestore database (default).');
  if (workspaceId !== PRODUCTION_WORKSPACE_ID) throw new Error(`Production migration is pinned to workspace ${PRODUCTION_WORKSPACE_ID}.`);
};

export const buildMigrationPlan = documents => {
  if (documents.length !== EXPECTED_PRODUCT_IDS.length) throw new Error(`Expected exactly ${EXPECTED_PRODUCT_IDS.length} storeProducts documents, received ${documents.length}.`);
  const products = documents.map(document => ({
    id: documentId(document), fields: document.fields || {},
    name: fieldString(document.fields, 'name'), photoUrl: fieldString(document.fields, 'photoUrl'),
    workspaceId: fieldString(document.fields, 'workspaceId'),
    productSlug: fieldString(document.fields, 'productSlug'), socialImageUrl: fieldString(document.fields, 'socialImageUrl')
  }));
  const expected = new Set(EXPECTED_PRODUCT_IDS);
  const actual = new Set(products.map(product => product.id));
  if (actual.size !== expected.size || [...expected].some(id => !actual.has(id))) throw new Error('Production Product IDs do not exactly match the approved 18-Product migration scope.');
  if (products.some(product => product.workspaceId !== PRODUCTION_WORKSPACE_ID)) throw new Error('Production Product workspace scope mismatch.');
  if (products.some(product => product.productSlug || product.socialImageUrl)) throw new Error('Refusing to overwrite an existing productSlug or socialImageUrl.');
  const proposedSlugs = new Set(products.map(product => createStoreProductSlug(product.name, product.id)));
  if (proposedSlugs.size !== products.length) throw new Error('Proposed Product slug collision.');
  const candidates = products.map(product => ({
    ...product,
    proposedSlug: createStoreProductSlug(product.name, product.id),
    sourcePath: getStorageObjectPath(product.photoUrl, `${PRODUCTION_PROJECT_ID}.firebasestorage.app`),
    externalSourceUrl: isSafeExternalImageUrl(product.photoUrl) ? product.photoUrl : '',
    socialPath: `stores/${PRODUCTION_WORKSPACE_ID}/products/${product.id}/social.jpg`,
    protectedFields: protectedFields(product.fields)
  }));
  return candidates;
};

export const verifyPostWrite = (documents, originalProtected) => {
  if (documents.length !== EXPECTED_PRODUCT_IDS.length) throw new Error('Post-write Product count mismatch.');
  const products = documents.map(document => ({ id: documentId(document), fields: document.fields || {} }));
  const actual = new Set(products.map(product => product.id));
  if (actual.size !== EXPECTED_PRODUCT_IDS.length || EXPECTED_PRODUCT_IDS.some(id => !actual.has(id))) throw new Error('Post-write Product scope mismatch.');
  for (const product of products) {
    if (!fieldString(product.fields, 'productSlug') || !fieldString(product.fields, 'socialImageUrl')) throw new Error(`Post-write Product fields missing for ${product.id}.`);
    if (canonical(protectedFields(product.fields)) !== originalProtected.get(product.id)) throw new Error(`Post-write unrelated fields changed for ${product.id}.`);
  }
};

const assertSources = async (candidates, bucket) => {
  const invalid = [];
  for (const product of candidates) {
    if (product.sourcePath) {
      const [exists] = await bucket.file(product.sourcePath).exists();
      if (exists) continue;
    } else if (product.externalSourceUrl) {
      try { await downloadExternalImage(product.externalSourceUrl); continue; } catch {}
    }
    invalid.push(product.id);
  }
  if (invalid.length) throw new Error(`Invalid or missing Product source images: ${invalid.join(', ')}.`);
};

const readProducts = async () => {
  const runId = `production-product-migration-${randomUUID()}`;
  const require = createRequire(import.meta.url);
  const { GoogleAuth } = require('../functions/node_modules/google-auth-library');
  const auth = new GoogleAuth({ projectId: PRODUCTION_PROJECT_ID, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const firestore = createAuthenticatedProductionFirestoreRestClient(options => auth.request(options));
  return runProductionFirestoreRead({
    projectId: PRODUCTION_PROJECT_ID,
    confirmation: `READ PRODUCTION FIRESTORE ${PRODUCTION_PROJECT_ID} FOR ${runId}`,
    firestore, limits: READ_LIMITS, runId
  }, reader => reader.listCollection('storeProducts'));
};

const main = async () => {
  const projectId = process.argv.find(value => value.startsWith('--project='))?.slice(10);
  const databaseId = process.argv.find(value => value.startsWith('--database='))?.slice(11);
  const workspaceId = process.argv.find(value => value.startsWith('--workspace-id='))?.slice(15);
  const execute = process.argv.includes('--execute');
  assertProductionMigrationAuthority({ projectId, databaseId, workspaceId, deploymentTarget: process.env.FIREBASE_DEPLOY_TARGET });
  const require = createRequire(import.meta.url);
  const { initializeApp, deleteApp } = require(`${process.cwd()}/functions/node_modules/firebase-admin/lib/app/index.js`);
  const { getFirestore } = require(`${process.cwd()}/functions/node_modules/firebase-admin/lib/firestore/index.js`);
  const { getStorage } = require(`${process.cwd()}/functions/node_modules/firebase-admin/lib/storage/index.js`);
  const app = initializeApp({ projectId }, 'production-legacy-product-migration');
  const db = getFirestore(app, databaseId);
  const bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`);
  try {
    const documents = await readProducts();
    const plan = buildMigrationPlan(documents);
    await assertSources(plan, bucket);
    console.log(JSON.stringify({ mode: execute ? 'EXECUTE' : 'DRY_RUN', projectId, databaseId, workspaceId,
      scanned: plan.length, missingProductSlug: plan.length, missingSocialImageUrl: plan.length, wouldUpdate: plan.length,
      writeFieldAllowlist: WRITE_FIELD_ALLOWLIST, socialImage: PRODUCT_SOCIAL_IMAGE }, null, 2));
    if (!execute) return;
    const originalProtected = new Map(plan.map(product => [product.id, canonical(product.protectedFields)]));
    for (const product of plan) {
      const source = product.sourcePath ? (await bucket.file(product.sourcePath).download())[0] : await downloadExternalImage(product.externalSourceUrl);
      const image = await optimizeProductSocialImage(source);
      const token = randomUUID();
      await bucket.file(product.socialPath).save(image, { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } } });
      const socialImageUrl = buildPublicStorageUrl(bucket.name, product.socialPath, token);
      await db.runTransaction(async transaction => {
        const ref = db.doc(`storeProducts/${product.id}`);
        const latest = await transaction.get(ref);
        if (!latest.exists || !isMissingProductSocialImage(latest.data()) || latest.data().productSlug) throw new Error(`Refusing to overwrite Product ${product.id}.`);
        transaction.update(ref, { productSlug: product.proposedSlug, socialImageUrl });
      });
    }
    verifyPostWrite(await readProducts(), originalProtected);
  } finally { await deleteApp(app); }
};

if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
