import { randomBytes, createHash } from 'node:crypto';
import { existsSync, openSync, closeSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_POST_BUILD_DIRTY_PATHS, BETA_PROJECT_ID, FULL_BETA_RESOURCE_PLAN, MANDATORY_BETA_BASELINE,
  assertArtifactCompatibility, assertAuthority, assertCleanSource, assertExactResourcePlan,
  assertExplicitBetaStorageTarget, assertPinnedFirebaseCliStorageBehavior, assertLiveReleaseUnchanged
} from './betaDeploymentSafety.mjs';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';
import {
  CURLEC_PAYMENT_LINK_BETA_RECOVERY, assertCurlecPaymentLinkBetaPartialState,
  assertCurlecPaymentLinkRecoveryArtifact, assertCurlecPaymentLinkRecoveryConverged
} from './betaCurlecPaymentLinkRecovery.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (command, args, env = {}) => execFileSync(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
const dirty = () => git(['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean).map(line => line.slice(3));
const head = git(['rev-parse', 'HEAD']);
const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
const confirmation = process.env.MISECHEF_CURLEC_PAYMENT_LINK_BETA_RECOVERY_CONFIRMATION;
if (confirmation !== CURLEC_PAYMENT_LINK_BETA_RECOVERY.confirmation) throw new Error('Curlec Payment Link recovery requires its exact one-time confirmation.');
if (process.env.MISECHEF_BETA_ALLOW_LOCAL_DEPLOY !== '1') throw new Error('Curlec Payment Link recovery requires explicit guarded local Beta deployment authorization.');
assertCleanSource(dirty());
assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN);
assertAuthority({
  authorityBaseline: process.env.MISECHEF_BETA_PROTECTED_BASELINE,
  documentedBaseline: JSON.parse(readFileSync(path.join(root, 'config/beta-release-baseline.json'), 'utf8')).minimumCommit,
  head,
  isAncestor: (ancestor, descendant) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root }).status === 0
});
const firebaseConfig = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(path.join(root, '.firebaserc'), 'utf8'));
assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
assertPinnedFirebaseCliStorageBehavior({ version: execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim(), prepareSource: readFileSync(path.join(globalNpmRoot, 'firebase-tools/lib/deploy/storage/prepare.js'), 'utf8') });
if (firebaseRc.projects?.beta !== BETA_PROJECT_ID) throw new Error('Curlec Payment Link recovery is not pinned to Beta.');

const readAssetProof = async asset => {
  const response = await fetch(`https://misechef-beta-fa4bf.web.app${asset}?beta-recovery=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache, no-store' } });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, contentType: response.headers.get('content-type') || '', sha256: createHash('sha256').update(bytes).digest('hex') };
};
const initialLive = await readLiveBetaFingerprint();
const initialRecovery = assertCurlecPaymentLinkBetaPartialState({ head, sourceTree, liveFingerprint: initialLive });
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
run('npm', ['run', 'validate:firebase-env:beta']);
run('npx', ['vite', 'build', '--mode', 'beta']);
run('node', ['scripts/prepareStoreSocialTemplate.mjs']);
run('node', ['scripts/generateBetaBuildManifest.mjs'], { MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE });
const manifest = JSON.parse(readFileSync(path.join(root, 'dist/.well-known/misechef-beta-release.json'), 'utf8'));
assertArtifactCompatibility({ repositoryRoot: root, manifest: { ...manifest, currentSourceTree: sourceTree }, head, baseline: MANDATORY_BETA_BASELINE });
assertCurlecPaymentLinkRecoveryArtifact(manifest);
assertCleanSource(dirty(), ALLOWED_POST_BUILD_DIRTY_PATHS);
const liveBeforeDeploy = await readLiveBetaFingerprint();
assertLiveReleaseUnchanged(initialLive, liveBeforeDeploy);
assertCurlecPaymentLinkBetaPartialState({ head, sourceTree, liveFingerprint: liveBeforeDeploy });
const nonce = randomBytes(32).toString('hex');
const session = path.join(os.tmpdir(), `misechef-curlec-payment-link-beta-recovery-${process.pid}-${nonce}.json`);
const lockPath = path.resolve(root, git(['rev-parse', '--git-common-dir']), 'misechef-beta-deployment.lock');
let locked = false;
try {
  const fd = openSync(lockPath, 'wx', 0o600); closeSync(fd); locked = true;
  writeFileSync(session, `${JSON.stringify({ version: 1, nonce, sourceCommit: head, sourceTree, protectedBaseline: MANDATORY_BETA_BASELINE, resources: FULL_BETA_RESOURCE_PLAN, liveFingerprint: liveBeforeDeploy, buildId: manifest.buildId, recovery: initialRecovery, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000 }, null, 2)}\n`, { mode: 0o600 });
  const deployed = spawnSync('firebase', ['deploy', '--project', 'beta', '--only', FULL_BETA_RESOURCE_PLAN.join(',')], { cwd: root, env: { ...process.env, FIREBASE_DEPLOY_TARGET: 'beta', MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE, MISECHEF_BETA_DEPLOY_SESSION_FILE: session, MISECHEF_BETA_DEPLOY_SESSION_NONCE: nonce }, stdio: 'inherit' });
  if (deployed.status !== 0) throw new Error(`Guarded Curlec Payment Link Beta recovery failed with exit code ${deployed.status}.`);
  let error;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { assertCurlecPaymentLinkRecoveryConverged({ liveFingerprint: await readLiveBetaFingerprint(), manifest, assetProof: await readAssetProof(manifest.entryAsset) }); error = null; break; }
    catch (caught) { error = caught; if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  if (error) throw error;
  console.log(`Guarded Curlec Payment Link Beta recovery converged to ${head}.`);
} finally {
  if (existsSync(session)) unlinkSync(session);
  if (locked && existsSync(lockPath)) unlinkSync(lockPath);
}
