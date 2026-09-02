#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  DESTINATION,
  DESTINATION_ID_OVERRIDES,
  EXCLUDED_COLLECTIONS,
  EXCLUDED_STORAGE_PREFIXES,
  EXPECTED_COUNTS,
  FIRESTORE_ALLOWLIST,
  MIGRATION_VERSION,
  PUBLIC_RECIPE_ASSET_PATHS,
  PUBLIC_RECIPE_IDS,
  SOURCE,
  STORAGE_ALLOWLIST
} from './authorizedBetaBusinessMigrationManifest.mjs';

const APPLY_CONFIRMATION = 'MIGRATE AUTHORIZED BETA BUSINESS';
const ROLLBACK_CONFIRMATION = 'ROLL BACK AUTHORIZED BETA BUSINESS';
const require = createRequire(import.meta.url);

export const getFirestoreCount = () => Object.values(FIRESTORE_ALLOWLIST)
  .reduce((total, documentIds) => total + documentIds.length, 0);

export const getDestinationPath = sourcePath => DESTINATION_ID_OVERRIDES[sourcePath] || sourcePath;

const readStringValue = value => value?.stringValue || '';
const stringValue = value => ({ stringValue: value });

const migrationProvenance = (sourcePath, fields) => ({
  mapValue: {
    fields: {
      migrationVersion: stringValue(MIGRATION_VERSION),
      sourceProjectId: stringValue(SOURCE.projectId),
      sourceWorkspaceId: stringValue(SOURCE.workspaceId),
      sourceDocumentPath: stringValue(sourcePath),
      originalUserId: stringValue(readStringValue(fields.userId)),
      originalCreatedBy: stringValue(readStringValue(fields.createdBy)),
      originalCreatedByName: stringValue(readStringValue(fields.createdByName))
    }
  }
});

const replaceSourceIdentifiers = value => value
  .replaceAll(SOURCE.projectId, DESTINATION.projectId)
  .replaceAll(SOURCE.bucket, DESTINATION.bucket)
  .replaceAll(SOURCE.ownerUid, DESTINATION.ownerUid)
  .replaceAll(SOURCE.workspaceId, DESTINATION.workspaceId);

const transformValue = value => {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return { ...value, stringValue: replaceSourceIdentifiers(value.stringValue) };
  if ('referenceValue' in value) return { ...value, referenceValue: replaceSourceIdentifiers(value.referenceValue) };
  if (value.arrayValue) {
    return {
      ...value,
      arrayValue: {
        ...value.arrayValue,
        values: (value.arrayValue.values || []).map(transformValue)
      }
    };
  }
  if (value.mapValue) {
    return {
      ...value,
      mapValue: {
        ...value.mapValue,
        fields: Object.fromEntries(Object.entries(value.mapValue.fields || {})
          .map(([key, child]) => [key, transformValue(child)]))
      }
    };
  }
  return structuredClone(value);
};

export const transformDocument = (sourcePath, document) => {
  const destinationPath = getDestinationPath(sourcePath);
  const fields = Object.fromEntries(Object.entries(document.fields || {})
    .map(([key, value]) => [key, transformValue(value)]));
  const originalUserId = readStringValue(document.fields?.userId);
  const originalCreatedBy = readStringValue(document.fields?.createdBy);
  const hasUnmappedHistoricalAuthor = [originalUserId, originalCreatedBy]
    .includes(SOURCE.otherRecipeAuthorUid);

  if (sourcePath.startsWith('recipes/') || hasUnmappedHistoricalAuthor) {
    fields.migrationProvenance = migrationProvenance(sourcePath, document.fields || {});
  }
  if (hasUnmappedHistoricalAuthor) {
    if (originalUserId === SOURCE.otherRecipeAuthorUid) fields.userId = stringValue(DESTINATION.ownerUid);
    if (originalCreatedBy === SOURCE.otherRecipeAuthorUid) fields.createdBy = stringValue(DESTINATION.ownerUid);
  }
  if (sourcePath.startsWith('recipes/')) {
    // Firestore creation and subsequent immutable updates require the canonical
    // creator to be a valid member of the destination workspace. Historical
    // attribution is retained in createdByName and migrationProvenance.
    fields.userId = stringValue(DESTINATION.ownerUid);
    fields.createdBy = stringValue(DESTINATION.ownerUid);
  }

  return {
    name: `projects/${DESTINATION.projectId}/databases/(default)/documents/${destinationPath}`,
    fields
  };
};

const findForbiddenReferences = (value, path = '', inProvenance = false, findings = []) => {
  if (!value || typeof value !== 'object') return findings;
  const nextInProvenance = inProvenance || path.split('.').includes('migrationProvenance');
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === 'stringValue' || key === 'referenceValue') {
      const text = String(child);
      const forbidden = nextInProvenance ? [] : [
        SOURCE.projectId,
        SOURCE.bucket,
        SOURCE.workspaceId,
        SOURCE.ownerUid,
        SOURCE.otherRecipeAuthorUid
      ];
      for (const token of forbidden) {
        if (text.includes(token)) findings.push({ path: childPath, token });
      }
    } else {
      findForbiddenReferences(child, childPath, nextInProvenance, findings);
    }
  }
  return findings;
};

export const validateTransformedDocument = document => findForbiddenReferences(document);

const loadFirebaseTools = () => {
  const roots = [
    process.env.FIREBASE_TOOLS_MODULE_ROOT,
    '/usr/local/lib/node_modules/firebase-tools',
    '/opt/homebrew/lib/node_modules/firebase-tools'
  ].filter(Boolean);
  let lastError;
  for (const root of roots) {
    try {
      return {
        Client: require(`${root}/lib/apiv2`).Client,
        auth: require(`${root}/lib/auth`)
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`firebase-tools is required. Set FIREBASE_TOOLS_MODULE_ROOT. ${lastError?.message || ''}`);
};

const selectFirebaseAccount = auth => {
  const accounts = auth.getAllAccounts();
  const requestedEmail = process.env.FIREBASE_MIGRATION_ACCOUNT || 'celim0609@gmail.com';
  const account = accounts.find(candidate => candidate.user?.email === requestedEmail);
  assert(account, `Authenticated Firebase CLI account ${requestedEmail} was not found.`);
  auth.setActiveAccount({}, account);
  return requestedEmail;
};

const createClients = () => {
  const { Client, auth } = loadFirebaseTools();
  const accountEmail = selectFirebaseAccount(auth);
  return {
    accountEmail,
    firestore: new Client({
      urlPrefix: 'https://firestore.googleapis.com',
      apiVersion: 'v1',
      auth: true
    }),
    storage: new Client({
      urlPrefix: 'https://storage.googleapis.com',
      apiVersion: 'storage/v1',
      auth: true
    })
  };
};

const firestorePath = (projectId, documentPath) =>
  `/projects/${projectId}/databases/(default)/documents/${documentPath}`;

const getDocument = async (firestore, projectId, documentPath) => {
  try {
    const response = await firestore.get(firestorePath(projectId, documentPath));
    return response.body;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
};

const listCollection = async (firestore, projectId, collection) => {
  const documents = [];
  let pageToken;
  do {
    let response;
    try {
      response = await firestore.get(
        firestorePath(projectId, collection),
        { queryParams: { pageSize: '1000', ...(pageToken ? { pageToken } : {}) } }
      );
    } catch (error) {
      if (error.status === 404) return new Map();
      throw error;
    }
    documents.push(...(response.body.documents || []));
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  return new Map(documents.map(document => [document.name.split('/').pop(), document]));
};

const getObject = async (storage, bucket, objectPath) => {
  try {
    const response = await storage.get(`/b/${bucket}/o/${encodeURIComponent(objectPath)}`);
    return response.body;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
};

const listObjects = async (storage, bucket, prefix) => {
  const objects = [];
  let pageToken;
  do {
    const response = await storage.get(`/b/${bucket}/o`, {
      queryParams: { prefix, maxResults: '1000', ...(pageToken ? { pageToken } : {}) }
    });
    objects.push(...(response.body.items || []));
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  return objects;
};

const getField = (document, name) => readStringValue(document?.fields?.[name]);
const effectiveWorkspaceCountry = workspace => getField(workspace, 'country') || 'SG';

const buildSourceEntries = () => Object.entries(FIRESTORE_ALLOWLIST)
  .flatMap(([collection, ids]) => ids.map(id => ({
    collection,
    id,
    sourcePath: `${collection}/${id}`,
    destinationPath: getDestinationPath(`${collection}/${id}`)
  })));

const mapByPath = entries => new Map(entries.map(entry => [entry.sourcePath, entry]));

const valuesAtKey = (value, wantedKey, found = []) => {
  if (!value || typeof value !== 'object') return found;
  if (value.mapValue?.fields) {
    for (const [key, child] of Object.entries(value.mapValue.fields)) {
      if (key === wantedKey && child.stringValue) found.push(child.stringValue);
      valuesAtKey(child, wantedKey, found);
    }
  }
  for (const child of value.arrayValue?.values || []) valuesAtKey(child, wantedKey, found);
  return found;
};

const validateDependencies = sourceDocuments => {
  const blockers = [];
  const ingredients = new Set(FIRESTORE_ALLOWLIST.ingredients);
  const invoices = new Set(FIRESTORE_ALLOWLIST.invoices);
  const recipes = new Set(FIRESTORE_ALLOWLIST.recipes);
  const products = new Set(FIRESTORE_ALLOWLIST.storeProducts);

  for (const entry of sourceDocuments) {
    const { collection, id, document } = entry;
    if (collection === 'recipes') {
      for (const ingredientId of valuesAtKey({ mapValue: { fields: document.fields || {} } }, 'ingredientId')) {
        if (!ingredients.has(ingredientId)) blockers.push(`recipes/${id} references non-allowlisted ingredient ${ingredientId}`);
      }
    }
    if (collection === 'ingredientPriceHistory') {
      const ingredientId = getField(document, 'ingredientId');
      const invoiceId = getField(document, 'invoiceId');
      if (ingredientId && !ingredients.has(ingredientId)) blockers.push(`ingredientPriceHistory/${id} references non-allowlisted ingredient ${ingredientId}`);
      if (invoiceId && !invoices.has(invoiceId)) blockers.push(`ingredientPriceHistory/${id} references non-allowlisted invoice ${invoiceId}`);
    }
    if (collection === 'storeProducts') {
      for (const recipeId of [getField(document, 'recipeId'), getField(document, 'linkedRecipeId')].filter(Boolean)) {
        if (!recipes.has(recipeId)) blockers.push(`storeProducts/${id} references non-allowlisted recipe ${recipeId}`);
      }
    }
    if (collection === 'storeSets') {
      for (const productId of valuesAtKey({ mapValue: { fields: document.fields || {} } }, 'productId')) {
        if (!products.has(productId)) blockers.push(`storeSets/${id} references non-allowlisted product ${productId}`);
      }
    }
  }
  return [...new Set(blockers)].sort();
};

const validateSourceScopes = sourceDocuments => sourceDocuments.flatMap(entry => {
  if (!entry.document) return [];
  if (entry.collection === 'hostProfiles') {
    return getField(entry.document, 'userId') === SOURCE.ownerUid
      ? [] : [`${entry.sourcePath} is not scoped to Beta owner ${SOURCE.ownerUid}`];
  }
  return getField(entry.document, 'workspaceId') === SOURCE.workspaceId
    ? [] : [`${entry.sourcePath} is not scoped to authorized Beta workspace ${SOURCE.workspaceId}`];
});

const inspectEnvironment = async (clients, phase = 'preflight') => {
  assert(['preflight', 'post-apply'].includes(phase));
  const sourceEntries = buildSourceEntries();
  assert.equal(sourceEntries.length, EXPECTED_COUNTS.firestoreSource, 'Manifest Firestore count drifted.');
  assert.equal(STORAGE_ALLOWLIST.length, EXPECTED_COUNTS.storageSource, 'Manifest Storage count drifted.');

  const collections = Object.keys(FIRESTORE_ALLOWLIST);
  const [sourceCollections, destinationCollections] = await Promise.all([
    Promise.all(collections.map(async collection => [
      collection,
      await listCollection(clients.firestore, SOURCE.projectId, collection)
    ])),
    Promise.all(collections.map(async collection => [
      collection,
      await listCollection(clients.firestore, DESTINATION.projectId, collection)
    ]))
  ]);
  const sourceCollectionsByName = new Map(sourceCollections);
  const destinationCollectionsByName = new Map(destinationCollections);
  const sourceDocuments = sourceEntries.map(entry => ({
    ...entry,
    document: sourceCollectionsByName.get(entry.collection)?.get(entry.id) || null
  }));
  const missingSourceDocuments = sourceDocuments.filter(entry => !entry.document).map(entry => entry.sourcePath);

  const transformed = sourceDocuments.filter(entry => entry.document).map(entry => ({
    ...entry,
    transformed: transformDocument(entry.sourcePath, entry.document)
  }));
  const forbiddenReferences = transformed.flatMap(entry => validateTransformedDocument(entry.transformed)
    .map(finding => ({ destinationPath: entry.destinationPath, ...finding })));

  const destinationDocuments = sourceEntries.map(entry => ({
    ...entry,
    document: destinationCollectionsByName.get(entry.collection)
      ?.get(entry.destinationPath.split('/').pop()) || null
  }));
  const allowedOverwrite = `stores/${DESTINATION.workspaceId}`;
  const transformedByPath = new Map(transformed.map(entry => [entry.destinationPath, entry.transformed]));
  const collisions = phase === 'preflight' ? destinationDocuments
    .filter(entry => entry.document && entry.destinationPath !== allowedOverwrite)
    .map(entry => entry.destinationPath) : [];
  const missingRequiredOverwrite = phase === 'preflight' ? destinationDocuments
    .filter(entry => entry.destinationPath === allowedOverwrite && !entry.document)
    .map(entry => entry.destinationPath) : [];
  const postApplyDocumentFailures = phase === 'post-apply' ? destinationDocuments
    .filter(entry => {
      const expected = transformedByPath.get(entry.destinationPath);
      return !entry.document || !isDeepStrictEqual(entry.document.fields || {}, expected?.fields || {});
    })
    .map(entry => entry.destinationPath) : [];

  const storageInspection = await Promise.all(STORAGE_ALLOWLIST.map(async item => {
    const [sourceObject, destinationObject] = await Promise.all([
      getObject(clients.storage, SOURCE.bucket, item.sourcePath),
      getObject(clients.storage, DESTINATION.bucket, item.destinationPath)
    ]);
    const sourceMatches = Boolean(sourceObject)
      && Number(sourceObject.size) === item.size
      && sourceObject.md5Hash === item.md5Hash;
    const destinationIdentical = Boolean(destinationObject)
      && Number(destinationObject.size) === item.size
      && destinationObject.md5Hash === item.md5Hash;
    return {
      ...item,
      sourceExists: Boolean(sourceObject),
      sourceMatches,
      destinationExists: Boolean(destinationObject),
      destinationIdentical,
      destinationGeneration: destinationObject?.generation || null
    };
  }));
  const excludedCollectionEntries = await Promise.all(EXCLUDED_COLLECTIONS.map(async collection => [
    collection,
    (await listCollection(clients.firestore, SOURCE.projectId, collection)).size
  ]));
  const excludedStorageEntries = await Promise.all(EXCLUDED_STORAGE_PREFIXES.map(async prefix => [
    prefix,
    (await listObjects(clients.storage, SOURCE.bucket, prefix)).length
  ]));
  const excludedFirestoreByCollection = Object.fromEntries(excludedCollectionEntries);
  const excludedStorageByPrefix = Object.fromEntries(excludedStorageEntries);
  const [publicProjectionDocuments, publicProjectionManifests, publicAssetObjects] = await Promise.all([
    Promise.all(PUBLIC_RECIPE_IDS.map(id => getDocument(clients.firestore, DESTINATION.projectId, `publicRecipes/${id}`))),
    Promise.all(PUBLIC_RECIPE_IDS.map(id => getDocument(clients.firestore, DESTINATION.projectId, `publicRecipeAssetManifests/${id}`))),
    Promise.all(PUBLIC_RECIPE_ASSET_PATHS.map(path => getObject(clients.storage, DESTINATION.bucket, path)))
  ]);
  const trustedProjectionDestinations = [
    ...publicProjectionDocuments.map((document, index) => document ? `publicRecipes/${PUBLIC_RECIPE_IDS[index]}` : null),
    ...publicProjectionManifests.map((document, index) => document ? `publicRecipeAssetManifests/${PUBLIC_RECIPE_IDS[index]}` : null),
    ...publicAssetObjects.map((object, index) => object ? PUBLIC_RECIPE_ASSET_PATHS[index] : null)
  ].filter(Boolean);
  const trustedProjectionBlockers = phase === 'preflight'
    ? trustedProjectionDestinations.map(path => `Trusted public projection destination collision: ${path}`)
    : [
      ...publicProjectionDocuments.map((document, index) => document ? null : `Missing regenerated publicRecipes/${PUBLIC_RECIPE_IDS[index]}`),
      ...publicProjectionManifests.map((document, index) => document ? null : `Missing regenerated publicRecipeAssetManifests/${PUBLIC_RECIPE_IDS[index]}`),
      ...publicAssetObjects.map((object, index) => object ? null : `Missing regenerated ${PUBLIC_RECIPE_ASSET_PATHS[index]}`),
      ...publicProjectionDocuments.flatMap((document, index) => document
        ? validateTransformedDocument(document).map(finding => `Forbidden reference in regenerated publicRecipes/${PUBLIC_RECIPE_IDS[index]} at ${finding.path}: ${finding.token}`)
        : []),
      ...publicProjectionManifests.flatMap((document, index) => document
        ? validateTransformedDocument(document).map(finding => `Forbidden reference in regenerated publicRecipeAssetManifests/${PUBLIC_RECIPE_IDS[index]} at ${finding.path}: ${finding.token}`)
        : [])
    ].filter(Boolean);

  const productionCompany = await getDocument(clients.firestore, DESTINATION.projectId, `companies/${DESTINATION.ownerUid}`);
  const productionWorkspace = await getDocument(clients.firestore, DESTINATION.projectId, `workspaces/${DESTINATION.workspaceId}`);
  const productionMembership = await getDocument(clients.firestore, DESTINATION.projectId, `workspaceMembers/${DESTINATION.workspaceId}_${DESTINATION.ownerUid}`);
  const productionChefProfile = await getDocument(clients.firestore, DESTINATION.projectId, `chefProfiles/${DESTINATION.ownerUid}`);
  const sourceStore = sourceDocuments.find(entry => entry.sourcePath === `stores/${SOURCE.workspaceId}`)?.document;

  const compatibilityBlockers = [];
  if (getField(productionCompany, 'subscriptionPlan') !== 'professional'
      || getField(productionCompany, 'subscriptionStatus') !== 'active') {
    compatibilityBlockers.push('Production company is not professional/active.');
  }
  if (getField(productionWorkspace, 'ownerId') !== DESTINATION.ownerUid) {
    compatibilityBlockers.push('Production workspace owner does not match the preserved Production UID.');
  }
  if (getField(productionMembership, 'role') !== 'Owner' || getField(productionMembership, 'status') !== 'Active') {
    compatibilityBlockers.push('Production Owner membership is not Active/Owner.');
  }
  if (!productionChefProfile) compatibilityBlockers.push('The newer Production Chef Profile is missing.');
  const storeCountry = getField(sourceStore, 'country');
  const workspaceCountry = effectiveWorkspaceCountry(productionWorkspace);
  if (storeCountry && workspaceCountry !== storeCountry) {
    compatibilityBlockers.push(`Production workspace effective country ${workspaceCountry} does not match authorized Beta store country ${storeCountry}.`);
  }

  const dependencyBlockers = validateDependencies(sourceDocuments.filter(entry => entry.document));
  const sourceScopeBlockers = validateSourceScopes(sourceDocuments);
  const storageFailures = storageInspection
    .filter(item => !item.sourceMatches)
    .map(item => `Source Storage checksum mismatch: ${item.sourcePath}`);
  const storageCollisions = storageInspection
    .filter(item => item.destinationExists && !item.destinationIdentical)
    .map(item => item.destinationPath);
  const storageIdenticalExisting = storageInspection.filter(item => item.destinationIdentical).length;
  const storageCreates = storageInspection.filter(item => !item.destinationExists).length;

  const blockers = [
    ...missingSourceDocuments.map(path => `Missing source document: ${path}`),
    ...missingRequiredOverwrite.map(path => `Missing required Production document to snapshot/overwrite: ${path}`),
    ...collisions.map(path => `Production document collision: ${path}`),
    ...postApplyDocumentFailures.map(path => `Post-apply Production document mismatch: ${path}`),
    ...storageFailures,
    ...storageCollisions.map(path => `Production Storage collision: ${path}`),
    ...trustedProjectionBlockers,
    ...forbiddenReferences.map(item => `Forbidden reference in ${item.destinationPath} at ${item.path}: ${item.token}`),
    ...dependencyBlockers,
    ...sourceScopeBlockers,
    ...compatibilityBlockers
  ];

  if (phase === 'preflight') {
    if (storageCreates !== EXPECTED_COUNTS.storageCreates) {
      blockers.push(`Expected ${EXPECTED_COUNTS.storageCreates} Storage creates, found ${storageCreates}.`);
    }
    if (storageIdenticalExisting !== EXPECTED_COUNTS.storageIdenticalExisting) {
      blockers.push(`Expected ${EXPECTED_COUNTS.storageIdenticalExisting} identical existing Storage object, found ${storageIdenticalExisting}.`);
    }
  } else if (storageIdenticalExisting !== EXPECTED_COUNTS.storageSource) {
    blockers.push(`Expected all ${EXPECTED_COUNTS.storageSource} destination Storage checksums after apply, found ${storageIdenticalExisting}.`);
  }

  return {
    sourceEntries,
    sourceDocuments,
    transformed,
    destinationDocuments,
    storageInspection,
    production: { productionCompany, productionWorkspace, productionMembership, productionChefProfile },
    report: {
      migrationVersion: MIGRATION_VERSION,
      mode: phase === 'preflight' ? 'dry-run' : 'post-apply-verification',
      authenticatedAccount: clients.accountEmail,
      source: SOURCE,
      destination: DESTINATION,
      counts: {
        firestoreSourceExpected: EXPECTED_COUNTS.firestoreSource,
        firestoreSourceFound: sourceDocuments.length - missingSourceDocuments.length,
        firestoreCreatesPlanned: phase === 'preflight' ? destinationDocuments.filter(entry => !entry.document).length : 0,
        firestoreUpdatesPlanned: phase === 'preflight' ? destinationDocuments.filter(entry => entry.document && entry.destinationPath === allowedOverwrite).length : 0,
        firestoreCollisions: collisions.length,
        storageSourceExpected: EXPECTED_COUNTS.storageSource,
        storageChecksumsVerified: storageInspection.filter(item => item.sourceMatches).length,
        storageCreatesPlanned: storageCreates,
        storageIdenticalExisting,
        storageCollisions: storageCollisions.length,
        trustedPublicRecipeRegenerations: PUBLIC_RECIPE_IDS.length
      },
      excludedCollections: EXCLUDED_COLLECTIONS,
      excludedStoragePrefixes: EXCLUDED_STORAGE_PREFIXES,
      excludedCounts: {
        firestoreByCollection: excludedFirestoreByCollection,
        firestoreTotal: Object.values(excludedFirestoreByCollection).reduce((total, count) => total + count, 0),
        storageByPrefix: excludedStorageByPrefix,
        storageTotal: Object.values(excludedStorageByPrefix).reduce((total, count) => total + count, 0)
      },
      publicRecipeIdsRegeneratedByTrustedTrigger: PUBLIC_RECIPE_IDS,
      authorHandling: {
        canonicalDestinationUserId: DESTINATION.ownerUid,
        canonicalDestinationCreatedBy: DESTINATION.ownerUid,
        preservedFields: ['createdByName', 'migrationProvenance.originalUserId', 'migrationProvenance.originalCreatedBy', 'migrationProvenance.originalCreatedByName'],
        unmappedBetaAuthorUid: SOURCE.otherRecipeAuthorUid
      },
      blockers,
      safeToApply: blockers.length === 0
    }
  };
};

const commitWrites = async (firestore, writes) => {
  assert(writes.length <= 500, 'Firestore commit exceeds the atomic 500-write limit.');
  if (writes.length === 0) return [];
  const response = await firestore.post(
    `/projects/${DESTINATION.projectId}/databases/(default)/documents:commit`,
    { writes }
  );
  return response.body.writeResults || [];
};

const writeManifest = (path, manifest) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
};

const updateManifest = (path, manifest) => {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
};

const rewriteObject = async (storage, item) => {
  let rewriteToken;
  do {
    const response = await storage.post(
      `/b/${SOURCE.bucket}/o/${encodeURIComponent(item.sourcePath)}/rewriteTo/b/${DESTINATION.bucket}/o/${encodeURIComponent(item.destinationPath)}`,
      {},
      { queryParams: { ifGenerationMatch: '0', ...(rewriteToken ? { rewriteToken } : {}) } }
    );
    if (response.body.done) return response.body.resource;
    rewriteToken = response.body.rewriteToken;
    assert(rewriteToken, `Storage rewrite did not finish for ${item.sourcePath}.`);
  } while (rewriteToken);
  throw new Error(`Storage rewrite did not finish for ${item.sourcePath}.`);
};

const waitForTrustedPublicProjections = async clients => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const [documents, manifests, objects] = await Promise.all([
      Promise.all(PUBLIC_RECIPE_IDS.map(id => getDocument(clients.firestore, DESTINATION.projectId, `publicRecipes/${id}`))),
      Promise.all(PUBLIC_RECIPE_IDS.map(id => getDocument(clients.firestore, DESTINATION.projectId, `publicRecipeAssetManifests/${id}`))),
      Promise.all(PUBLIC_RECIPE_ASSET_PATHS.map(path => getObject(clients.storage, DESTINATION.bucket, path)))
    ]);
    if ([...documents, ...manifests, ...objects].every(Boolean)) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 2_000));
  }
};

const applyMigration = async (clients, inspection, snapshotPath) => {
  assert(inspection.report.safeToApply, `Dry-run has blockers:\n${inspection.report.blockers.join('\n')}`);
  const existingDocuments = inspection.destinationDocuments
    .filter(entry => entry.document)
    .map(entry => ({ path: entry.destinationPath, document: entry.document }));
  const manifest = {
    migrationVersion: MIGRATION_VERSION,
    source: SOURCE,
    destination: DESTINATION,
    createdAt: new Date().toISOString(),
    status: 'started',
    preState: { existingDocuments },
    completedStorage: [],
    completedFirestore: [],
    publicRecipeIds: PUBLIC_RECIPE_IDS
  };
  writeManifest(snapshotPath, manifest);

  for (const item of inspection.storageInspection) {
    if (item.destinationIdentical) {
      manifest.completedStorage.push({ ...item, action: 'preserved-identical' });
      updateManifest(snapshotPath, manifest);
      continue;
    }
    const result = await rewriteObject(clients.storage, item);
    assert.equal(Number(result.size), item.size);
    assert.equal(result.md5Hash, item.md5Hash);
    manifest.completedStorage.push({
      sourcePath: item.sourcePath,
      destinationPath: item.destinationPath,
      action: 'created',
      generation: result.generation,
      size: Number(result.size),
      md5Hash: result.md5Hash
    });
    updateManifest(snapshotPath, manifest);
  }

  const existingByPath = new Map(inspection.destinationDocuments
    .filter(entry => entry.document)
    .map(entry => [entry.destinationPath, entry.document]));
  const writes = inspection.transformed.map(entry => {
    const existing = existingByPath.get(entry.destinationPath);
    return {
      update: entry.transformed,
      currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false }
    };
  });
  const writeResults = await commitWrites(clients.firestore, writes);
  assert.equal(writeResults.length, writes.length);
  manifest.completedFirestore = inspection.transformed.map((entry, index) => ({
    path: entry.destinationPath,
    action: existingByPath.has(entry.destinationPath) ? 'updated' : 'created',
    updateTime: writeResults[index]?.updateTime
  }));
  manifest.status = 'applied-awaiting-verification';
  updateManifest(snapshotPath, manifest);

  await waitForTrustedPublicProjections(clients);
  const verification = await inspectEnvironment(clients, 'post-apply');
  if (verification.report.blockers.length) {
    manifest.status = 'verification-failed';
    manifest.verificationBlockers = verification.report.blockers;
    updateManifest(snapshotPath, manifest);
    throw new Error(`Post-apply verification failed. Use rollback manifest ${snapshotPath}.`);
  }
  manifest.status = 'verified';
  manifest.verifiedAt = new Date().toISOString();
  updateManifest(snapshotPath, manifest);
  return manifest;
};

const rollbackMigration = async (clients, manifestPath) => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.migrationVersion, MIGRATION_VERSION);
  assert.equal(manifest.destination.projectId, DESTINATION.projectId);
  const currentByPath = new Map();
  for (const item of manifest.completedFirestore || []) {
    currentByPath.set(item.path, await getDocument(clients.firestore, DESTINATION.projectId, item.path));
  }
  const preState = new Map((manifest.preState?.existingDocuments || []).map(item => [item.path, item.document]));
  const writes = [];
  for (const item of manifest.completedFirestore || []) {
    const current = currentByPath.get(item.path);
    assert(current, `Rollback target ${item.path} is missing.`);
    assert.equal(current.updateTime, item.updateTime, `Rollback target ${item.path} changed after migration.`);
    const previous = preState.get(item.path);
    if (previous) {
      writes.push({
        update: { name: previous.name, fields: previous.fields || {} },
        currentDocument: { updateTime: current.updateTime }
      });
    } else {
      writes.push({ delete: current.name, currentDocument: { updateTime: current.updateTime } });
    }
  }
  await commitWrites(clients.firestore, writes);

  for (const item of (manifest.completedStorage || []).filter(candidate => candidate.action === 'created')) {
    const current = await getObject(clients.storage, DESTINATION.bucket, item.destinationPath);
    assert(current, `Rollback Storage target ${item.destinationPath} is missing.`);
    assert.equal(current.generation, item.generation, `Rollback Storage target ${item.destinationPath} changed after migration.`);
    await clients.storage.delete(`/b/${DESTINATION.bucket}/o/${encodeURIComponent(item.destinationPath)}`, {
      queryParams: { ifGenerationMatch: item.generation }
    });
  }
  manifest.status = 'rolled-back';
  manifest.rolledBackAt = new Date().toISOString();
  updateManifest(manifestPath, manifest);
  return manifest;
};

const parseArguments = argv => {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(arg, next);
      index += 1;
    } else args.set(arg, true);
  }
  return args;
};

const run = async () => {
  const args = parseArguments(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollbackPath = args.get('--rollback');
  assert(!(apply && rollbackPath), 'Choose either --apply or --rollback.');
  const clients = createClients();

  if (rollbackPath) {
    assert.equal(args.get('--confirm'), ROLLBACK_CONFIRMATION, `Rollback requires --confirm "${ROLLBACK_CONFIRMATION}".`);
    const result = await rollbackMigration(clients, resolve(String(rollbackPath)));
    console.log(JSON.stringify({ mode: 'rollback', status: result.status }, null, 2));
    return;
  }

  const inspection = await inspectEnvironment(clients);
  console.log(JSON.stringify(inspection.report, null, 2));
  if (!apply) {
    if (!inspection.report.safeToApply) process.exitCode = 2;
    return;
  }

  assert.equal(args.get('--confirm'), APPLY_CONFIRMATION, `Apply requires --confirm "${APPLY_CONFIRMATION}".`);
  const snapshotPath = resolve(String(args.get('--snapshot') || `.migration-artifacts/${MIGRATION_VERSION}-${Date.now()}.json`));
  const result = await applyMigration(clients, inspection, snapshotPath);
  console.log(JSON.stringify({ mode: 'apply', status: result.status, rollbackManifest: snapshotPath }, null, 2));
};

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch(error => {
    console.error(JSON.stringify({ error: error.message }, null, 2));
    process.exitCode = 1;
  });
}

export const internals = {
  APPLY_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  findForbiddenReferences,
  replaceSourceIdentifiers,
  validateDependencies
};
