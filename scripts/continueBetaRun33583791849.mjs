import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_POST_BUILD_DIRTY_PATHS,
  BETA_PROJECT_ID,
  FULL_BETA_RESOURCE_PLAN,
  MANDATORY_BETA_BASELINE,
  assertArtifactCompatibility,
  assertAuthority,
  assertCleanSource,
  assertExplicitBetaStorageTarget,
  assertExactResourcePlan,
  assertLiveReleaseUnchanged,
  assertPinnedFirebaseCliStorageBehavior
} from './betaDeploymentSafety.mjs';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';
import {
  BETA_RUN_33530702897,
  BETA_RUN_33586497538,
  assertBetaRun33530702897CandidateArtifact,
  assertBetaRun33530702897RecoveryConverged,
  assertBetaRun33586497538AuthorizedRulesContent,
  assertBetaRun33586497538PostTargetState,
  readBetaFirestoreIndexState,
  readBetaFunctionState,
  readBetaRulesState,
  readCloudRunServiceState,
  readLiveAssetProof,
  readLiveReleaseMetadata,
  resolveBetaRun33586497538ContinuationMode,
  verifyBetaRun33583791849FailedRun,
  verifyBetaRun33586497538FailedRun
} from './betaRun33530702897Recovery.mjs';

const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateArgument = process.argv.indexOf('--candidate-root');
const candidateRoot = candidateArgument >= 0 ? path.resolve(process.argv[candidateArgument + 1] || '') : '';
if (!candidateRoot || !existsSync(path.join(candidateRoot, '.git'))) {
  throw new Error('Beta continuation requires --candidate-root pointing to the exact candidate checkout.');
}

const git = (root, args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trimEnd();
const run = (command, args, cwd = candidateRoot, extraEnv = {}) => execFileSync(command, args, {
  cwd,
  env: { ...process.env, ...extraEnv },
  stdio: 'inherit'
});
const dirtyPaths = root => git(root, ['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n')
  .filter(Boolean)
  .map(line => line.slice(3));

const protectedGateSha = process.env.MISECHEF_BETA_RUN_33586497538_CONTINUATION_GATE_SHA || '';
if (!/^[0-9a-f]{40}$/.test(protectedGateSha) || git(controllerRoot, ['rev-parse', 'HEAD']) !== protectedGateSha) {
  throw new Error('The continuation controller does not match the protected Beta environment gate SHA.');
}
resolveBetaRun33586497538ContinuationMode({
  confirmation: process.env.MISECHEF_BETA_RUN_33586497538_CONTINUATION_CONFIRMATION,
  authorization: process.env.MISECHEF_BETA_RUN_33586497538_CONTINUATION_AUTHORIZATION,
  githubActions: process.env.GITHUB_ACTIONS === 'true',
  ciLockId: process.env.MISECHEF_BETA_CI_LOCK_ID
});

const head = git(candidateRoot, ['rev-parse', 'HEAD']);
const sourceTree = git(candidateRoot, ['rev-parse', 'HEAD^{tree}']);
if (head !== BETA_RUN_33586497538.candidateCommit || sourceTree !== BETA_RUN_33586497538.candidateSourceTree) {
  throw new Error('The continuation candidate is not the exact authorized SHA and source tree.');
}
assertCleanSource(dirtyPaths(candidateRoot));
assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN);

const firebaseConfig = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.json'), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(path.join(candidateRoot, '.firebaserc'), 'utf8'));
assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
if (firebaseRc.projects?.beta !== BETA_PROJECT_ID) throw new Error('Continuation is not using the pinned Beta Firebase project.');

const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
const firebaseToolsRoot = path.join(globalNpmRoot, 'firebase-tools');
const firebaseVersion = execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim();
assertPinnedFirebaseCliStorageBehavior({
  version: firebaseVersion,
  prepareSource: readFileSync(path.join(firebaseToolsRoot, 'lib', 'deploy', 'storage', 'prepare.js'), 'utf8')
});

const candidateBaseline = JSON.parse(readFileSync(path.join(candidateRoot, 'config', 'beta-release-baseline.json'), 'utf8'));
assertAuthority({
  authorityBaseline: process.env.MISECHEF_BETA_PROTECTED_BASELINE,
  documentedBaseline: candidateBaseline.minimumCommit,
  head,
  isAncestor: (ancestor, descendant) => spawnSync(
    'git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: candidateRoot, stdio: 'ignore' }
  ).status === 0
});

const betaOrigin = 'https://misechef-beta-fa4bf.web.app';
const readExpandedLive = async () => {
  const liveFingerprint = await readLiveBetaFingerprint();
  return {
    liveFingerprint,
    expandedFingerprint: { ...liveFingerprint, releaseMetadata: await readLiveReleaseMetadata() }
  };
};
const readContinuationState = async live => assertBetaRun33586497538PostTargetState({
  head,
  sourceTree,
  liveFingerprint: live.expandedFingerprint,
  functions: readBetaFunctionState(),
  services: await readCloudRunServiceState({ firebaseToolsRoot }),
  assetProof: await readLiveAssetProof({ origin: betaOrigin, asset: BETA_RUN_33586497538.manifest.entryAsset }),
  rules: await readBetaRulesState({ firebaseToolsRoot }),
  firestoreIndexes: readBetaFirestoreIndexState()
});

await verifyBetaRun33583791849FailedRun({
  repository: process.env.GITHUB_REPOSITORY,
  token: process.env.MISECHEF_BETA_GITHUB_TOKEN
});
await verifyBetaRun33586497538FailedRun({
  repository: process.env.GITHUB_REPOSITORY,
  token: process.env.MISECHEF_BETA_GITHUB_TOKEN
});
const liveBefore = await readExpandedLive();
const stateBefore = await readContinuationState(liveBefore);

rmSync(path.join(candidateRoot, 'dist'), { recursive: true, force: true });
run('npm', ['run', 'validate:firebase-env:beta']);
run('npx', ['vite', 'build', '--mode', 'beta']);
run('node', ['scripts/prepareStoreSocialTemplate.mjs']);
run('node', ['scripts/generateBetaBuildManifest.mjs'], candidateRoot, {
  MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE
});

const manifest = JSON.parse(readFileSync(
  path.join(candidateRoot, 'dist', '.well-known', 'misechef-beta-release.json'),
  'utf8'
));
assertArtifactCompatibility({
  repositoryRoot: candidateRoot,
  manifest: { ...manifest, currentSourceTree: sourceTree },
  head,
  baseline: MANDATORY_BETA_BASELINE
});
assertBetaRun33530702897CandidateArtifact(manifest);
assertCleanSource(dirtyPaths(candidateRoot), ALLOWED_POST_BUILD_DIRTY_PATHS);

const liveBeforeDeploy = await readExpandedLive();
assertLiveReleaseUnchanged(liveBefore.liveFingerprint, liveBeforeDeploy.liveFingerprint);
const stateBeforeDeploy = await readContinuationState(liveBeforeDeploy);
if (stateBefore.fingerprint !== stateBeforeDeploy.fingerprint) {
  throw new Error('The audited post-target state changed while validation was running. Continuation refused.');
}

const nonce = randomBytes(32).toString('hex');
const sessionPath = path.join(os.tmpdir(), `misechef-beta-run-33586497538-continuation-${process.pid}-${nonce}.json`);
const lockPath = path.resolve(candidateRoot, git(candidateRoot, ['rev-parse', '--git-common-dir']), 'misechef-beta-deployment.lock');
const deployEnvironment = {
  ...process.env,
  FIREBASE_DEPLOY_TARGET: 'beta',
  MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE,
  MISECHEF_BETA_DEPLOY_SESSION_FILE: sessionPath,
  MISECHEF_BETA_DEPLOY_SESSION_NONCE: nonce,
  MISECHEF_BETA_CI_LOCK_ID: 'misechef-beta-deployment'
};
let lockDescriptor;
let lockCreated = false;
try {
  lockDescriptor = openSync(lockPath, 'wx', 0o600);
  lockCreated = true;
  writeFileSync(lockDescriptor, JSON.stringify({ pid: process.pid, head, recovery: BETA_RUN_33586497538.id }));
  closeSync(lockDescriptor);
  writeFileSync(sessionPath, `${JSON.stringify({
    version: 1,
    nonce,
    sourceCommit: head,
    protectedBaseline: MANDATORY_BETA_BASELINE,
    sourceTree,
    resources: FULL_BETA_RESOURCE_PLAN,
    liveFingerprint: liveBeforeDeploy.liveFingerprint,
    buildId: manifest.buildId,
    recovery: stateBeforeDeploy,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000
  }, null, 2)}\n`, { mode: 0o600 });

  const fullResult = spawnSync('firebase', [
    'deploy',
    '--project',
    'beta',
    '--only',
    FULL_BETA_RESOURCE_PLAN.join(',')
  ], {
    cwd: candidateRoot,
    env: deployEnvironment,
    stdio: 'inherit'
  });
  if (fullResult.status !== 0) {
    throw new Error(`Protected complete-resource continuation failed once with exit code ${fullResult.status}; no retry was attempted.`);
  }

  let lastVerificationError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const recoveredLive = await readExpandedLive();
      assertBetaRun33530702897RecoveryConverged({
        liveFingerprint: recoveredLive.expandedFingerprint,
        functions: readBetaFunctionState(),
        services: await readCloudRunServiceState({ firebaseToolsRoot }),
        manifest,
        assetProof: await readLiveAssetProof({ origin: betaOrigin, asset: manifest.entryAsset })
      });
      assertBetaRun33586497538AuthorizedRulesContent({
        rules: await readBetaRulesState({ firebaseToolsRoot }),
        firestoreIndexes: readBetaFirestoreIndexState()
      });
      lastVerificationError = null;
      break;
    } catch (error) {
      lastVerificationError = error;
      if (attempt < 12) await new Promise(resolve => setTimeout(resolve, 5_000));
    }
  }
  if (lastVerificationError) throw lastVerificationError;
  console.log(`Protected Beta continuation converged all resources to ${head}.`);
} finally {
  if (existsSync(sessionPath)) unlinkSync(sessionPath);
  if (lockCreated && existsSync(lockPath)) unlinkSync(lockPath);
}
