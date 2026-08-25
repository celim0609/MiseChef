import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_POST_BUILD_DIRTY_PATHS,
  BETA_PROJECT_ID,
  FULL_BETA_RESOURCE_PLAN,
  MANDATORY_BETA_BASELINE,
  assertArtifactCompatibility,
  assertAuthority,
  assertCanonicalContext,
  assertCleanSource,
  assertExactResourcePlan,
  assertLiveReleaseUnchanged,
  sha256File
} from './betaDeploymentSafety.mjs';

test('stale branch, Firestore-only, and Storage-only candidates fail ancestry', () => {
  for (const resource of ['firestore', 'storage']) {
    assert.throws(() => assertAuthority({
      authorityBaseline: MANDATORY_BETA_BASELINE,
      documentedBaseline: MANDATORY_BETA_BASELINE,
      head: `stale-${resource}`,
      isAncestor: () => false
    }), /not descended/);
  }
});

test('a feature branch cannot casually change the protected baseline', () => {
  assert.throws(() => assertAuthority({
    authorityBaseline: MANDATORY_BETA_BASELINE,
    documentedBaseline: 'feature-branch-baseline',
    head: 'candidate',
    isAncestor: () => true
  }), /does not match authoritative baseline/);
});

test('missing FIREBASE_DEPLOY_TARGET fails for the Beta project', () => {
  assert.throws(() => assertCanonicalContext({
    firebaseTarget: '',
    firebaseProject: BETA_PROJECT_ID,
    sessionFile: '/tmp/session',
    sessionNonce: 'nonce',
    githubActions: true,
    ciLockId: 'misechef-beta-deployment'
  }), /missing FIREBASE_DEPLOY_TARGET=beta/);
});

test('direct Beta Hosting deploy and partial plans fail without the canonical full-resource session', () => {
  assert.throws(() => assertCanonicalContext({
    firebaseTarget: 'beta',
    firebaseProject: BETA_PROJECT_ID,
    sessionFile: '',
    sessionNonce: '',
    githubActions: false,
    allowLocalDeploy: false
  }), /canonical release session is missing/);
  assert.throws(() => assertExactResourcePlan(['hosting']), /Unsupported partial Beta resource plan/);
  assert.throws(() => assertExactResourcePlan(['firestore']), /Unsupported partial Beta resource plan/);
  assert.throws(() => assertExactResourcePlan(['storage']), /Unsupported partial Beta resource plan/);
});

test('dirty worktree fails unless the exact generated shell exception is supplied', () => {
  assert.throws(() => assertCleanSource(['src/App.tsx']), /worktree is dirty/);
  assert.doesNotThrow(() => assertCleanSource(
    ['functions/generated/publicStoreAppShell.html'],
    ['functions/generated/publicStoreAppShell.html']
  ));
});

test('Git porcelain parsing preserves the exact allowed generated shell path', () => {
  const porcelain = ' M functions/generated/publicStoreAppShell.html\n';
  const parsedPaths = porcelain
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => line.slice(3));

  assert.deepEqual(parsedPaths, ['functions/generated/publicStoreAppShell.html']);
  assert.doesNotThrow(() => assertCleanSource(parsedPaths, ALLOWED_POST_BUILD_DIRTY_PATHS));
});

test('stale dist manifest fails before reading deploy assets', () => {
  assert.throws(() => assertArtifactCompatibility({
    repositoryRoot: '/unused',
    manifest: { sourceCommit: 'old', protectedBaseline: MANDATORY_BETA_BASELINE },
    head: 'new',
    baseline: MANDATORY_BETA_BASELINE
  }), /dist manifest is stale/);
});

test('mismatched Hosting and renderPublicStore assets fail', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-artifact-'));
  try {
    mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
    mkdirSync(path.join(root, 'functions', 'generated'), { recursive: true });
    writeFileSync(path.join(root, 'dist', 'index.html'), '<script type="module" src="/assets/index-new.js"></script>');
    writeFileSync(path.join(root, 'functions', 'generated', 'publicStoreAppShell.html'), '<script type="module" src="/assets/index-old.js"></script>');
    writeFileSync(path.join(root, 'dist', 'assets', 'index-new.js'), 'new');
    assert.throws(() => assertArtifactCompatibility({
      repositoryRoot: root,
      manifest: {
        sourceCommit: 'head',
        protectedBaseline: MANDATORY_BETA_BASELINE,
        sourceTree: 'tree',
        currentSourceTree: 'tree',
        builtAt: new Date().toISOString(),
        entryAsset: '/assets/index-new.js',
        entryAssetSha256: sha256File(path.join(root, 'dist', 'assets', 'index-new.js'))
      },
      head: 'head',
      baseline: MANDATORY_BETA_BASELINE
    }), /asset mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('concurrent or newer live Beta release fails', () => {
  assert.throws(() => assertLiveReleaseUnchanged(
    { rootAsset: '/assets/index-a.js', storeAsset: '/assets/index-a.js' },
    { rootAsset: '/assets/index-b.js', storeAsset: '/assets/index-b.js' }
  ), /Live Beta release changed/);
});

test('a clean current integrated candidate with matching artifacts and CI lock passes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-valid-'));
  try {
    mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
    mkdirSync(path.join(root, 'functions', 'generated'), { recursive: true });
    const shell = '<script type="module" src="/assets/index-valid.js"></script>';
    writeFileSync(path.join(root, 'dist', 'index.html'), shell);
    writeFileSync(path.join(root, 'functions', 'generated', 'publicStoreAppShell.html'), shell);
    writeFileSync(path.join(root, 'dist', 'assets', 'index-valid.js'), 'valid');

    assert.doesNotThrow(() => assertAuthority({
      authorityBaseline: MANDATORY_BETA_BASELINE,
      documentedBaseline: MANDATORY_BETA_BASELINE,
      head: 'candidate',
      isAncestor: () => true
    }));
    assert.doesNotThrow(() => assertCanonicalContext({
      firebaseTarget: 'beta',
      firebaseProject: BETA_PROJECT_ID,
      sessionFile: '/tmp/session',
      sessionNonce: 'nonce',
      githubActions: true,
      ciLockId: 'misechef-beta-deployment'
    }));
    assert.doesNotThrow(() => assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN));
    assert.doesNotThrow(() => assertArtifactCompatibility({
      repositoryRoot: root,
      manifest: {
        sourceCommit: 'candidate',
        protectedBaseline: MANDATORY_BETA_BASELINE,
        sourceTree: 'tree',
        currentSourceTree: 'tree',
        builtAt: new Date().toISOString(),
        entryAsset: '/assets/index-valid.js',
        entryAssetSha256: sha256File(path.join(root, 'dist', 'assets', 'index-valid.js'))
      },
      head: 'candidate',
      baseline: MANDATORY_BETA_BASELINE
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every Firebase resource invokes the canonical predeploy guard', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const firebase = JSON.parse(readFileSync(path.join(repositoryRoot, 'firebase.json'), 'utf8'));
  for (const resource of ['functions', 'hosting', 'firestore', 'storage']) {
    assert.deepEqual(firebase[resource].predeploy, ['node scripts/validateBetaPredeploy.mjs'], resource);
  }
  assert.equal(firebase.firestore.rules, 'firestore.rules');
  assert.equal(firebase.firestore.indexes, 'firestore.indexes.json');
});

test('the canonical deploy command is the only package Beta deploy entry point', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['deploy:beta'], 'node scripts/deployBeta.mjs');
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /FIREBASE_DEPLOY_TARGET=beta firebase deploy/);
});

test('baseline validation fails instead of skipping when target context is missing', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync('node', ['scripts/validateBetaReleaseBaseline.mjs'], {
    cwd: repositoryRoot,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'FIREBASE_DEPLOY_TARGET')),
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /refusing to skip/);
});

test('protected CI supplies external authority and an authoritative concurrency group', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'deploy-beta.yml'), 'utf8');
  assert.match(workflow, /group: misechef-beta-deployment/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /vars\.MISECHEF_BETA_PROTECTED_BASELINE/);
  assert.match(workflow, /secrets\.FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA/);
  assert.match(workflow, /npm run deploy:beta/);
});

test('repository baseline and documentation contain no stale protected-baseline references', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const baseline = JSON.parse(readFileSync(path.join(repositoryRoot, 'config', 'beta-release-baseline.json'), 'utf8'));
  const docs = readFileSync(path.join(repositoryRoot, 'docs', 'beta-release-baseline.md'), 'utf8');
  const agents = readFileSync(path.join(repositoryRoot, 'AGENTS.md'), 'utf8');
  assert.equal(baseline.minimumCommit, MANDATORY_BETA_BASELINE);
  assert.match(docs, new RegExp(MANDATORY_BETA_BASELINE));
  assert.match(agents, new RegExp(MANDATORY_BETA_BASELINE));
  assert.doesNotMatch(`${docs}\n${agents}`, /dfc581e|901b2aa/);
});
