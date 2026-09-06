import { PRODUCTION_PROJECT_ID } from './productionDeploymentSafety.mjs';

export const PRODUCTION_FIRESTORE_READ_LIMIT_CEILINGS = Object.freeze({
  pageSize: 1_000,
  maxPages: 250,
  maxPagesPerCollection: 100,
  maxDocumentsPerCollection: 10_000,
  maxRequests: 500,
  maxDocuments: 25_000,
  maxCollectionIds: 1_000
});

export const BETA_FIRESTORE_PROJECT_ID = 'misechef-beta-fa4bf';

const REQUIRED_LIMIT_NAMES = Object.freeze([
  'pageSize',
  'maxPages',
  'maxPagesPerCollection',
  'maxDocumentsPerCollection',
  'maxRequests',
  'maxDocuments',
  'maxCollectionIds'
]);

const failClosed = (abortReason, message) => {
  const error = new Error(message);
  error.abortReason = abortReason;
  return error;
};

const readAbortReason = error => typeof error?.abortReason === 'string'
  ? error.abortReason
  : 'operation_failed';

const assertPositiveInteger = (value, name, ceiling) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw failClosed('invalid_limits', `${name} must be a positive safe integer.`);
  }
  if (value > ceiling) {
    throw failClosed('invalid_limits', `${name} exceeds the hard safety ceiling of ${ceiling}.`);
  }
};

const validateLimits = limits => {
  if (!limits || typeof limits !== 'object') {
    throw failClosed('invalid_limits', `Production Firestore reads require explicit limits: ${REQUIRED_LIMIT_NAMES.join(', ')}.`);
  }
  for (const name of REQUIRED_LIMIT_NAMES) {
    assertPositiveInteger(limits[name], name, PRODUCTION_FIRESTORE_READ_LIMIT_CEILINGS[name]);
  }
  if (limits.maxDocumentsPerCollection > limits.maxDocuments) {
    throw failClosed('invalid_limits', 'maxDocumentsPerCollection cannot exceed maxDocuments.');
  }
  return Object.freeze(Object.fromEntries(REQUIRED_LIMIT_NAMES.map(name => [name, limits[name]])));
};

const validateResourcePath = (resourcePath, expectedParity, label) => {
  if (typeof resourcePath !== 'string' || resourcePath.trim() !== resourcePath || !resourcePath) {
    throw failClosed('invalid_resource_path', `${label} must be a non-empty canonical Firestore path.`);
  }
  const segments = resourcePath.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw failClosed('invalid_resource_path', `${label} contains an invalid path segment.`);
  }
  if (segments.length % 2 !== expectedParity) {
    throw failClosed('invalid_resource_path', `${label} must identify a Firestore ${expectedParity === 1 ? 'collection' : 'document'}.`);
  }
  return segments;
};

const collectionForDocumentPath = documentPath => documentPath.split('/').filter((_, index) => index % 2 === 0).join('/');
const encodeResourcePath = resourcePath => resourcePath.split('/').map(encodeURIComponent).join('/');
const firestoreDatabasePath = projectId => `/projects/${projectId}/databases/(default)`;
const firestorePath = (projectId, resourcePath) =>
  `${firestoreDatabasePath(projectId)}/documents/${encodeResourcePath(resourcePath)}`;

const responseBody = response => response?.body ?? response?.data ?? response ?? {};
const errorStatus = error => error?.status ?? error?.response?.status;
const guardedFirestoreRestClients = new WeakMap();

const assertProductionReadAuthority = ({ projectId, confirmation, runId }) => {
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw failClosed('project_mismatch', `Production Firestore reader is pinned to ${PRODUCTION_PROJECT_ID}.`);
  }
  const expectedConfirmation = `READ PRODUCTION FIRESTORE ${PRODUCTION_PROJECT_ID} FOR ${runId}`;
  if (confirmation !== expectedConfirmation) {
    throw failClosed('confirmation_mismatch', `Production Firestore reads require exact run-bound confirmation: ${expectedConfirmation}`);
  }
};

const assertBetaReadAuthority = ({ projectId, confirmation, runId }) => {
  if (projectId !== BETA_FIRESTORE_PROJECT_ID) {
    throw failClosed('project_mismatch', `Beta Firestore reader is pinned to ${BETA_FIRESTORE_PROJECT_ID}.`);
  }
  const expectedConfirmation = `READ BETA FIRESTORE ${BETA_FIRESTORE_PROJECT_ID} FOR ${runId}`;
  if (confirmation !== expectedConfirmation) {
    throw failClosed('confirmation_mismatch', `Beta Firestore reads require exact run-bound confirmation: ${expectedConfirmation}`);
  }
};

export const createProductionFirestoreRestClient = Client => {
  if (typeof Client !== 'function') throw new Error('A Firebase REST Client constructor is required.');
  const client = new Client({
    urlPrefix: 'https://firestore.googleapis.com',
    apiVersion: 'v1',
    auth: true
  });
  const handle = Object.freeze({});
  guardedFirestoreRestClients.set(handle, client);
  return handle;
};

export const createBetaFirestoreRestClient = createProductionFirestoreRestClient;

const unsafeReadPatterns = Object.freeze([
  ['raw Firestore REST endpoint', /https:\/\/firestore\.googleapis\.com/i],
  ['raw Firestore REST read', /\b(?:firestore|db)\s*\.\s*(?:get|request)\s*\(/i],
  ['raw Firestore batch/list read', /\b(?:firestore|db)\s*\.\s*(?:getAll|listCollections)\s*\(/i],
  ['raw Firestore listDocuments call', /\blistDocuments\b/i],
  ['raw Firestore runQuery call', /\brunQuery\b/i],
  ['raw Firebase Web SDK read', /\bgetDocs\s*\(/i],
  ['raw Firebase Admin SDK collection read', /\b(?:firestore|db)\s*\.\s*collection\s*\([^;]*?\)(?:\s*\.\s*[A-Za-z_$][\w$]*\s*\([^;]*?\))*\s*\.\s*(?:get|stream)\s*\(/i],
  ['hard-coded Production read confirmation', /READ PRODUCTION FIRESTORE misechef-fa4bf/i]
]);

export const findUnguardedProductionFirestoreReads = files => {
  if (!Array.isArray(files)) throw new Error('Production Firestore policy input must be an array.');
  const findings = [];
  for (const file of files) {
    const filePath = String(file?.path || '');
    const source = String(file?.source || '');
    // Local QA utilities are allowed to use their emulator-only clients. The
    // exemption is intentionally lost if either the demo project pin or the
    // emulator host pin is removed.
    const emulatorOnly = /process\.env\.FIRESTORE_EMULATOR_HOST\s*=\s*['"](?:127\.0\.0\.1|localhost):\d+['"]/.test(source)
      && /\bPROJECT_ID\s*=\s*['"]demo-[^'"]+['"]/.test(source)
      && !source.includes(PRODUCTION_PROJECT_ID);
    if (emulatorOnly) continue;
    for (const [reason, pattern] of unsafeReadPatterns) {
      if (pattern.test(source)) findings.push({ path: filePath, reason });
    }
  }
  return findings;
};

const runGuardedFirestoreRead = async ({
  projectId,
  confirmation,
  firestore,
  limits,
  runId,
  logger = line => console.log(line),
  environment,
  assertReadAuthority
} = {}, operation) => {
  if (typeof logger !== 'function') throw failClosed('invalid_logger', `${environment} Firestore telemetry logger must be a function.`);
  const startedAt = new Date().toISOString();
  const collections = new Map();
  let requestCount = 0;
  let pageCount = 0;
  let returnedDocumentCount = 0;
  let returnedCollectionIdCount = 0;
  let safeLimits;
  const readClient = guardedFirestoreRestClients.get(firestore) ?? firestore;
  const telemetryProject = typeof projectId === 'string' && projectId ? projectId : '<invalid>';
  const telemetryRunId = typeof runId === 'string' && runId ? runId : '<invalid>';

  const statsFor = collection => {
    const existing = collections.get(collection);
    if (existing) return existing;
    const created = { requestCount: 0, pageCount: 0, returnedDocumentCount: 0 };
    collections.set(collection, created);
    return created;
  };

  const emit = (event, collection = null, extra = {}) => logger(JSON.stringify({
    schemaVersion: 1,
    event,
    project: telemetryProject,
    collection,
    runId: telemetryRunId,
    requestCount,
    pageCount,
    returnedDocumentCount,
    returnedCollectionIdCount,
    ...extra
  }));

  const reserveRequest = (collection, isCollectionPage) => {
    const stats = statsFor(collection);
    if (requestCount >= safeLimits.maxRequests) {
      throw failClosed('request_cap', `${environment} Firestore run reached maxRequests=${safeLimits.maxRequests}.`);
    }
    if (isCollectionPage && pageCount >= safeLimits.maxPages) {
      throw failClosed('page_cap', `${environment} Firestore run reached maxPages=${safeLimits.maxPages}.`);
    }
    if (returnedDocumentCount >= safeLimits.maxDocuments) {
      throw failClosed('document_cap', `${environment} Firestore run reached maxDocuments=${safeLimits.maxDocuments}.`);
    }
    if (isCollectionPage && stats.pageCount >= safeLimits.maxPagesPerCollection) {
      throw failClosed('collection_page_cap', `${collection} reached maxPagesPerCollection=${safeLimits.maxPagesPerCollection}.`);
    }
    if (stats.returnedDocumentCount >= safeLimits.maxDocumentsPerCollection) {
      throw failClosed('collection_document_cap', `${collection} reached maxDocumentsPerCollection=${safeLimits.maxDocumentsPerCollection}.`);
    }
    requestCount += 1;
    stats.requestCount += 1;
    if (isCollectionPage) {
      pageCount += 1;
      stats.pageCount += 1;
    }
    return stats;
  };

  const recordReturnedDocuments = (collection, count) => {
    if (!Number.isSafeInteger(count) || count < 0) throw failClosed('malformed_response', 'Firestore returned an invalid document count.');
    const stats = statsFor(collection);
    const nextCollectionTotal = stats.returnedDocumentCount + count;
    const nextRunTotal = returnedDocumentCount + count;
    // Record the response before enforcing the ceiling so failed-run telemetry
    // still accounts for every document the service actually returned.
    stats.returnedDocumentCount = nextCollectionTotal;
    returnedDocumentCount = nextRunTotal;
    if (nextCollectionTotal > safeLimits.maxDocumentsPerCollection) {
      throw failClosed('collection_document_cap', `${collection} exceeded maxDocumentsPerCollection=${safeLimits.maxDocumentsPerCollection}.`);
    }
    if (nextRunTotal > safeLimits.maxDocuments) {
      throw failClosed('document_cap', `${environment} Firestore run exceeded maxDocuments=${safeLimits.maxDocuments}.`);
    }
  };

  const get = async (resourcePath, collection, isCollectionPage, queryParams) => {
    reserveRequest(collection, isCollectionPage);
    try {
      return await readClient.get(firestorePath(projectId, resourcePath), queryParams ? { queryParams } : undefined);
    } catch (error) {
      if (errorStatus(error) === 404) return null;
      throw error;
    }
  };

  const reader = Object.freeze({
    async listRootCollectionIds() {
      if (typeof readClient.post !== 'function') {
        throw failClosed('invalid_client', 'Root collection enumeration requires an authenticated Firestore REST client with POST support.');
      }
      const collection = '<root-collection-ids>';
      const collectionIds = [];
      const returnedIds = new Set();
      const requestedPageTokens = new Set();
      let pageToken;

      do {
        const remainingCollectionIds = safeLimits.maxCollectionIds - returnedCollectionIdCount;
        if (remainingCollectionIds <= 0) {
          throw failClosed('collection_id_cap', `Root collection enumeration reached maxCollectionIds=${safeLimits.maxCollectionIds}.`);
        }
        const cursorKey = pageToken === undefined ? '<initial>' : pageToken;
        if (requestedPageTokens.has(cursorKey)) {
          throw failClosed('repeated_page_token', 'Root collection enumeration repeated a page token; refusing to loop.');
        }
        requestedPageTokens.add(cursorKey);
        reserveRequest(collection, true);
        const requestedPageSize = Math.min(safeLimits.pageSize, remainingCollectionIds);
        const response = await readClient.post(`${firestoreDatabasePath(projectId)}/documents:listCollectionIds`, {
          pageSize: requestedPageSize,
          ...(pageToken === undefined ? {} : { pageToken })
        });
        const body = responseBody(response);
        const pageIds = body.collectionIds ?? [];
        if (!Array.isArray(pageIds)) throw failClosed('malformed_response', 'Root collection enumeration returned a malformed page.');
        if (pageIds.length > requestedPageSize) {
          throw failClosed('malformed_response', `Root collection enumeration returned more than pageSize=${requestedPageSize}.`);
        }
        returnedCollectionIdCount += pageIds.length;
        if (returnedCollectionIdCount > safeLimits.maxCollectionIds) {
          throw failClosed('collection_id_cap', `Root collection enumeration exceeded maxCollectionIds=${safeLimits.maxCollectionIds}.`);
        }
        for (const id of pageIds) {
          validateResourcePath(id, 1, 'Root collection ID');
          if (returnedIds.has(id)) {
            throw failClosed('overlapping_page', 'Root collection enumeration returned an overlapping page; refusing to continue.');
          }
          returnedIds.add(id);
          collectionIds.push(id);
        }
        emit(`${environment.toLowerCase()}_firestore_read_request`, collection, {
          requestKind: 'root_collection_ids_page',
          requestReturnedDocumentCount: 0,
          requestReturnedCollectionIdCount: pageIds.length
        });

        const nextPageToken = body.nextPageToken;
        if (nextPageToken !== undefined && (typeof nextPageToken !== 'string' || !nextPageToken)) {
          throw failClosed('invalid_page_token', 'Root collection enumeration returned an invalid nextPageToken.');
        }
        if (nextPageToken && pageToken !== undefined && nextPageToken === pageToken) {
          throw failClosed('unchanged_page_token', 'Root collection enumeration page token did not advance; refusing to loop.');
        }
        if (nextPageToken && requestedPageTokens.has(nextPageToken)) {
          throw failClosed('repeated_page_token', 'Root collection enumeration repeated a page token; refusing to loop.');
        }
        if (nextPageToken && pageIds.length === 0) {
          throw failClosed('no_progress', 'Root collection enumeration returned an empty page with another cursor; no progress was made.');
        }
        pageToken = nextPageToken;
      } while (pageToken);

      return collectionIds.sort();
    },

    async getDocument(documentPath) {
      validateResourcePath(documentPath, 0, 'Document path');
      const collection = collectionForDocumentPath(documentPath);
      const response = await get(documentPath, collection, false);
      const count = response ? 1 : 0;
      recordReturnedDocuments(collection, count);
      emit(`${environment.toLowerCase()}_firestore_read_request`, collection, { requestKind: 'document_get', requestReturnedDocumentCount: count });
      return response ? responseBody(response) : null;
    },

    async listCollection(collectionPath) {
      validateResourcePath(collectionPath, 1, 'Collection path');
      const documents = [];
      const returnedDocumentNames = new Set();
      const requestedPageTokens = new Set();
      let pageToken;

      do {
        const cursorKey = pageToken === undefined ? '<initial>' : pageToken;
        if (requestedPageTokens.has(cursorKey)) {
          throw failClosed('repeated_page_token', `${collectionPath} repeated a page token; refusing to loop.`);
        }
        requestedPageTokens.add(cursorKey);

        const collectionStats = statsFor(collectionPath);
        const requestedPageSize = Math.min(
          safeLimits.pageSize,
          safeLimits.maxDocuments - returnedDocumentCount,
          safeLimits.maxDocumentsPerCollection - collectionStats.returnedDocumentCount
        );
        const response = await get(collectionPath, collectionPath, true, {
          pageSize: String(requestedPageSize),
          ...(pageToken === undefined ? {} : { pageToken })
        });
        const body = response ? responseBody(response) : {};
        const pageDocuments = body.documents ?? [];
        if (!Array.isArray(pageDocuments)) throw failClosed('malformed_response', `${collectionPath} returned a malformed documents page.`);
        if (pageDocuments.length > requestedPageSize) {
          throw failClosed('malformed_response', `${collectionPath} returned more than the requested pageSize=${requestedPageSize}.`);
        }
        recordReturnedDocuments(collectionPath, pageDocuments.length);
        documents.push(...pageDocuments);
        emit(`${environment.toLowerCase()}_firestore_read_request`, collectionPath, {
          requestKind: 'collection_page',
          requestReturnedDocumentCount: pageDocuments.length
        });

        for (const document of pageDocuments) {
          const documentName = document?.name;
          if (typeof documentName !== 'string' || !documentName) {
            throw failClosed('malformed_response', `${collectionPath} returned a document without a canonical name.`);
          }
          if (returnedDocumentNames.has(documentName)) {
            throw failClosed('overlapping_page', `${collectionPath} returned an overlapping document page; refusing to continue.`);
          }
          returnedDocumentNames.add(documentName);
        }

        const nextPageToken = body.nextPageToken;
        if (nextPageToken !== undefined && (typeof nextPageToken !== 'string' || !nextPageToken)) {
          throw failClosed('invalid_page_token', `${collectionPath} returned an invalid nextPageToken.`);
        }
        if (nextPageToken && pageToken !== undefined && nextPageToken === pageToken) {
          throw failClosed('unchanged_page_token', `${collectionPath} page token did not advance; refusing to loop.`);
        }
        if (nextPageToken && requestedPageTokens.has(nextPageToken)) {
          throw failClosed('repeated_page_token', `${collectionPath} repeated a page token; refusing to loop.`);
        }
        if (nextPageToken && pageDocuments.length === 0) {
          throw failClosed('no_progress', `${collectionPath} returned an empty page with another cursor; no progress was made.`);
        }
        pageToken = nextPageToken;
      } while (pageToken);

      const stats = statsFor(collectionPath);
      emit(`${environment.toLowerCase()}_firestore_read_collection_complete`, collectionPath, {
        collectionRequestCount: stats.requestCount,
        collectionPageCount: stats.pageCount,
        collectionReturnedDocumentCount: stats.returnedDocumentCount
      });
      return documents;
    }
  });

  let outcome = 'failed';
  let abortReason;
  try {
    if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(runId)) {
      throw failClosed('invalid_run_id', `${environment} Firestore run ID must be an explicit safe identifier of 8-128 characters.`);
    }
    assertReadAuthority({ projectId, confirmation, runId });
    safeLimits = validateLimits(limits);
    if (!readClient || typeof readClient.get !== 'function') {
      throw failClosed('invalid_client', 'An authenticated Firestore REST client is required.');
    }
    if (typeof operation !== 'function') {
      throw failClosed('invalid_operation', `A ${environment} Firestore read operation is required.`);
    }
    emit(`${environment.toLowerCase()}_firestore_read_run_start`, null, { limits: safeLimits, startedAt });
    const result = await operation(reader);
    outcome = 'succeeded';
    return result;
  } catch (error) {
    abortReason = readAbortReason(error);
    throw error;
  } finally {
    const collectionSummary = [...collections.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([collection, stats]) => ({ collection, ...stats }));
    emit(`${environment.toLowerCase()}_firestore_read_run_complete`, collectionSummary.map(item => item.collection), {
      outcome,
      ...(abortReason ? { abortReason } : {}),
      collections: collectionSummary,
      startedAt,
      completedAt: new Date().toISOString()
    });
  }
};

export const runProductionFirestoreRead = (options, operation) => runGuardedFirestoreRead({
  ...options,
  environment: 'Production',
  assertReadAuthority: assertProductionReadAuthority
}, operation);

export const runBetaFirestoreRead = (options, operation) => runGuardedFirestoreRead({
  ...options,
  environment: 'Beta',
  assertReadAuthority: assertBetaReadAuthority
}, operation);
