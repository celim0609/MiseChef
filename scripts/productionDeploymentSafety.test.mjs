import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
