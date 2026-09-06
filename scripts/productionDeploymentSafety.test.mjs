import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProductionGoogleApiReader } from './productionLiveRelease.mjs';
import {
  BETA_FIRESTORE_PROJECT_ID,
  PRODUCTION_FIRESTORE_READ_LIMIT_CEILINGS,
  createProductionFirestoreRestClient,
  findUnguardedProductionFirestoreReads,
  runBetaFirestoreRead,
  runProductionFirestoreRead
} from './productionFirestoreReadSafety.mjs';
import {
  FULL_PRODUCTION_RESOURCE_PLAN,
  PRODUCTION_STORAGE_BUCKET,
  assertArtifactCompatibility,
  assertBootstrapLive,
  assertCleanCandidate,
  assertLiveUnchanged,
  assertPostDeploy,
  assertProductionAuthority,
  assertProductionEnvironment,
  assertProductionFirebaseConfig,
  assertSession,
  buildProductionFirebaseConfig,
  createProductionManifest,
  discoverCandidateFunctions
} from './productionDeploymentSafety.mjs';

const sha = '91768429e738cc43b9829533b19089216dd9985b';
const environment = {
  FIREBASE_DEPLOY_TARGET: 'production',
  VITE_FIREBASE_PROJECT_ID: 'misechef-fa4bf',
  VITE_FIREBASE_AUTH_DOMAIN: 'misechef-fa4bf.firebaseapp.com',
  VITE_FIREBASE_STORAGE_BUCKET: 'misechef-fa4bf.firebasestorage.app',
  VITE_FIREBASE_API_KEY: 'public-web-key',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '866290505146',
  VITE_FIREBASE_APP_ID: 'production-app',
  VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  SELLING_WORKSPACE_ID: 'production-workspace',
  PUBLIC_SITE_ORIGIN: 'https://misechef.ai',
  GITHUB_ACTIONS: 'true',
  MISECHEF_PRODUCTION_CI_LOCK_ID: 'misechef-production-deployment'
};

const productionFirestoreLimits = Object.freeze({
  pageSize: 2,
  maxPages: 5,
  maxPagesPerCollection: 3,
  maxDocumentsPerCollection: 5,
  maxRequests: 6,
  maxDocuments: 8,
  maxCollectionIds: 20
});
const productionFirestoreRunId = 'incident-test-run';
const productionFirestoreConfirmation = `READ PRODUCTION FIRESTORE misechef-fa4bf FOR ${productionFirestoreRunId}`;

test('Production authority requires manual main dispatch and one exact approved SHA', () => {
  assert.doesNotThrow(() => assertProductionAuthority({
    expectedSha: sha,
    approvedSha: sha,
    protectedBaseline: sha,
    resolvedSha: sha,
    githubRef: 'refs/heads/main',
    githubEvent: 'workflow_dispatch',
    isAncestor: () => true
  }));
  assert.throws(() => assertProductionAuthority({
    expectedSha: sha,
    approvedSha: 'a'.repeat(40),
    protectedBaseline: sha,
    resolvedSha: sha,
    githubRef: 'refs/heads/main',
    githubEvent: 'workflow_dispatch',
    isAncestor: () => true
  }), /does not match/);
  assert.throws(() => assertProductionAuthority({
    expectedSha: sha,
    approvedSha: sha,
    protectedBaseline: sha,
    resolvedSha: sha,
    githubRef: 'refs/heads/feature',
    githubEvent: 'workflow_dispatch',
    isAncestor: () => true
  }), /main/);
});

test('Production environment rejects Beta, test Stripe, and non-canonical contexts', () => {
  assert.doesNotThrow(() => assertProductionEnvironment(environment));
  assert.throws(() => assertProductionEnvironment({ ...environment, VITE_FIREBASE_PROJECT_ID: 'misechef-beta-fa4bf' }), /VITE_FIREBASE_PROJECT_ID/);
  assert.throws(() => assertProductionEnvironment({ ...environment, VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_example' }), /Stripe live/);
  assert.throws(() => assertProductionEnvironment({ ...environment, PUBLIC_SITE_ORIGIN: 'https://example.com' }), /PUBLIC_SITE_ORIGIN/);
});

test('Production Firebase config names one exact site and bucket without changing candidate config', () => {
  const candidateConfig = {
    functions: { source: 'functions', predeploy: ['beta'] },
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json', predeploy: ['beta'] },
    storage: [{ target: 'beta-default', rules: 'storage.rules', predeploy: ['beta'] }],
    hosting: { public: 'dist', rewrites: [{ source: '**', destination: '/index.html' }], predeploy: ['beta'] },
    emulators: { ui: { enabled: false } }
  };
  const production = buildProductionFirebaseConfig({ candidateConfig, predeployCommand: 'guard' });
  assert.doesNotThrow(() => assertProductionFirebaseConfig(production));
  assert.equal(production.hosting.site, 'misechef-fa4bf');
  assert.equal(production.storage[0].bucket, PRODUCTION_STORAGE_BUCKET);
  assert.equal(candidateConfig.storage[0].target, 'beta-default');
  assert.equal(production.functions.predeploy[0], 'guard');
  assert.equal(production.firestore.predeploy[0], 'guard');
  assert.equal(production.hosting.predeploy[0], 'guard');
});

test('Production manifest binds exact SHA/tree and coherent Hosting/Store assets', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'misechef-production-artifact-'));
  try {
    mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
    mkdirSync(path.join(root, 'functions', 'generated'), { recursive: true });
    const html = '<script type="module" src="/assets/index-prod.js"></script>';
    writeFileSync(path.join(root, 'dist', 'index.html'), html);
    writeFileSync(path.join(root, 'dist', 'assets', 'index-prod.js'), 'production');
    writeFileSync(path.join(root, 'functions', 'generated', 'publicStoreAppShell.html'), html);
    const manifest = createProductionManifest({
      repositoryRoot: root,
      sourceCommit: sha,
      sourceTree: 'b'.repeat(40),
      protectedBaseline: sha,
      buildId: 'build',
      builtAt: new Date().toISOString()
    });
    assert.doesNotThrow(() => assertArtifactCompatibility({
      repositoryRoot: root,
      manifest,
      head: sha,
      sourceTree: 'b'.repeat(40),
      baseline: sha
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bootstrap, concurrency, and canonical full-resource session fail closed', () => {
  const live = {
    customRootAsset: '/assets/index-old.js',
    defaultRootAsset: '/assets/index-old.js',
    hostingVersion: 'sites/misechef-fa4bf/versions/old',
    releaseCommit: null
  };
  assert.doesNotThrow(() => assertBootstrapLive({
    fingerprint: live,
    expectedAsset: '/assets/index-old.js',
    expectedVersion: 'sites/misechef-fa4bf/versions/old'
  }));
  assert.throws(() => assertLiveUnchanged(live, { ...live, hostingVersion: 'new' }), /changed/);
  const session = {
    version: 1,
    nonce: 'nonce',
    sourceCommit: sha,
    sourceTree: 'b'.repeat(40),
    protectedBaseline: sha,
    resources: FULL_PRODUCTION_RESOURCE_PLAN,
    liveFingerprint: live,
    expiresAt: Date.now() + 60_000
  };
  assert.doesNotThrow(() => assertSession({
    session,
    nonce: 'nonce',
    head: sha,
    sourceTree: 'b'.repeat(40),
    baseline: sha,
    liveFingerprint: live
  }));
  assert.throws(() => assertSession({
    session: { ...session, resources: ['hosting'] },
    nonce: 'nonce', head: sha, sourceTree: 'b'.repeat(40), baseline: sha, liveFingerprint: live
  }), /full resource plan/);
  assert.throws(() => assertCleanCandidate(['src/App.tsx']), /dirty/);
});

test('post-deploy verification requires coherent manifest and every candidate Function ACTIVE', () => {
  const expectedFunctions = discoverCandidateFunctions(`
export const alpha = onCall({}, handler);
export const beta = onRequest({}, handler);
  `);
  assert.deepEqual(expectedFunctions, ['alpha', 'beta']);
  assert.doesNotThrow(() => assertPostDeploy({
    fingerprint: {
      releaseCommit: sha,
      releaseSourceTree: 'b'.repeat(40),
      customRootAsset: '/assets/index-new.js',
      defaultRootAsset: '/assets/index-new.js',
      releaseEntryAsset: '/assets/index-new.js'
    },
    expectedCommit: sha,
    expectedTree: 'b'.repeat(40),
    expectedFunctions,
    deployedFunctions: [{ id: 'alpha', state: 'ACTIVE' }, { id: 'beta', state: 'ACTIVE' }]
  }));
  assert.throws(() => assertPostDeploy({
    fingerprint: {
      releaseCommit: sha,
      releaseSourceTree: 'b'.repeat(40),
      customRootAsset: '/assets/index-new.js',
      defaultRootAsset: '/assets/index-new.js',
      releaseEntryAsset: '/assets/index-new.js'
    },
    expectedCommit: sha,
    expectedTree: 'b'.repeat(40),
    expectedFunctions,
    deployedFunctions: [{ id: 'alpha', state: 'ACTIVE' }]
  }), /beta/);
});

test('Production live verification uses authenticated Google APIs without Firebase CLI private auth state', async () => {
  const calls = [];
  const reader = createProductionGoogleApiReader(async options => {
    calls.push(options);
    if (options.url.includes('firebasehosting.googleapis.com')) {
      return { data: { releases: [{ version: { name: 'sites/misechef-fa4bf/versions/current' } }] } };
    }
    if (!options.params.pageToken) {
      return {
        data: {
          functions: [{ name: 'projects/misechef-fa4bf/locations/us-central1/functions/alpha', state: 'ACTIVE' }],
          nextPageToken: 'next'
        }
      };
    }
    return {
      data: {
        functions: [{ name: 'projects/misechef-fa4bf/locations/us-central1/functions/beta', state: 'ACTIVE' }]
      }
    };
  });

  assert.equal(await reader.readHostingVersion(), 'sites/misechef-fa4bf/versions/current');
  assert.deepEqual(await reader.readProductionFunctions(), [
    { id: 'alpha', state: 'ACTIVE' },
    { id: 'beta', state: 'ACTIVE' }
  ]);
  assert.deepEqual(calls.map(call => ({ method: call.method, url: call.url, params: call.params })), [
    {
      method: 'GET',
      url: 'https://firebasehosting.googleapis.com/v1beta1/sites/misechef-fa4bf/releases',
      params: { pageSize: 1 }
    },
    {
      method: 'GET',
      url: 'https://cloudfunctions.googleapis.com/v2/projects/misechef-fa4bf/locations/-/functions',
      params: { pageSize: 1000 }
    },
    {
      method: 'GET',
      url: 'https://cloudfunctions.googleapis.com/v2/projects/misechef-fa4bf/locations/-/functions',
      params: { pageSize: 1000, pageToken: 'next' }
    }
  ]);

  const source = readFileSync(new URL('./productionLiveRelease.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /firebase-tools[/\\]lib[/\\]apiv2/);
  assert.doesNotMatch(source, /FIREBASE_TOKEN/);
  assert.match(source, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(source, /google-auth-library/);
});

test('Production Firestore reads require exact project, confirmation, and explicit limits', async () => {
  const firestore = { get: async () => ({ body: {} }) };
  const operation = async () => null;
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-beta-fa4bf',
      confirmation: productionFirestoreConfirmation,
      firestore,
      limits: productionFirestoreLimits,
      runId: productionFirestoreRunId,
      logger: () => {}
    }, operation),
    /pinned to misechef-fa4bf/
  );
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: 'yes',
      firestore,
      limits: productionFirestoreLimits,
      runId: productionFirestoreRunId,
      logger: () => {}
    }, operation),
    /exact run-bound confirmation/
  );
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: productionFirestoreConfirmation,
      firestore,
      limits: productionFirestoreLimits,
      logger: () => {}
    }, operation),
    /run ID must be an explicit safe identifier/
  );
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: productionFirestoreConfirmation,
      firestore,
      runId: productionFirestoreRunId,
      logger: () => {}
    }, operation),
    /explicit limits/
  );
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: productionFirestoreConfirmation,
      firestore,
      limits: {
        ...productionFirestoreLimits,
        maxRequests: PRODUCTION_FIRESTORE_READ_LIMIT_CEILINGS.maxRequests + 1
      },
      runId: productionFirestoreRunId,
      logger: () => {}
    }, operation),
    /maxRequests exceeds the hard safety ceiling/
  );
});

test('Production Firestore collection reads advance cursors and emit count-only run telemetry', async () => {
  const calls = [];
  const telemetry = [];
  const firestore = {
    async get(resourcePath, options) {
      calls.push({ resourcePath, options });
      if (!options.queryParams.pageToken) {
        return { body: { documents: [{ name: 'one' }, { name: 'two' }], nextPageToken: 'page-2' } };
      }
      return { body: { documents: [{ name: 'three' }] } };
    }
  };

  const documents = await runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: productionFirestoreConfirmation,
    firestore,
    limits: productionFirestoreLimits,
    runId: productionFirestoreRunId,
    logger: line => telemetry.push(JSON.parse(line))
  }, reader => reader.listCollection('ingredients'));

  assert.equal(documents.length, 3);
  assert.deepEqual(calls.map(call => call.options.queryParams), [
    { pageSize: '2' },
    { pageSize: '2', pageToken: 'page-2' }
  ]);
  const completed = telemetry.at(-1);
  assert.deepEqual({
    event: completed.event,
    project: completed.project,
    collection: completed.collection,
    runId: completed.runId,
    requestCount: completed.requestCount,
    pageCount: completed.pageCount,
    returnedDocumentCount: completed.returnedDocumentCount,
    outcome: completed.outcome
  }, {
    event: 'production_firestore_read_run_complete',
    project: 'misechef-fa4bf',
    collection: ['ingredients'],
    runId: 'incident-test-run',
    requestCount: 2,
    pageCount: 2,
    returnedDocumentCount: 3,
    outcome: 'succeeded'
  });
  assert.doesNotMatch(JSON.stringify(telemetry), /\"name\":\"one\"/);
  assert.deepEqual(completed.collections, [{
    collection: 'ingredients',
    requestCount: 2,
    pageCount: 2,
    returnedDocumentCount: 3
  }]);
});

test('Beta inventory reads are separately pinned and root collection enumeration is bounded', async () => {
  const calls = [];
  const telemetry = [];
  const firestore = {
    async get() {
      return { body: {} };
    },
    async post(path, body) {
      calls.push({ path, body });
      return body.pageToken
        ? { body: { collectionIds: ['workspaces'] } }
        : { body: { collectionIds: ['ingredients'], nextPageToken: 'page-2' } };
    }
  };
  const runId = 'phase2a-beta-test';
  const collectionIds = await runBetaFirestoreRead({
    projectId: BETA_FIRESTORE_PROJECT_ID,
    confirmation: `READ BETA FIRESTORE ${BETA_FIRESTORE_PROJECT_ID} FOR ${runId}`,
    firestore,
    limits: productionFirestoreLimits,
    runId,
    logger: line => telemetry.push(JSON.parse(line))
  }, reader => reader.listRootCollectionIds());

  assert.deepEqual(collectionIds, ['ingredients', 'workspaces']);
  assert.deepEqual(calls.map(call => call.body), [
    { pageSize: 2 },
    { pageSize: 2, pageToken: 'page-2' }
  ]);
  assert.match(calls[0].path, /projects\/misechef-beta-fa4bf\/databases\/\(default\)\/documents:listCollectionIds$/);
  assert.equal(telemetry.at(-1).event, 'beta_firestore_read_run_complete');
  assert.equal(telemetry.at(-1).returnedDocumentCount, 0);
  assert.equal(telemetry.at(-1).returnedCollectionIdCount, 2);
});

test('root collection enumeration rejects unchanged tokens and collection-ID overflow', async () => {
  let repeatedTokenPage = 0;
  const base = {
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR root-enumeration-test',
    limits: productionFirestoreLimits,
    runId: 'root-enumeration-test',
    logger: () => {}
  };
  await assert.rejects(runProductionFirestoreRead({
    ...base,
    firestore: {
      async get() { return { body: {} }; },
      async post() {
        repeatedTokenPage += 1;
        return { body: { collectionIds: [`collection-${repeatedTokenPage}`], nextPageToken: 'same' } };
      }
    }
  }, reader => reader.listRootCollectionIds()), /page token did not advance/);

  await assert.rejects(runProductionFirestoreRead({
    ...base,
    limits: { ...productionFirestoreLimits, pageSize: 2, maxCollectionIds: 1 },
    firestore: {
      async get() { return { body: {} }; },
      async post() { return { body: { collectionIds: ['one'], nextPageToken: 'page-2' } }; }
    }
  }, reader => reader.listRootCollectionIds()), /maxCollectionIds=1/);
});

test('Production Firestore reader rejects an unchanged cursor with a full page and records a failed run', async () => {
  const telemetry = [];
  let pageNumber = 0;
  const firestore = {
    async get() {
      pageNumber += 1;
      return { body: { documents: [
        { name: `ingredients/${pageNumber}-a` },
        { name: `ingredients/${pageNumber}-b` }
      ], nextPageToken: 'same-token' } };
    }
  };
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR repeated-token-run',
      firestore,
      limits: productionFirestoreLimits,
      runId: 'repeated-token-run',
      logger: line => telemetry.push(JSON.parse(line))
    }, reader => reader.listCollection('ingredients')),
    /page token did not advance/
  );
  assert.equal(telemetry.at(-1).event, 'production_firestore_read_run_complete');
  assert.equal(telemetry.at(-1).outcome, 'failed');
  assert.equal(telemetry.at(-1).abortReason, 'unchanged_page_token');
  assert.equal(telemetry.at(-1).requestCount, 2);
  assert.equal(telemetry.at(-1).pageCount, 2);
});

test('Production Firestore reader rejects a previously seen non-adjacent page token', async () => {
  let pageNumber = 0;
  const telemetry = [];
  await assert.rejects(runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR repeated-cursor-run',
    firestore: {
      async get() {
        pageNumber += 1;
        const nextPageToken = pageNumber === 1 ? 'page-a' : pageNumber === 2 ? 'page-b' : 'page-a';
        return { body: { documents: [{ name: `ingredients/${pageNumber}` }], nextPageToken } };
      }
    },
    limits: productionFirestoreLimits,
    runId: 'repeated-cursor-run',
    logger: line => telemetry.push(JSON.parse(line))
  }, reader => reader.listCollection('ingredients')), /repeated a page token/);

  assert.equal(pageNumber, 3);
  assert.equal(telemetry.at(-1).abortReason, 'repeated_page_token');
});

test('Production Firestore reader rejects empty and overlapping cursor pages as non-progress', async () => {
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR empty-page-run',
      firestore: {
        async get() {
          return { body: { documents: [], nextPageToken: 'page-2' } };
        }
      },
      limits: productionFirestoreLimits,
      runId: 'empty-page-run',
      logger: () => {}
    }, reader => reader.listCollection('ingredients')),
    /no progress was made/
  );

  let requestCount = 0;
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR overlap-page-run',
      firestore: {
        async get() {
          requestCount += 1;
          return requestCount === 1
            ? { body: { documents: [{ name: 'ingredients/one' }], nextPageToken: 'page-2' } }
            : { body: { documents: [{ name: 'ingredients/one' }] } };
        }
      },
      limits: productionFirestoreLimits,
      runId: 'overlap-page-run',
      logger: () => {}
    }, reader => reader.listCollection('ingredients')),
    /overlapping document page/
  );
  assert.equal(requestCount, 2);
});

test('Production Firestore reader enforces page and returned-document ceilings', async () => {
  const pages = {
    async get() {
      return { body: { documents: [{ name: 'ingredients/one' }], nextPageToken: 'page-2' } };
    }
  };
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR page-limit-run',
      firestore: pages,
      limits: { ...productionFirestoreLimits, maxPagesPerCollection: 1 },
      runId: 'page-limit-run',
      logger: () => {}
    }, reader => reader.listCollection('ingredients')),
    /maxPagesPerCollection=1/
  );

  let boundedPageSize;
  const tooManyDocuments = {
    async get(_path, options) {
      boundedPageSize = options.queryParams.pageSize;
      return { body: { documents: [{ name: 'one' }, { name: 'two' }], nextPageToken: 'page-2' } };
    }
  };
  await assert.rejects(
    runProductionFirestoreRead({
      projectId: 'misechef-fa4bf',
      confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR document-limit-run',
      firestore: tooManyDocuments,
      limits: { ...productionFirestoreLimits, pageSize: 3, maxDocumentsPerCollection: 2 },
      runId: 'document-limit-run',
      logger: () => {}
    }, reader => reader.listCollection('ingredients')),
    /maxDocumentsPerCollection=2/
  );
  assert.equal(boundedPageSize, '2');
});

test('Production Firestore reader enforces run-wide request, page, and document caps', async () => {
  const requestTelemetry = [];
  let requestCalls = 0;
  await assert.rejects(runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR request-cap-run',
    firestore: {
      async get() {
        requestCalls += 1;
        return { body: { name: `documents/${requestCalls}` } };
      }
    },
    limits: { ...productionFirestoreLimits, maxRequests: 1 },
    runId: 'request-cap-run',
    logger: line => requestTelemetry.push(JSON.parse(line))
  }, async reader => {
    await reader.getDocument('ingredients/one');
    await reader.getDocument('ingredients/two');
  }), /maxRequests=1/);
  assert.equal(requestCalls, 1);
  assert.equal(requestTelemetry.at(-1).abortReason, 'request_cap');

  const pageTelemetry = [];
  let pageCalls = 0;
  await assert.rejects(runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR global-page-cap-run',
    firestore: {
      async get() {
        pageCalls += 1;
        return { body: { documents: [{ name: `ingredients/${pageCalls}` }], nextPageToken: `page-${pageCalls}` } };
      }
    },
    limits: { ...productionFirestoreLimits, maxPages: 1 },
    runId: 'global-page-cap-run',
    logger: line => pageTelemetry.push(JSON.parse(line))
  }, reader => reader.listCollection('ingredients')), /maxPages=1/);
  assert.equal(pageCalls, 1);
  assert.equal(pageTelemetry.at(-1).abortReason, 'page_cap');

  const documentTelemetry = [];
  let documentCalls = 0;
  await assert.rejects(runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR global-document-cap-run',
    firestore: {
      async get() {
        documentCalls += 1;
        return { body: { name: `documents/${documentCalls}` } };
      }
    },
    limits: { ...productionFirestoreLimits, maxDocumentsPerCollection: 2, maxDocuments: 2 },
    runId: 'global-document-cap-run',
    logger: line => documentTelemetry.push(JSON.parse(line))
  }, async reader => {
    await reader.getDocument('ingredients/one');
    await reader.getDocument('recipes/one');
    await reader.getDocument('invoices/one');
  }), /maxDocuments=2/);
  assert.equal(documentCalls, 2);
  assert.equal(documentTelemetry.at(-1).abortReason, 'document_cap');
  assert.equal(documentTelemetry.at(-1).returnedDocumentCount, 2);
});

test('Production confirmation failures emit final count-only telemetry with an abort reason', async () => {
  const telemetry = [];
  await assert.rejects(runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'no',
    firestore: { async get() { throw new Error('must not execute'); } },
    limits: productionFirestoreLimits,
    runId: 'confirmation-failure-run',
    logger: line => telemetry.push(JSON.parse(line))
  }, async () => null), /exact run-bound confirmation/);

  assert.equal(telemetry.length, 1);
  assert.deepEqual({
    event: telemetry[0].event,
    project: telemetry[0].project,
    runId: telemetry[0].runId,
    requestCount: telemetry[0].requestCount,
    pageCount: telemetry[0].pageCount,
    returnedDocumentCount: telemetry[0].returnedDocumentCount,
    outcome: telemetry[0].outcome,
    abortReason: telemetry[0].abortReason
  }, {
    event: 'production_firestore_read_run_complete',
    project: 'misechef-fa4bf',
    runId: 'confirmation-failure-run',
    requestCount: 0,
    pageCount: 0,
    returnedDocumentCount: 0,
    outcome: 'failed',
    abortReason: 'confirmation_mismatch'
  });
});

test('guarded dry-run reader exposes no write operation and never invokes mocked writes', async () => {
  let writeCalls = 0;
  const firestore = {
    async get() { return { body: {} }; },
    async patch() { writeCalls += 1; },
    async delete() { writeCalls += 1; }
  };
  await runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR dry-run-read-only',
    firestore,
    limits: productionFirestoreLimits,
    runId: 'dry-run-read-only',
    logger: () => {}
  }, async reader => {
    assert.deepEqual(Object.keys(reader).sort(), ['getDocument', 'listCollection', 'listRootCollectionIds']);
    assert.equal(reader.setDocument, undefined);
    await reader.getDocument('ingredients/one');
  });
  assert.equal(writeCalls, 0);
});

test('Production Firestore REST client is pinned and opaque outside the guarded module', async () => {
  const calls = [];
  class Client {
    constructor(options) {
      calls.push(options);
    }
    async get() {
      return { body: {} };
    }
    async patch() {
      throw new Error('raw write must remain unreachable');
    }
  }
  const handle = createProductionFirestoreRestClient(Client);
  assert.deepEqual(Object.keys(handle), []);
  assert.equal(handle.get, undefined);
  assert.equal(handle.patch, undefined);
  assert.deepEqual(calls, [{
    urlPrefix: 'https://firestore.googleapis.com',
    apiVersion: 'v1',
    auth: true
  }]);
  await runProductionFirestoreRead({
    projectId: 'misechef-fa4bf',
    confirmation: 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR opaque-client-run',
    firestore: handle,
    limits: productionFirestoreLimits,
    runId: 'opaque-client-run',
    logger: () => {}
  }, reader => reader.getDocument('ingredients/one'));
});

test('policy detects raw utility collection reads regardless of naming, pagination, or guard imports', () => {
  const findings = findUnguardedProductionFirestoreReads([
    {
      path: 'scripts/inspectProduction.mjs',
      source: `import { runProductionFirestoreRead } from './productionFirestoreReadSafety.mjs';\n`
        + `const firestore = new Client({ urlPrefix: 'https://firestore.googleapis.com' });\n`
        + `await firestore.get(path, { queryParams: { pageSize: '1000' } });`
    },
    {
      path: 'scripts/migrateProduction.ts',
      source: `await getDocs(collection(db, 'ingredients'));`
    }
  ]);
  assert.deepEqual(findings.map(finding => finding.path).sort(), [
    'scripts/inspectProduction.mjs',
    'scripts/inspectProduction.mjs',
    'scripts/migrateProduction.ts'
  ]);

  assert.deepEqual(findUnguardedProductionFirestoreReads([{
    path: 'scripts/inspectProduction.mjs',
    source: `const confirmation = 'READ PRODUCTION FIRESTORE misechef-fa4bf FOR fixed-run';`
  }]), [{
    path: 'scripts/inspectProduction.mjs',
    reason: 'hard-coded Production read confirmation'
  }]);

  assert.deepEqual(findUnguardedProductionFirestoreReads([{
    path: 'scripts/report.mjs',
    source: `const snapshot = await db.collection(collectionName).orderBy('createdAt').limit(100).get();`
  }]), [{
    path: 'scripts/report.mjs',
    reason: 'raw Firebase Admin SDK collection read'
  }]);
});

test('repository has no unguarded Firestore collection-list utility', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = ['scripts', 'tools', 'migrations', 'maintenance', 'ops', 'admin']
    .filter(directory => existsSync(path.join(repositoryRoot, directory)))
    .flatMap(directory => readdirSync(path.join(repositoryRoot, directory), { recursive: true })
      .filter(filePath => /\.(?:[cm]?js|tsx?)$/.test(filePath))
      .filter(filePath => !/\.test\./.test(filePath))
      .map(filePath => ({
        path: `${directory}/${filePath}`,
        source: readFileSync(path.join(repositoryRoot, directory, filePath), 'utf8')
      })))
    .filter(file => file.path !== 'scripts/productionFirestoreReadSafety.mjs');
  assert.deepEqual(findUnguardedProductionFirestoreReads(files), []);

  const adminSource = readFileSync(new URL('../src/modules/admin/services/adminCompanyService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(adminSource, /getDocs\(collection\(db,\s*['\"]ingredients['\"]\)\)/);
  assert.match(adminSource, /where\(['\"]supplierId['\"],\s*['\"]!=['\"],\s*['\"]['\"]\)/);
  assert.match(adminSource, /limit\(ADMIN_SUPPLIER_METRIC_INGREDIENT_CAP \+ 1\)/);
  assert.match(adminSource, /ingredientsSnapshot\.size > ADMIN_SUPPLIER_METRIC_INGREDIENT_CAP/);
});
