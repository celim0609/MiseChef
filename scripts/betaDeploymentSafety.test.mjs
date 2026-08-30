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
  BETA_STORAGE_BUCKET,
  BETA_STORAGE_TARGET,
  FULL_BETA_RESOURCE_PLAN,
  MANDATORY_BETA_BASELINE,
  PINNED_FIREBASE_CLI_VERSION,
  PRODUCTION_PROJECT_ID,
  assertArtifactCompatibility,
  assertAuthority,
  assertCanonicalContext,
  assertCleanSource,
  assertExplicitBetaStorageTarget,
  assertExactResourcePlan,
  assertLiveReleaseUnchanged,
  assertLiveBaseline,
  assertPinnedFirebaseCliStorageBehavior,
  resolveStorageTarget,
  sha256File
} from './betaDeploymentSafety.mjs';
import {
  RELEASE_28_INCIDENT,
  RELEASE_28_RECOVERY_AUTHORIZATION,
  RELEASE_28_RECOVERY_CONFIRMATION,
  assertRelease28CandidateArtifact,
  assertRelease28FailedRun,
  assertRelease28PartialState,
  assertRelease28RecoveryConverged,
  resolveRelease28RecoveryMode
} from './betaRelease28Recovery.mjs';

const release28Functions = () => Object.entries(RELEASE_28_INCIDENT.functions).map(([id, value]) => ({
  id,
  generation: value.generation,
  hash: value.hash,
  configurationHash: value.configurationHash,
  state: 'ACTIVE'
}));

const release28Live = () => ({
  rootAsset: RELEASE_28_INCIDENT.rootAsset,
  storeAsset: RELEASE_28_INCIDENT.storeAsset,
  releaseMetadata: structuredClone(RELEASE_28_INCIDENT.priorManifest),
  releaseCommit: RELEASE_28_INCIDENT.priorCommit,
  releaseSourceTree: RELEASE_28_INCIDENT.priorSourceTree,
  releaseProtectedBaseline: MANDATORY_BETA_BASELINE,
  releaseBuildId: RELEASE_28_INCIDENT.priorManifest.buildId
});

const release28GitChecks = {
  resolveSourceTree: commit => commit === RELEASE_28_INCIDENT.priorCommit
    ? RELEASE_28_INCIDENT.priorSourceTree
    : null,
  isAncestor: (ancestor, descendant) => (
    ancestor === MANDATORY_BETA_BASELINE && descendant === RELEASE_28_INCIDENT.priorCommit
  )
};

const assertKnownRelease28Partial = overrides => assertRelease28PartialState({
  head: RELEASE_28_INCIDENT.candidateCommit,
  sourceTree: RELEASE_28_INCIDENT.candidateSourceTree,
  liveFingerprint: release28Live(),
  functions: release28Functions(),
  ...release28GitChecks,
  ...overrides
});

const release28ConvergedState = () => {
  const manifest = {
    kind: 'misechef-beta-release',
    version: 1,
    buildId: 'recovery-build',
    builtAt: new Date().toISOString(),
    sourceCommit: RELEASE_28_INCIDENT.candidateCommit,
    sourceTree: RELEASE_28_INCIDENT.candidateSourceTree,
    protectedBaseline: MANDATORY_BETA_BASELINE,
    entryAsset: RELEASE_28_INCIDENT.storeAsset,
    entryAssetSha256: 'a'.repeat(64),
    storeShellAsset: RELEASE_28_INCIDENT.storeAsset
  };
  return {
    manifest,
    functions: release28Functions(),
    liveFingerprint: {
      rootAsset: manifest.entryAsset,
      storeAsset: manifest.entryAsset,
      releaseMetadata: manifest,
      releaseCommit: manifest.sourceCommit,
      releaseSourceTree: manifest.sourceTree,
      releaseProtectedBaseline: manifest.protectedBaseline
    },
    assetProof: {
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      sha256: manifest.entryAssetSha256
    }
  };
};

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

test('explicit Storage target resolves only to the protected Beta bucket and fails closed for Production', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const firebaseConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'firebase.json'), 'utf8'));
  const firebaseRc = JSON.parse(readFileSync(path.join(repositoryRoot, '.firebaserc'), 'utf8'));

  assert.doesNotThrow(() => assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc }));
  assert.deepEqual(
    resolveStorageTarget(firebaseRc, BETA_PROJECT_ID, BETA_STORAGE_TARGET),
    [BETA_STORAGE_BUCKET]
  );
  assert.deepEqual(
    resolveStorageTarget(firebaseRc, PRODUCTION_PROJECT_ID, BETA_STORAGE_TARGET),
    []
  );

  const productionMappedRc = structuredClone(firebaseRc);
  productionMappedRc.targets[PRODUCTION_PROJECT_ID] = {
    storage: { [BETA_STORAGE_TARGET]: [BETA_STORAGE_BUCKET] }
  };
  assert.throws(
    () => assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc: productionMappedRc }),
    /must not resolve for non-Beta project/
  );
});

test('pinned Firebase CLI preparation bypasses defaultBucket discovery for explicit Storage arrays', () => {
  const guardedPrepareSource = `
    let rulesConfig = options.config.get("storage");
    if (!Array.isArray(rulesConfig) && options.project) {
      const defaultBucket = await gcp.storage.getDefaultBucket(options.project);
      rulesConfig = [Object.assign(rulesConfig, { bucket: defaultBucket })];
    }
    for (const ruleConfig of rulesConfig) {}
  `;
  assert.doesNotThrow(() => assertPinnedFirebaseCliStorageBehavior({
    version: PINNED_FIREBASE_CLI_VERSION,
    prepareSource: guardedPrepareSource
  }));
  assert.throws(() => assertPinnedFirebaseCliStorageBehavior({
    version: PINNED_FIREBASE_CLI_VERSION,
    prepareSource: 'const bucket = await gcp.storage.getDefaultBucket(options.project);'
  }), /bypass defaultBucket discovery/);
});

test('dirty worktree fails unless the exact generated shell exception is supplied', () => {
  assert.throws(() => assertCleanSource(['src/App.tsx']), /worktree is dirty/);
  assert.doesNotThrow(() => assertCleanSource(
    ['functions/generated/publicStoreAppShell.html'],
    ['functions/generated/publicStoreAppShell.html']
  ));
});

test('both Beta safety validators preserve the exact allowed generated shell path', () => {
  const safetyEntryPoints = [
    'validateBetaPredeploy.mjs',
    'validateBetaReleaseBaseline.mjs'
  ];
  const porcelain = ' M functions/generated/publicStoreAppShell.html\n';
  const parsedPaths = porcelain
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => line.slice(3));

  assert.deepEqual(parsedPaths, ['functions/generated/publicStoreAppShell.html']);
  for (const entryPoint of safetyEntryPoints) {
    const source = readFileSync(new URL(`./${entryPoint}`, import.meta.url), 'utf8');
    assert.match(source, /const git = args =>[^\n]+\.trimEnd\(\);/);
    assert.match(source, /git\(\['status', '--porcelain=v1', '--untracked-files=all'\]\)/);
    assert.doesNotThrow(() => assertCleanSource(parsedPaths, ALLOWED_POST_BUILD_DIRTY_PATHS));
  }
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

test('missing, unreadable, or incoherent live release manifests block deployment', () => {
  const sourceCommit = 'a'.repeat(40);
  const sourceTree = 'b'.repeat(40);
  const protectedBaseline = 'c'.repeat(40);
  const validGitChecks = {
    resolveSourceTree: commit => commit === sourceCommit ? sourceTree : null,
    isAncestor: (ancestor, descendant) => ancestor === protectedBaseline && descendant === sourceCommit
  };
  assert.throws(() => assertLiveBaseline({
    liveFingerprint: { releaseCommit: null, rootAsset: '/assets/index-old.js', storeAsset: null },
    ...validGitChecks
  }), /metadata is missing or unreadable/);
  assert.throws(() => assertLiveBaseline({
    liveFingerprint: {
      releaseCommit: sourceCommit,
      releaseSourceTree: sourceTree,
      releaseProtectedBaseline: protectedBaseline,
      rootAsset: '/assets/index-a.js',
      storeAsset: '/assets/index-b.js'
    },
    ...validGitChecks
  }), /do not identify one coherent release/);
  assert.doesNotThrow(() => assertLiveBaseline({
    liveFingerprint: {
      releaseCommit: sourceCommit,
      releaseSourceTree: sourceTree,
      releaseProtectedBaseline: protectedBaseline,
      rootAsset: '/assets/index-a.js',
      storeAsset: '/assets/index-a.js'
    },
    ...validGitChecks
  }));
});

test('the exact protected Release #28 partial state is accepted only in incident recovery mode', () => {
  assert.equal(resolveRelease28RecoveryMode({
    confirmation: '',
    authorization: RELEASE_28_RECOVERY_AUTHORIZATION,
    githubActions: true,
    ciLockId: 'misechef-beta-deployment'
  }), false);
  assert.equal(resolveRelease28RecoveryMode({
    confirmation: RELEASE_28_RECOVERY_CONFIRMATION,
    authorization: RELEASE_28_RECOVERY_AUTHORIZATION,
    githubActions: true,
    ciLockId: 'misechef-beta-deployment'
  }), true);
  assert.match(assertKnownRelease28Partial().fingerprint, /^[0-9a-f]{64}$/);
  assert.throws(() => resolveRelease28RecoveryMode({
    confirmation: RELEASE_28_RECOVERY_CONFIRMATION,
    authorization: '',
    githubActions: true,
    ciLockId: 'misechef-beta-deployment'
  }), /protected Beta environment/);
});

test('Release #28 recovery is bound to the exact failed protected run evidence', () => {
  const successfulSteps = [
    'Verify exact approved candidate SHA',
    'Validate actual release candidate with immutable trusted gate',
    'Run complete immutable trusted candidate regression gate',
    'Run Store Sets Firestore authorization suite',
    'Authenticate to Beta only'
  ].map(name => ({ name, conclusion: 'success' }));
  const evidence = {
    run: {
      id: Number(RELEASE_28_INCIDENT.failedRunId),
      name: 'Beta Release',
      run_number: 28,
      head_sha: RELEASE_28_INCIDENT.candidateCommit,
      conclusion: 'failure',
      path: '.github/workflows/deploy-beta.yml'
    },
    jobs: [{ steps: [...successfulSteps, {
      name: 'Run canonical protected full-resource Beta release', conclusion: 'failure'
    }] }]
  };
  assert.doesNotThrow(() => assertRelease28FailedRun(evidence));
  assert.throws(() => assertRelease28FailedRun({
    ...evidence,
    run: { ...evidence.run, head_sha: RELEASE_28_INCIDENT.priorCommit }
  }), /authorized failed Release #28/);
});

test('Release #28 recovery rejects any changed root asset', () => {
  assert.throws(() => assertKnownRelease28Partial({
    liveFingerprint: { ...release28Live(), rootAsset: '/assets/index-third.js' }
  }), /root or public Store asset/);
});

test('Release #28 recovery rejects any changed Store asset', () => {
  assert.throws(() => assertKnownRelease28Partial({
    liveFingerprint: { ...release28Live(), storeAsset: '/assets/index-third.js' }
  }), /root or public Store asset/);
});

test('Release #28 recovery rejects any unexpected Function generation', () => {
  const functions = release28Functions();
  functions[0] = { ...functions[0], generation: `${functions[0].generation}9` };
  assert.throws(() => assertKnownRelease28Partial({ functions }), /recorded 18\/19 split/);
});

test('Release #28 recovery rejects a third or unknown release state', () => {
  const functions = release28Functions();
  functions.push({ id: 'unknownThirdReleaseFunction', generation: '1', hash: 'third', state: 'ACTIVE' });
  assert.throws(() => assertKnownRelease28Partial({ functions }), /recorded 18\/19 split/);
  assert.throws(() => assertKnownRelease28Partial({
    liveFingerprint: {
      ...release28Live(),
      releaseMetadata: {
        ...RELEASE_28_INCIDENT.priorManifest,
        sourceCommit: RELEASE_28_INCIDENT.candidateCommit
      }
    }
  }), /manifest metadata/);
});

test('normal releases still reject the known incoherent Release #28 baseline', () => {
  assert.throws(() => assertLiveBaseline({
    liveFingerprint: release28Live(),
    ...release28GitChecks
  }), /do not identify one coherent release/);
});

test('Release #28 recovery accepts exact no-op Function convergence and becomes single-use', () => {
  const converged = release28ConvergedState();
  assert.doesNotThrow(() => assertRelease28CandidateArtifact(converged.manifest));
  assert.doesNotThrow(() => assertRelease28RecoveryConverged(converged));
  assert.throws(() => assertKnownRelease28Partial({
    liveFingerprint: converged.liveFingerprint,
    functions: converged.functions
  }), /manifest metadata/);
});

test('Release #28 recovery rejects a stale Function source hash', () => {
  const converged = release28ConvergedState();
  converged.functions[0] = { ...converged.functions[0], hash: 'stale-source-hash' };
  assert.throws(() => assertRelease28RecoveryConverged(converged), /authorized candidate source hash/);
});

test('Release #28 recovery rejects an inactive Function', () => {
  const converged = release28ConvergedState();
  converged.functions[0] = { ...converged.functions[0], state: 'FAILED' };
  assert.throws(() => assertRelease28RecoveryConverged(converged), /exactly 37 ACTIVE Functions/);
});

test('Release #28 recovery rejects an unexpected Function', () => {
  const converged = release28ConvergedState();
  converged.functions.push({
    id: 'unknownFunction',
    generation: '1',
    hash: 'unknown',
    configurationHash: 'unknown',
    state: 'ACTIVE'
  });
  assert.throws(() => assertRelease28RecoveryConverged(converged), /exactly 37 ACTIVE Functions/);
});

test('Release #28 recovery rejects stale Function configuration', () => {
  const converged = release28ConvergedState();
  converged.functions[0] = { ...converged.functions[0], configurationHash: 'stale-configuration' };
  assert.throws(() => assertRelease28RecoveryConverged(converged), /authorized candidate configuration/);
});

test('Release #28 recovery rejects a mixed or unknown release state', () => {
  const converged = release28ConvergedState();
  converged.liveFingerprint = {
    ...converged.liveFingerprint,
    rootAsset: RELEASE_28_INCIDENT.rootAsset
  };
  assert.throws(() => assertRelease28RecoveryConverged(converged), /do not reference the recovered candidate asset/);
});

test('historical live manifests require exact SHAs, a matching source tree, and valid history', () => {
  const sourceCommit = 'a'.repeat(40);
  const sourceTree = 'b'.repeat(40);
  const historicalBaseline = 'c'.repeat(40);
  const liveFingerprint = {
    releaseCommit: sourceCommit,
    releaseSourceTree: sourceTree,
    releaseProtectedBaseline: historicalBaseline,
    rootAsset: '/assets/index-a.js',
    storeAsset: '/assets/index-a.js'
  };

  assert.doesNotThrow(() => assertLiveBaseline({
    liveFingerprint,
    resolveSourceTree: () => sourceTree,
    isAncestor: (ancestor, descendant) => ancestor === historicalBaseline && descendant === sourceCommit
  }));
  for (const field of ['releaseCommit', 'releaseSourceTree', 'releaseProtectedBaseline']) {
    assert.throws(() => assertLiveBaseline({
      liveFingerprint: { ...liveFingerprint, [field]: 'not-a-sha' },
      resolveSourceTree: () => sourceTree,
      isAncestor: () => true
    }), /metadata is missing or unreadable/);
  }
  assert.throws(() => assertLiveBaseline({
    liveFingerprint,
    resolveSourceTree: () => 'd'.repeat(40),
    isAncestor: () => true
  }), /sourceTree does not match/);
  assert.throws(() => assertLiveBaseline({
    liveFingerprint,
    resolveSourceTree: () => sourceTree,
    isAncestor: () => false
  }), /protectedBaseline is not an ancestor/);
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
    const config = Array.isArray(firebase[resource]) ? firebase[resource][0] : firebase[resource];
    assert.deepEqual(config.predeploy, ['node scripts/validateBetaPredeploy.mjs'], resource);
  }
  assert.equal(firebase.firestore.rules, 'firestore.rules');
  assert.equal(firebase.firestore.indexes, 'firestore.indexes.json');
});

test('the canonical deploy command is the only package Beta deploy entry point', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const protectedTests = readFileSync(path.join(repositoryRoot, 'scripts', 'runBetaProtectedTests.mjs'), 'utf8');
  assert.equal(pkg.scripts['deploy:beta'], 'node scripts/deployBeta.mjs');
  assert.match(pkg.scripts['test:resume-import:rules'], /resumeImportJobAccessControl\.test\.mjs/);
  for (const requiredSuite of [
    'tests/resumeImportJobAccessControl.test.mjs',
    'tests/storeSetsAccessControl.test.mjs',
    'tests/homepagePromotionAccessControl.test.mjs',
    'tests/businessEntitlementAccessControl.test.mjs'
  ]) assert.match(protectedTests, new RegExp(requiredSuite.replaceAll('.', '\\.')));
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /FIREBASE_DEPLOY_TARGET=beta firebase deploy/);
});

test('Release #28 recovery controller retains the full plan and every convergence proof', () => {
  const controller = readFileSync(new URL('./recoverBetaRelease28.mjs', import.meta.url), 'utf8');
  for (const marker of [
    'assertRelease28PartialState',
    'verifyRelease28FailedRun',
    'assertRelease28CandidateArtifact',
    'assertArtifactCompatibility',
    'assertPinnedFirebaseCliStorageBehavior',
    'assertRelease28RecoveryConverged',
    'readLiveAssetProof',
    'readBetaFunctionState',
    'FULL_BETA_RESOURCE_PLAN.join'
  ]) assert.match(controller, new RegExp(marker));
  assert.match(controller, /firebase', \[\s+'deploy'/);
  assert.doesNotMatch(controller, /--only',\s+'(?:functions|hosting|firestore|storage)'/);
});

test('baseline validation fails instead of skipping when target context is missing', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync('node', ['scripts/validateBetaReleaseBaseline.mjs'], {
    cwd: repositoryRoot,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'FIREBASE_DEPLOY_TARGET')),
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /--trusted-root is required/);
});

test('protected CI supplies external authority and an authoritative concurrency group', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'deploy-beta.yml'), 'utf8');
  const recoveryWorkflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'recover-beta-release-28.yml'), 'utf8');
  const validationWorkflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'validate-beta-candidate.yml'), 'utf8');
  assert.match(workflow, /group: misechef-beta-deployment/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /vars\.MISECHEF_BETA_PROTECTED_BASELINE/);
  assert.match(workflow, /secrets\.FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA/);
  assert.match(workflow, /expected_candidate_sha/);
  assert.doesNotMatch(workflow, /release_28_recovery|RECOVER BETA RELEASE 28/);
  assert.match(workflow, /ref: 9c2173b9f9ae42b1fc09826c57cef46697759452/);
  assert.match(workflow, /validateBetaReleaseBaseline\.mjs/);
  assert.match(workflow, /runBetaProtectedTests\.mjs/);
  assert.match(workflow, /MISECHEF_BETA_TRUSTED_GATE_ROOT/);
  assert.match(workflow, /npm run deploy:beta/);
  assert.match(validationWorkflow, /github\.event\.pull_request\.base\.sha/);
  assert.match(validationWorkflow, /--trusted-root/);
  assert.match(validationWorkflow, /--candidate-root/);
  assert.match(validationWorkflow, /runBetaProtectedTests\.mjs/);
  assert.match(recoveryWorkflow, /group: misechef-beta-deployment/);
  assert.match(recoveryWorkflow, /vars\.MISECHEF_BETA_RELEASE_28_RECOVERY_GATE_SHA/);
  assert.match(recoveryWorkflow, /vars\.MISECHEF_BETA_RELEASE_28_RECOVERY_AUTHORIZATION/);
  assert.match(recoveryWorkflow, /github\.token/);
  assert.match(recoveryWorkflow, new RegExp(RELEASE_28_INCIDENT.candidateCommit));
  assert.match(recoveryWorkflow, /functions,hosting,firestore,storage|recoverBetaRelease28\.mjs/);
  assert.doesNotMatch(recoveryWorkflow, new RegExp(RELEASE_28_RECOVERY_AUTHORIZATION));
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
