import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_POST_BUILD_DIRTY_PATHS,
  BETA_PROJECT_ID,
  MANDATORY_BETA_BASELINE,
  assertArtifactCompatibility,
  assertAuthority,
  assertCanonicalContext,
  assertCleanSource,
  assertExplicitBetaStorageTarget,
  assertSession,
  assertLiveReleaseUnchanged
} from './betaDeploymentSafety.mjs';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = args => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const firebaseProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const firebaseConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'firebase.json'), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(path.join(repositoryRoot, '.firebaserc'), 'utf8'));

assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });

if (firebaseProject !== BETA_PROJECT_ID) {
  if (firebaseProject === 'misechef-fa4bf' && process.env.FIREBASE_DEPLOY_TARGET === 'production') {
    execFileSync('node', ['scripts/validateFirebaseEnv.mjs'], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit'
    });
    console.log('Explicit Production predeploy context verified; Beta release guard is not applicable.');
    process.exit(0);
  }
  throw new Error(`Firebase predeploy guard refuses project ${firebaseProject || '(missing)'}.`);
}

assertCanonicalContext({
  firebaseTarget: process.env.FIREBASE_DEPLOY_TARGET,
  firebaseProject,
  sessionFile: process.env.MISECHEF_BETA_DEPLOY_SESSION_FILE,
  sessionNonce: process.env.MISECHEF_BETA_DEPLOY_SESSION_NONCE,
  githubActions: process.env.GITHUB_ACTIONS === 'true',
  ciLockId: process.env.MISECHEF_BETA_CI_LOCK_ID,
  allowLocalDeploy: process.env.MISECHEF_BETA_ALLOW_LOCAL_DEPLOY === '1'
});

const baseline = JSON.parse(readFileSync(path.join(repositoryRoot, 'config/beta-release-baseline.json'), 'utf8'));
const authorityBaseline = process.env.MISECHEF_BETA_PROTECTED_BASELINE;
const head = git(['rev-parse', 'HEAD']);
assertAuthority({
  authorityBaseline,
  documentedBaseline: baseline.minimumCommit,
  head,
  isAncestor: (ancestor, descendant) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repositoryRoot, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
});

if (authorityBaseline !== MANDATORY_BETA_BASELINE) {
  throw new Error('The external Beta authority does not match this hardened release generation.');
}

const dirtyPaths = git(['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n')
  .filter(Boolean)
  .map(line => line.slice(3));
assertCleanSource(dirtyPaths, ALLOWED_POST_BUILD_DIRTY_PATHS);

const session = JSON.parse(readFileSync(process.env.MISECHEF_BETA_DEPLOY_SESSION_FILE, 'utf8'));
assertSession({
  session,
  nonce: process.env.MISECHEF_BETA_DEPLOY_SESSION_NONCE,
  head,
  baseline: authorityBaseline
});

const manifestPath = path.join(repositoryRoot, 'dist', '.well-known', 'misechef-beta-release.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assertArtifactCompatibility({
  repositoryRoot,
  manifest: { ...manifest, currentSourceTree: git(['rev-parse', 'HEAD^{tree}']) },
  head,
  baseline: authorityBaseline
});

const currentLiveFingerprint = await readLiveBetaFingerprint();
assertLiveReleaseUnchanged(session.liveFingerprint, currentLiveFingerprint);

console.log(`Canonical Beta predeploy session verified for ${head}.`);
