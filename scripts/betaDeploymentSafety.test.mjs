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
import {
  BETA_RUN_33530702897,
  BETA_RUN_33530702897_AUTHORIZATION,
  BETA_RUN_33530702897_CONFIRMATION,
  assertBetaRun33530702897CandidateArtifact,
  assertBetaRun33530702897FailedRun,
  assertBetaRun33530702897PartialState,
  assertBetaRun33530702897RecoveryConverged,
  expectedCandidateFunctions,
  loadCloudRunServicesWithFirebaseCli,
  readCloudRunServiceState,
  resolveBetaRun33530702897RecoveryMode
} from './betaRun33530702897Recovery.mjs';

const betaRunFunctionGenerations = Object.freeze({
  activateMiseChefHost: '1788279675848143',
  authorizeWorkspaceFeature: '1788279743657733',
  cancelInvoiceUpload: '1788279743683565',
  cancelPublicStorePayment: '1788279671075432',
  cleanupMyMiseChefGroupOrder: '1788279743658333',
  createInvoiceUpload: '1788279743814594',
  createMiseChefGroupOrder: '1788279743633331',
  createPublicStorePayment: '1788279738899175',
  expireWorkspaceTrials: '1788279743692302',
  extractPersonalExpenseReceipt: '1788279669833488',
  generateRecipeSteps: '1788279738869930',
  getDashboardAiUsage: '1788279743615027',
  getMyMiseChefGroupOrder: '1788279743848864',
  getPublicDiscoverContent: '1788279738874529',
  getPublicMiseChefGroupOrder: '1788279743674758',
  getPublicStorePaymentResult: '1788279738964922',
  getWorkspaceSubscription: '1788279743991539',
  listApprovedProducts: '1788279743529616',
  listMyMiseChefGroupOrders: '1788279743686840',
  listMyMiseChefStoreOrders: '1788279738954604',
  parseInvoiceToJson: '1788279738534755',
  parseResumeToPortfolio: '1788279738876448',
  processResumeImportJob: '1788279739341066',
  provisionNewUserWorkspace: '1788279743735936',
  recordPersonalExpenseSettlement: '1788279738904863',
  renderPublicStore: '1788279738924800',
  reviewStoreManualPayment: '1788279738891656',
  scanRecipeImage: '1788279775951745',
  startMiseChefBusinessTrial: '1788279743587914',
  stripeStorePaymentWebhook: '1788279738965763',
  submitPublicStoreManualPayment: '1788279738883107',
  syncApprovedProductRecipes: '1788279744160106',
  syncCanonicalChefProfile: '1788279744435713',
  syncMiseChefGroupReward: '1788279744120525',
  syncPublicChefProfile: '1788279744298754',
  syncPublicRecipe: '1788279744107904',
  trackPublicProductClick: '1788279743677915',
  updateMyMiseChefGroupOrderStatus: '1788279743739600',
  updateStoreGroupOrderBatchStatus: '1788279738890602',
  updateStoreOrderStatus: '1788279739012235',
  uploadPublicStorePaymentReceipt: '1788279738893450'
});

const betaRunFunctions = () => expectedCandidateFunctions().map(item => ({
  ...item,
  generation: betaRunFunctionGenerations[item.id],
  state: 'ACTIVE'
}));

const readyService = (id, revision = `${id.toLowerCase()}-candidate-ready`) => ({
  id,
  latestCreatedRevision: revision,
  latestReadyRevision: revision,
  terminalState: 'CONDITION_SUCCEEDED',
  trafficStatuses: [{ revision, percent: 100, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }]
});

const betaRunServices = ({ converged = false } = {}) => expectedCandidateFunctions().map(({ id }) => {
  const failed = BETA_RUN_33530702897.failedServices[id];
  if (!failed || converged) return readyService(id);
  return {
    id,
    latestCreatedRevision: failed.latestCreatedRevision,
    latestReadyRevision: failed.latestReadyRevision,
    terminalState: 'CONDITION_FAILED',
    trafficStatuses: [{
      revision: failed.latestReadyRevision,
      percent: 100,
      type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION'
    }]
  };
});

const betaRunLive = () => ({
  rootAsset: BETA_RUN_33530702897.rootAsset,
  storeAsset: BETA_RUN_33530702897.storeAsset,
  releaseMetadata: structuredClone(BETA_RUN_33530702897.priorManifest),
  releaseCommit: BETA_RUN_33530702897.priorCommit,
  releaseSourceTree: BETA_RUN_33530702897.priorSourceTree,
  releaseProtectedBaseline: MANDATORY_BETA_BASELINE
});

const betaRunGitChecks = {
  resolveSourceTree: commit => commit === BETA_RUN_33530702897.priorCommit
    ? BETA_RUN_33530702897.priorSourceTree
    : null,
  isAncestor: (ancestor, descendant) => (
    ancestor === MANDATORY_BETA_BASELINE && descendant === BETA_RUN_33530702897.priorCommit
  )
};

const assertKnownBetaRunPartial = overrides => assertBetaRun33530702897PartialState({
  head: BETA_RUN_33530702897.candidateCommit,
  sourceTree: BETA_RUN_33530702897.candidateSourceTree,
  liveFingerprint: betaRunLive(),
  functions: betaRunFunctions(),
  services: betaRunServices(),
  storeAssetProof: { status: 200, contentType: 'text/html; charset=utf-8', sha256: 'fallback' },
  ...betaRunGitChecks,
  ...overrides
});

const betaRunConvergedState = () => {
  const manifest = {
    kind: 'misechef-beta-release',
    version: 1,
    buildId: 'incident-recovery-build',
    builtAt: new Date().toISOString(),
    sourceCommit: BETA_RUN_33530702897.candidateCommit,
    sourceTree: BETA_RUN_33530702897.candidateSourceTree,
    protectedBaseline: MANDATORY_BETA_BASELINE,
    entryAsset: BETA_RUN_33530702897.storeAsset,
    entryAssetSha256: 'a'.repeat(64),
    storeShellAsset: BETA_RUN_33530702897.storeAsset
  };
  return {
    manifest,
    functions: betaRunFunctions(),
    services: betaRunServices({ converged: true }),
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
      contentType: 'application/javascript; charset=utf-8',
      sha256: manifest.entryAssetSha256
    }
  };
};

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

test('Beta run 33530702897 recovery requires exact protected authorization and workflow lock', () => {
  assert.equal(resolveBetaRun33530702897RecoveryMode({
    confirmation: BETA_RUN_33530702897_CONFIRMATION,
    authorization: BETA_RUN_33530702897_AUTHORIZATION,
    githubActions: true,
    ciLockId: 'misechef-beta-deployment'
  }), true);
  for (const override of [
    { confirmation: 'RECOVER BETA' },
    { authorization: '' },
    { githubActions: false },
    { ciLockId: 'different-lock' }
  ]) {
    assert.throws(() => resolveBetaRun33530702897RecoveryMode({
      confirmation: BETA_RUN_33530702897_CONFIRMATION,
      authorization: BETA_RUN_33530702897_AUTHORIZATION,
      githubActions: true,
      ciLockId: 'misechef-beta-deployment',
      ...override
    }), /recovery refused/);
  }
});

test('Beta run 33530702897 recovery is bound to both exact failed attempts and their logs', () => {
  const successfulSteps = [
    'Verify exact approved candidate SHA',
    'Validate actual release candidate with immutable trusted gate',
    'Run complete immutable trusted candidate regression gate',
    'Run Store Sets Firestore authorization suite',
    'Authenticate to Beta only'
  ].map(name => ({ name, conclusion: 'success' }));
  const job = (id, attempt) => ({
    id: Number(id),
    name: 'deploy-beta',
    conclusion: 'failure',
    run_attempt: attempt,
    head_sha: BETA_RUN_33530702897.candidateCommit,
    steps: [...successfulSteps, {
      name: 'Run canonical protected full-resource Beta release', conclusion: 'failure'
    }]
  });
  const evidence = {
    run: {
      id: Number(BETA_RUN_33530702897.failedRunId),
      name: 'Beta Release',
      run_number: BETA_RUN_33530702897.failedRunNumber,
      run_attempt: 2,
      event: 'workflow_dispatch',
      head_branch: 'main',
      head_sha: BETA_RUN_33530702897.candidateCommit,
      conclusion: 'failure',
      path: '.github/workflows/deploy-beta.yml'
    },
    attemptOneJobs: [job(BETA_RUN_33530702897.attemptOneJobId, 1)],
    attemptTwoJobs: [job(BETA_RUN_33530702897.attemptTwoJobId, 2)],
    attemptOneLog: [
      'parseResumeToPortfolio',
      'reviewStoreManualPayment',
      'syncPublicChefProfile',
      'Container Healthcheck failed'
    ].join('\n'),
    attemptTwoLog: 'Live Beta Hosting and public Store assets do not identify one coherent release.'
  };
  assert.doesNotThrow(() => assertBetaRun33530702897FailedRun(evidence));
  assert.throws(() => assertBetaRun33530702897FailedRun({
    ...evidence,
    attemptTwoLog: 'different failure'
  }), /coherent-release refusal/);
  assert.throws(() => assertBetaRun33530702897FailedRun({
    ...evidence,
    attemptOneJobs: [job(BETA_RUN_33530702897.attemptOneJobId, 2)]
  }), /attempt 1/);
});

test('Beta run 33530702897 accepts only the exact audited partial live state', () => {
  assert.match(assertKnownBetaRunPartial().fingerprint, /^[0-9a-f]{64}$/);

  const functions = betaRunFunctions();
  functions[0] = { ...functions[0], generation: `${functions[0].generation}9` };
  assert.throws(() => assertKnownBetaRunPartial({ functions }), /41-Function inventory/);

  const services = betaRunServices();
  const failedIndex = services.findIndex(item => item.id === 'parseResumeToPortfolio');
  services[failedIndex] = readyService('parseResumeToPortfolio');
  assert.throws(() => assertKnownBetaRunPartial({ services }), /failed\/serving revision pair/);

  assert.throws(() => assertKnownBetaRunPartial({
    liveFingerprint: { ...betaRunLive(), rootAsset: '/assets/changed.js' }
  }), /root or public Store asset/);
  assert.throws(() => assertKnownBetaRunPartial({
    storeAssetProof: { status: 200, contentType: 'application/javascript', sha256: 'unexpected' }
  }), /HTML fallback/);
});

test('normal Beta release guard still rejects run 33530702897 partial state', () => {
  assert.throws(() => assertLiveBaseline({
    liveFingerprint: betaRunLive(),
    ...betaRunGitChecks
  }), /do not identify one coherent release/);
});

test('Beta run 33530702897 candidate artifact is exact and recovery convergence is complete', () => {
  const converged = betaRunConvergedState();
  assert.doesNotThrow(() => assertBetaRun33530702897CandidateArtifact(converged.manifest));
  assert.doesNotThrow(() => assertBetaRun33530702897RecoveryConverged(converged));

  const htmlFallback = structuredClone(converged);
  htmlFallback.assetProof.contentType = 'text/html';
  assert.throws(() => assertBetaRun33530702897RecoveryConverged(htmlFallback), /JavaScript bytes/);

  const staleFunction = structuredClone(converged);
  staleFunction.functions[0].configurationHash = 'stale';
  assert.throws(() => assertBetaRun33530702897RecoveryConverged(staleFunction), /authorized candidate/);

  const oldRevision = structuredClone(converged);
  const index = oldRevision.services.findIndex(item => item.id === 'syncPublicChefProfile');
  oldRevision.services[index] = readyService(
    'syncPublicChefProfile',
    BETA_RUN_33530702897.failedServices.syncPublicChefProfile.latestReadyRevision
  );
  assert.throws(() => assertBetaRun33530702897RecoveryConverged(oldRevision), /still serving its prior revision/);

  const notReady = structuredClone(converged);
  notReady.services[0].latestCreatedRevision = 'newer-failed-revision';
  assert.throws(() => assertBetaRun33530702897RecoveryConverged(notReady), /ready candidate revision/);
});

test('Beta recovery Cloud Run verification uses the expected Beta project and normalizes ready revisions', async () => {
  let requestedProject = '';
  const services = await readCloudRunServiceState({
    loadServices: async project => {
      requestedProject = project;
      return [{
        name: `projects/${project}/locations/us-central1/services/parseresumetoportfolio`,
        latestCreatedRevision: 'projects/p/locations/us-central1/services/s/revisions/revision-ready',
        latestReadyRevision: 'projects/p/locations/us-central1/services/s/revisions/revision-ready',
        terminalCondition: { state: 'CONDITION_SUCCEEDED' },
        trafficStatuses: [{
          type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
          revision: 'projects/p/locations/us-central1/services/s/revisions/revision-ready',
          percent: 100
        }]
      }];
    }
  });
  assert.equal(requestedProject, BETA_PROJECT_ID);
  assert.deepEqual(services, [{
    id: 'parseResumeToPortfolio',
    latestCreatedRevision: 'revision-ready',
    latestReadyRevision: 'revision-ready',
    terminalState: 'CONDITION_SUCCEEDED',
    trafficStatuses: [{
      type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
      revision: 'revision-ready',
      percent: 100
    }]
  }]);
});

test('Beta recovery uses the actual pinned Firebase ADC client instead of unavailable runv2.listServices', async () => {
  const requestedModules = [];
  const requests = [];
  let authenticatedProject = '';
  class PinnedClient {
    constructor(options) {
      assert.deepEqual(options, {
        urlPrefix: 'https://run.googleapis.com',
        auth: true,
        apiVersion: 'v2'
      });
    }

    async get(requestPath, options) {
      requests.push({ requestPath, queryParams: options.queryParams });
      if (requests.length === 1) {
        return { status: 200, body: { services: [{ name: 'service-one' }], nextPageToken: 'next' } };
      }
      return { status: 200, body: { services: [{ name: 'service-two' }] } };
    }
  }
  const pinnedFirebaseRequire = modulePath => {
    requestedModules.push(modulePath);
    if (modulePath === './lib/requireAuth.js') {
      return { requireAuth: async ({ project }) => { authenticatedProject = project; } };
    }
    if (modulePath === './lib/apiv2.js') return { Client: PinnedClient };
    if (modulePath === './lib/api.js') return { runOrigin: () => 'https://run.googleapis.com' };
    if (modulePath === './lib/gcp/runv2.js') return {};
    throw new Error(`unexpected module ${modulePath}`);
  };

  assert.deepEqual(await loadCloudRunServicesWithFirebaseCli({
    firebaseRequire: pinnedFirebaseRequire,
    projectId: BETA_PROJECT_ID
  }), [{ name: 'service-one' }, { name: 'service-two' }]);
  assert.equal(authenticatedProject, BETA_PROJECT_ID);
  assert.deepEqual(requestedModules, [
    './lib/requireAuth.js',
    './lib/apiv2.js',
    './lib/api.js'
  ]);
  assert.deepEqual(requests, [{
    requestPath: `/projects/${BETA_PROJECT_ID}/locations/-/services`,
    queryParams: { pageSize: 100 }
  }, {
    requestPath: `/projects/${BETA_PROJECT_ID}/locations/-/services`,
    queryParams: { pageSize: 100, pageToken: 'next' }
  }]);
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

test('run 33530702897 recovery controller is single-attempt, full-plan, and proves every convergence boundary', () => {
  const controller = readFileSync(new URL('./recoverBetaRun33530702897.mjs', import.meta.url), 'utf8');
  const incident = readFileSync(new URL('./betaRun33530702897Recovery.mjs', import.meta.url), 'utf8');
  for (const marker of [
    'verifyBetaRun33530702897FailedRun',
    'assertBetaRun33530702897PartialState',
    'assertBetaRun33530702897CandidateArtifact',
    'assertArtifactCompatibility',
    'assertPinnedFirebaseCliStorageBehavior',
    'assertBetaRun33530702897RecoveryConverged',
    'readCloudRunServiceState',
    'readLiveAssetProof',
    'readBetaFunctionState',
    'FULL_BETA_RESOURCE_PLAN.join'
  ]) assert.match(controller, new RegExp(marker));
  assert.equal((controller.match(/spawnSync\('firebase'/g) || []).length, 1);
  assert.match(controller, /no retry was attempted/);
  assert.doesNotMatch(controller, /--project',\s*'(?!beta')[^']+'/);
  assert.doesNotMatch(controller, /--only',\s*'(?:functions|hosting|firestore|storage)'/);
  assert.match(incident, /requireAuth/);
  assert.match(incident, /new Client\(\{ urlPrefix: runOrigin\(\), auth: true, apiVersion: 'v2' \}\)/);
  assert.doesNotMatch(incident, /runv2\.listServices/);
  assert.doesNotMatch(`${controller}\n${incident}`, /MISECHEF_BETA_GOOGLE_ACCESS_TOKEN/);
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
  const incidentRecoveryWorkflow = readFileSync(
    path.join(repositoryRoot, '.github', 'workflows', 'recover-beta-run-33530702897.yml'),
    'utf8'
  );
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
  assert.match(incidentRecoveryWorkflow, /environment: beta/);
  assert.match(incidentRecoveryWorkflow, /group: misechef-beta-deployment/);
  assert.match(incidentRecoveryWorkflow, /cancel-in-progress: false/);
  assert.match(incidentRecoveryWorkflow, /vars\.MISECHEF_BETA_RUN_33530702897_RECOVERY_GATE_SHA/);
  assert.match(incidentRecoveryWorkflow, /vars\.MISECHEF_BETA_RUN_33530702897_RECOVERY_AUTHORIZATION/);
  assert.match(incidentRecoveryWorkflow, /secrets\.FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA/);
  assert.match(incidentRecoveryWorkflow, new RegExp(BETA_RUN_33530702897.candidateCommit));
  assert.match(incidentRecoveryWorkflow, new RegExp(BETA_RUN_33530702897.candidateSourceTree));
  assert.match(incidentRecoveryWorkflow, /recoverBetaRun33530702897\.mjs/);
  assert.doesNotMatch(incidentRecoveryWorkflow, /FIREBASE_SERVICE_ACCOUNT_MISECHEF_PROD|misechef-fa4bf/);
  assert.doesNotMatch(incidentRecoveryWorkflow, new RegExp(BETA_RUN_33530702897_AUTHORIZATION));
  const canonicalAuth = workflow.match(/      - name: Authenticate to Beta only[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const recoveryAuth = incidentRecoveryWorkflow.match(
    /      - name: Authenticate to Beta only[\s\S]*?(?=\n      - name:)/
  )?.[0] || '';
  assert.match(canonicalAuth, /credentials_json: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA \}\}/);
  assert.match(recoveryAuth, /credentials_json: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA \}\}/);
  for (const unsupported of [
    'token_format',
    'access_token',
    'workload_identity_provider',
    'service_account',
    'delegates'
  ]) {
    assert.doesNotMatch(canonicalAuth, new RegExp(unsupported));
    assert.doesNotMatch(recoveryAuth, new RegExp(unsupported));
  }
  assert.doesNotMatch(workflow, /id-token:/);
  assert.doesNotMatch(incidentRecoveryWorkflow, /id-token:/);
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
