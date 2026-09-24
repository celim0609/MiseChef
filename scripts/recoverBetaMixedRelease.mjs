import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
import { readCloudRunServiceState, readLiveAssetProof, readLiveReleaseMetadata } from './betaRun33530702897Recovery.mjs';
import {
  BETA_MIXED_RELEASE_INCIDENT,
  assertBetaProjectAlias,
  assertExactCandidate,
  assertExpectedMixedLiveState,
  assertIncidentAvailable,
  assertRecoveredRelease,
  assertRecoveryMode,
  createConsumptionMarker
} from './betaMixedReleaseRecovery.mjs';

const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateIndex = process.argv.indexOf('--candidate-root');
const candidateRoot = candidateIndex >= 0 ? path.resolve(process.argv[candidateIndex + 1] || '') : '';
if (!candidateRoot || !existsSync(path.join(candidateRoot, '.git'))) throw new Error('Mixed-release recovery requires an exact candidate checkout.');

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (command, args, cwd = candidateRoot, extraEnv = {}) => execFileSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: 'inherit' });
const dirtyPaths = root => git(root, ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean).map(line => line.slice(3));
const markerPath = BETA_MIXED_RELEASE_INCIDENT.consumptionMarker;
const markerPrefix = markerPath.slice(0, markerPath.lastIndexOf('/') + 1);

const protectedGateSha = process.env.MISECHEF_BETA_MIXED_RELEASE_20260924_GATE_SHA || '';
if (!/^[0-9a-f]{40}$/.test(protectedGateSha) || git(controllerRoot, ['rev-parse', 'HEAD']) !== protectedGateSha) {
  throw new Error('Mixed-release recovery controller does not match the protected Beta environment gate SHA.');
}
assertRecoveryMode({
  confirmation: process.env.MISECHEF_BETA_MIXED_RELEASE_20260924_CONFIRMATION,
  authorization: process.env.MISECHEF_BETA_MIXED_RELEASE_20260924_AUTHORIZATION,
  githubActions: process.env.GITHUB_ACTIONS === 'true',
  ciLockId: process.env.MISECHEF_BETA_CI_LOCK_ID
});

const head = git(candidateRoot, ['rev-parse', 'HEAD']);
const sourceTree = git(candidateRoot, ['rev-parse', 'HEAD^{tree}']);
assertExactCandidate({
  head,
  sourceTree,
  isAncestor: (ancestor, descendant) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: candidateRoot, stdio: 'ignore' }).status === 0
});
assertCleanSource(dirtyPaths(candidateRoot));
assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN);

const firebaseConfig = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.json'), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(path.join(candidateRoot, '.firebaserc'), 'utf8'));
assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
assertBetaProjectAlias(firebaseRc);

const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
const firebaseToolsRoot = path.join(globalNpmRoot, 'firebase-tools');
assertPinnedFirebaseCliStorageBehavior({
  version: execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim(),
  prepareSource: readFileSync(path.join(firebaseToolsRoot, 'lib', 'deploy', 'storage', 'prepare.js'), 'utf8')
});

const candidateBaseline = JSON.parse(readFileSync(path.join(candidateRoot, 'config', 'beta-release-baseline.json'), 'utf8'));
assertAuthority({
  authorityBaseline: process.env.MISECHEF_BETA_PROTECTED_BASELINE,
  documentedBaseline: candidateBaseline.minimumCommit,
  head,
  isAncestor: (ancestor, descendant) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: candidateRoot, stdio: 'ignore' }).status === 0
});

const readMarker = () => {
  try {
    return JSON.parse(execFileSync('gcloud', ['storage', 'cat', markerPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    const message = `${error?.stdout || ''}${error?.stderr || ''}`;
    if (/404|No URLs matched/i.test(message)) return null;
    throw new Error(`Unable to read the protected incident-consumption marker: ${message || error.message}`);
  }
};
const markConsumedAfterDeployStart = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-mixed-release-'));
  const markerFile = path.join(directory, 'consumed.json');
  try {
    writeFileSync(markerFile, `${JSON.stringify(createConsumptionMarker({ runId: process.env.GITHUB_RUN_ID || '' }))}\n`, { mode: 0o600 });
    execFileSync('gcloud', ['storage', 'cp', '--if-generation-match=0', markerFile, markerPath], { stdio: 'inherit' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const probeMarkerAccess = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-mixed-release-probe-'));
  const probeFile = path.join(directory, 'probe.json');
  const probePath = `${markerPrefix}probe-${randomBytes(32).toString('hex')}`;
  try {
    writeFileSync(probeFile, `${JSON.stringify({ incident: BETA_MIXED_RELEASE_INCIDENT.id, probe: true })}\n`, { mode: 0o600 });
    execFileSync('gcloud', ['storage', 'cp', '--if-generation-match=0', probeFile, probePath], { stdio: 'inherit' });
    execFileSync('gcloud', ['storage', 'rm', probePath], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Mixed-release recovery refused: pre-deploy marker write/delete probe failed; retry after restoring Beta service-account Storage access. ${error.message}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const readExpandedLive = async () => {
  const [fingerprint, metadata] = await Promise.all([readLiveBetaFingerprint(), readLiveReleaseMetadata()]);
  return { ...fingerprint, releaseStoreShellAsset: metadata?.storeShellAsset || '', releaseMetadata: metadata };
};
const getRenderPublicStore = async () => {
  const services = await readCloudRunServiceState({ firebaseToolsRoot });
  return services.find(service => service.id === 'renderPublicStore') || null;
};

assertIncidentAvailable(readMarker());
const liveBefore = await readExpandedLive();
assertExpectedMixedLiveState(liveBefore);
const renderPublicStoreBefore = await getRenderPublicStore();
if (!renderPublicStoreBefore?.latestReadyRevision) throw new Error('Mixed-release recovery refused: renderPublicStore has no ready revision.');

run('npm', ['run', 'validate:firebase-env:beta']);
run('npx', ['vite', 'build', '--mode', 'beta']);
run('node', ['scripts/prepareStoreSocialTemplate.mjs']);
run('node', ['scripts/generateBetaBuildManifest.mjs'], candidateRoot, { MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE });
const manifest = JSON.parse(readFileSync(path.join(candidateRoot, 'dist', '.well-known', 'misechef-beta-release.json'), 'utf8'));
assertArtifactCompatibility({ repositoryRoot: candidateRoot, manifest: { ...manifest, currentSourceTree: sourceTree }, head, baseline: MANDATORY_BETA_BASELINE });
assertCleanSource(dirtyPaths(candidateRoot), ALLOWED_POST_BUILD_DIRTY_PATHS);

const liveBeforeDeploy = await readExpandedLive();
assertLiveReleaseUnchanged(liveBefore, liveBeforeDeploy);
assertExpectedMixedLiveState(liveBeforeDeploy);
assertIncidentAvailable(readMarker());
probeMarkerAccess();

const nonce = randomBytes(32).toString('hex');
const sessionPath = path.join(os.tmpdir(), `misechef-beta-mixed-release-${process.pid}-${nonce}.json`);
const lockPath = path.resolve(candidateRoot, git(candidateRoot, ['rev-parse', '--git-common-dir']), 'misechef-beta-deployment.lock');
let lockCreated = false;
try {
  const lock = openSync(lockPath, 'wx', 0o600);
  lockCreated = true;
  writeFileSync(lock, JSON.stringify({ pid: process.pid, head, recovery: BETA_MIXED_RELEASE_INCIDENT.id }));
  closeSync(lock);
  writeFileSync(sessionPath, `${JSON.stringify({ version: 1, nonce, sourceCommit: head, protectedBaseline: MANDATORY_BETA_BASELINE, sourceTree, resources: FULL_BETA_RESOURCE_PLAN, liveFingerprint: liveBeforeDeploy, buildId: manifest.buildId, recovery: BETA_MIXED_RELEASE_INCIDENT.id, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000 }, null, 2)}\n`, { mode: 0o600 });
  const child = spawn('firebase', ['deploy', '--project', 'beta', '--only', FULL_BETA_RESOURCE_PLAN.join(',')], {
    cwd: candidateRoot,
    env: { ...process.env, FIREBASE_DEPLOY_TARGET: 'beta', MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE, MISECHEF_BETA_DEPLOY_SESSION_FILE: sessionPath, MISECHEF_BETA_DEPLOY_SESSION_NONCE: nonce, MISECHEF_BETA_CI_LOCK_ID: 'misechef-beta-deployment' },
    stdio: 'inherit'
  });
  await once(child, 'spawn');
  try {
    markConsumedAfterDeployStart();
  } catch (error) {
    const message = `MARKER WRITE FAILED - DO NOT RE-DISPATCH. Firebase deploy started, but the one-time incident marker could not be created: ${error.message}`;
    console.error(message);
    await once(child, 'close');
    throw new Error(message);
  }
  const [exitCode] = await once(child, 'close');
  if (exitCode !== 0) throw new Error(`Protected mixed-release Firebase deploy failed with exit code ${exitCode}; the incident remains consumed.`);
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const live = await readExpandedLive();
      const renderPublicStoreAfter = await getRenderPublicStore();
      assertRecoveredRelease({ live, manifest, renderPublicStoreBefore, renderPublicStoreAfter });
      const asset = await readLiveAssetProof({ origin: 'https://misechef-beta-fa4bf.web.app', asset: manifest.entryAsset });
      if (asset.status !== 200 || !/javascript/i.test(asset.contentType) || asset.sha256 !== manifest.entryAssetSha256) throw new Error('Candidate entry asset bytes do not match the recovery manifest.');
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await new Promise(resolve => setTimeout(resolve, 5_000));
    }
  }
  if (lastError) throw lastError;
  console.log(`Protected mixed-release recovery converged all Beta resources to ${head}.`);
} finally {
  if (existsSync(sessionPath)) unlinkSync(sessionPath);
  if (lockCreated && existsSync(lockPath)) unlinkSync(lockPath);
}
