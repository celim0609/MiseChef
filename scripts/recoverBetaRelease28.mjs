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
  RELEASE_28_INCIDENT,
  assertRelease28CandidateArtifact,
  assertRelease28PartialState,
  assertRelease28RecoveryConverged,
  readBetaFunctionState,
  readLiveAssetProof,
  readLiveReleaseMetadata,
  resolveRelease28RecoveryMode,
  verifyRelease28FailedRun
} from './betaRelease28Recovery.mjs';

const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateArgument = process.argv.indexOf('--candidate-root');
const candidateRoot = candidateArgument >= 0 ? path.resolve(process.argv[candidateArgument + 1] || '') : '';
if (!candidateRoot || !existsSync(path.join(candidateRoot, '.git'))) {
  throw new Error('Release #28 recovery requires --candidate-root pointing to the exact candidate checkout.');
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

const protectedGateSha = process.env.MISECHEF_BETA_RELEASE_28_RECOVERY_GATE_SHA || '';
if (!/^[0-9a-f]{40}$/.test(protectedGateSha) || git(controllerRoot, ['rev-parse', 'HEAD']) !== protectedGateSha) {
  throw new Error('Release #28 recovery controller does not match the protected GitHub environment gate SHA.');
}
resolveRelease28RecoveryMode({
  confirmation: process.env.MISECHEF_BETA_RELEASE_28_RECOVERY_CONFIRMATION,
  authorization: process.env.MISECHEF_BETA_RELEASE_28_RECOVERY_AUTHORIZATION,
  githubActions: process.env.GITHUB_ACTIONS === 'true',
  ciLockId: process.env.MISECHEF_BETA_CI_LOCK_ID
});

const head = git(candidateRoot, ['rev-parse', 'HEAD']);
const sourceTree = git(candidateRoot, ['rev-parse', 'HEAD^{tree}']);
if (head !== RELEASE_28_INCIDENT.candidateCommit || sourceTree !== RELEASE_28_INCIDENT.candidateSourceTree) {
  throw new Error('Release #28 recovery candidate checkout is not the exact authorized SHA and tree.');
}
assertCleanSource(dirtyPaths(candidateRoot));
assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN);

const firebaseConfig = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.json'), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(path.join(candidateRoot, '.firebaserc'), 'utf8'));
assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
assertPinnedFirebaseCliStorageBehavior({
  version: execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim(),
  prepareSource: readFileSync(
    path.join(globalNpmRoot, 'firebase-tools', 'lib', 'deploy', 'storage', 'prepare.js'),
    'utf8'
  )
});
if (firebaseRc.projects?.beta !== BETA_PROJECT_ID) {
  throw new Error('Release #28 recovery is not using the pinned Beta Firebase deployment context.');
}

const candidateBaseline = JSON.parse(readFileSync(path.join(candidateRoot, 'config', 'beta-release-baseline.json'), 'utf8'));
assertAuthority({
  authorityBaseline: process.env.MISECHEF_BETA_PROTECTED_BASELINE,
  documentedBaseline: candidateBaseline.minimumCommit,
  head,
  isAncestor: (ancestor, descendant) => spawnSync(
    'git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: candidateRoot, stdio: 'ignore' }
  ).status === 0
});

const gitChecks = {
  resolveSourceTree: commit => git(candidateRoot, ['rev-parse', `${commit}^{tree}`]),
  isAncestor: (ancestor, descendant) => spawnSync(
    'git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: candidateRoot, stdio: 'ignore' }
  ).status === 0
};
const readExpandedLive = async () => {
  const liveFingerprint = await readLiveBetaFingerprint();
  return {
    liveFingerprint,
    expandedFingerprint: {
      ...liveFingerprint,
      releaseMetadata: await readLiveReleaseMetadata()
    }
  };
};

await verifyRelease28FailedRun({
  repository: process.env.GITHUB_REPOSITORY,
  token: process.env.MISECHEF_BETA_GITHUB_TOKEN
});
const liveBefore = await readExpandedLive();
const recoveryBefore = assertRelease28PartialState({
  head,
  sourceTree,
  liveFingerprint: liveBefore.expandedFingerprint,
  functions: readBetaFunctionState(),
  ...gitChecks
});

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
assertRelease28CandidateArtifact(manifest);
assertCleanSource(dirtyPaths(candidateRoot), ALLOWED_POST_BUILD_DIRTY_PATHS);

const liveBeforeDeploy = await readExpandedLive();
assertLiveReleaseUnchanged(liveBefore.liveFingerprint, liveBeforeDeploy.liveFingerprint);
const recoveryBeforeDeploy = assertRelease28PartialState({
  head,
  sourceTree,
  liveFingerprint: liveBeforeDeploy.expandedFingerprint,
  functions: readBetaFunctionState(),
  ...gitChecks
});
assertLiveReleaseUnchanged(recoveryBefore, recoveryBeforeDeploy);

const nonce = randomBytes(32).toString('hex');
const sessionPath = path.join(os.tmpdir(), `misechef-beta-release-28-recovery-${process.pid}-${nonce}.json`);
const lockPath = path.resolve(candidateRoot, git(candidateRoot, ['rev-parse', '--git-common-dir']), 'misechef-beta-deployment.lock');
let lockDescriptor;
let lockCreated = false;
try {
  lockDescriptor = openSync(lockPath, 'wx', 0o600);
  lockCreated = true;
  writeFileSync(lockDescriptor, JSON.stringify({ pid: process.pid, head, recovery: RELEASE_28_INCIDENT.id }));
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
    recovery: recoveryBeforeDeploy,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000
  }, null, 2)}\n`, { mode: 0o600 });

  const result = spawnSync('firebase', [
    'deploy',
    '--project',
    'beta',
    '--only',
    FULL_BETA_RESOURCE_PLAN.join(',')
  ], {
    cwd: candidateRoot,
    env: {
      ...process.env,
      FIREBASE_DEPLOY_TARGET: 'beta',
      MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE,
      MISECHEF_BETA_DEPLOY_SESSION_FILE: sessionPath,
      MISECHEF_BETA_DEPLOY_SESSION_NONCE: nonce,
      MISECHEF_BETA_CI_LOCK_ID: 'misechef-beta-deployment'
    },
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Protected Release #28 recovery deployment failed with exit code ${result.status}.`);

  let lastVerificationError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const recoveredLive = await readExpandedLive();
      assertRelease28RecoveryConverged({
        liveFingerprint: recoveredLive.expandedFingerprint,
        functions: readBetaFunctionState(),
        manifest,
        assetProof: await readLiveAssetProof({
          origin: 'https://misechef-beta-fa4bf.web.app',
          asset: manifest.entryAsset
        })
      });
      lastVerificationError = null;
      break;
    } catch (error) {
      lastVerificationError = error;
      if (attempt < 12) await new Promise(resolve => setTimeout(resolve, 5_000));
    }
  }
  if (lastVerificationError) throw lastVerificationError;
  console.log(`Protected Beta Release #28 recovery converged all resources to ${head}.`);
} finally {
  if (existsSync(sessionPath)) unlinkSync(sessionPath);
  if (lockCreated && existsSync(lockPath)) unlinkSync(lockPath);
}
