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
  assertCanonicalContext,
  assertCleanSource,
  assertExplicitBetaStorageTarget,
  assertExactResourcePlan,
  assertLiveBaseline,
  assertLiveReleaseUnchanged,
  assertPinnedFirebaseCliStorageBehavior
} from './betaDeploymentSafety.mjs';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyOnly = process.argv.includes('--verify-only');
const trustedGateRoot = process.env.MISECHEF_BETA_TRUSTED_GATE_ROOT
  ? path.resolve(process.env.MISECHEF_BETA_TRUSTED_GATE_ROOT)
  : '';
const git = args => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const run = (command, args, extraEnv = {}) => execFileSync(command, args, {
  cwd: repositoryRoot,
  env: { ...process.env, ...extraEnv },
  stdio: 'inherit'
});
const dirtyPaths = () => git(['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n')
  .filter(Boolean)
  .map(line => line.slice(3));

const authorityBaseline = process.env.MISECHEF_BETA_PROTECTED_BASELINE;
const documentedBaseline = JSON.parse(
  readFileSync(path.join(repositoryRoot, 'config', 'beta-release-baseline.json'), 'utf8')
).minimumCommit;
const head = git(['rev-parse', 'HEAD']);
const firebaseConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'firebase.json'), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(path.join(repositoryRoot, '.firebaserc'), 'utf8'));

assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
const firebaseCliVersion = execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim();
const firebaseStoragePrepareSource = readFileSync(
  path.join(globalNpmRoot, 'firebase-tools', 'lib', 'deploy', 'storage', 'prepare.js'),
  'utf8'
);
assertPinnedFirebaseCliStorageBehavior({
  version: firebaseCliVersion,
  prepareSource: firebaseStoragePrepareSource
});

assertAuthority({
  authorityBaseline,
  documentedBaseline,
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
assertCleanSource(dirtyPaths());
assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN);

const githubActions = process.env.GITHUB_ACTIONS === 'true';
if (!verifyOnly) {
  assertCanonicalContext({
    firebaseTarget: 'beta',
    firebaseProject: BETA_PROJECT_ID,
    sessionFile: 'pending',
    sessionNonce: 'pending',
    githubActions,
    ciLockId: process.env.MISECHEF_BETA_CI_LOCK_ID,
    allowLocalDeploy: process.env.MISECHEF_BETA_ALLOW_LOCAL_DEPLOY === '1'
  });
}

const commonGitDirectory = git(['rev-parse', '--git-common-dir']);
const lockPath = path.resolve(repositoryRoot, commonGitDirectory, 'misechef-beta-deployment.lock');
let lockDescriptor;
try {
  lockDescriptor = openSync(lockPath, 'wx', 0o600);
  writeFileSync(lockDescriptor, JSON.stringify({ pid: process.pid, head, startedAt: new Date().toISOString() }));
  closeSync(lockDescriptor);
} catch (error) {
  throw new Error(`Another local Beta deployment process holds ${lockPath}.`, { cause: error });
}

const generatedPaths = [
  'functions/generated/publicStoreAppShell.html',
  '.firebase/hosting.ZGlzdA.cache'
];
const originalGeneratedFiles = new Map(generatedPaths.map(filePath => {
  const absolute = path.join(repositoryRoot, filePath);
  return [absolute, existsSync(absolute) ? readFileSync(absolute) : null];
}));
let sessionPath = '';

const restoreGeneratedFiles = () => {
  for (const [filePath, original] of originalGeneratedFiles) {
    if (original === null) {
      if (existsSync(filePath)) rmSync(filePath, { force: true });
    } else {
      writeFileSync(filePath, original);
    }
  }
};

try {
  if (!trustedGateRoot || trustedGateRoot === repositoryRoot) {
    throw new Error('MISECHEF_BETA_TRUSTED_GATE_ROOT must identify the separate trusted gate checkout.');
  }
  const liveBefore = await readLiveBetaFingerprint();
  assertLiveBaseline({
    liveFingerprint: liveBefore,
    resolveSourceTree: commit => git(['rev-parse', `${commit}^{tree}`]),
    isAncestor: (ancestor, descendant) => spawnSync(
      'git',
      ['merge-base', '--is-ancestor', ancestor, descendant],
      { cwd: repositoryRoot, stdio: 'ignore' }
    ).status === 0
  });
  if (liveBefore.releaseCommit) {
    const liveIsAncestor = spawnSync('git', ['merge-base', '--is-ancestor', liveBefore.releaseCommit, head], {
      cwd: repositoryRoot,
      stdio: 'ignore'
    }).status === 0;
    if (!liveIsAncestor) {
      throw new Error(`Candidate ${head} does not descend from currently live Beta commit ${liveBefore.releaseCommit}.`);
    }
  }

  run('node', [
    path.join(trustedGateRoot, 'scripts', 'validateBetaReleaseBaseline.mjs'),
    '--trusted-root', trustedGateRoot,
    '--candidate-root', repositoryRoot
  ], {
    FIREBASE_DEPLOY_TARGET: 'beta',
    MISECHEF_BETA_PROTECTED_BASELINE: authorityBaseline,
    MISECHEF_BETA_ENFORCE_CLEAN: '1'
  });
  run('node', [
    path.join(trustedGateRoot, 'scripts', 'runBetaProtectedTests.mjs'),
    '--trusted-root', trustedGateRoot,
    '--candidate-root', repositoryRoot
  ], {
    FIREBASE_DEPLOY_TARGET: 'beta',
    MISECHEF_BETA_PROTECTED_BASELINE: authorityBaseline,
    MISECHEF_BETA_VERIFY_ONLY: verifyOnly ? '1' : '0'
  });

  rmSync(path.join(repositoryRoot, 'dist'), { recursive: true, force: true });
  run('npm', ['run', 'validate:firebase-env:beta']);
  run('npx', ['vite', 'build', '--mode', 'beta']);
  run('node', ['scripts/prepareStoreSocialTemplate.mjs']);
  run('node', ['scripts/generateBetaBuildManifest.mjs'], {
    MISECHEF_BETA_PROTECTED_BASELINE: authorityBaseline
  });

  const manifestPath = path.join(repositoryRoot, 'dist', '.well-known', 'misechef-beta-release.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertArtifactCompatibility({
    repositoryRoot,
    manifest: { ...manifest, currentSourceTree: git(['rev-parse', 'HEAD^{tree}']) },
    head,
    baseline: authorityBaseline
  });
  assertCleanSource(dirtyPaths(), ALLOWED_POST_BUILD_DIRTY_PATHS);

  const liveBeforeDeploy = await readLiveBetaFingerprint();
  assertLiveReleaseUnchanged(liveBefore, liveBeforeDeploy);

  const nonce = randomBytes(32).toString('hex');
  sessionPath = path.join(os.tmpdir(), `misechef-beta-deploy-${process.pid}-${nonce}.json`);
  writeFileSync(sessionPath, `${JSON.stringify({
    version: 1,
    nonce,
    sourceCommit: head,
    protectedBaseline: authorityBaseline,
    sourceTree: git(['rev-parse', 'HEAD^{tree}']),
    resources: FULL_BETA_RESOURCE_PLAN,
    liveFingerprint: liveBeforeDeploy,
    buildId: manifest.buildId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000
  }, null, 2)}\n`, { mode: 0o600 });

  if (verifyOnly) {
    console.log(`Beta release verification passed for ${head}; no deployment performed.`);
  } else {
    const result = spawnSync('firebase', [
      'deploy',
      '--project',
      'beta',
      '--only',
      FULL_BETA_RESOURCE_PLAN.join(',')
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        FIREBASE_DEPLOY_TARGET: 'beta',
        MISECHEF_BETA_PROTECTED_BASELINE: authorityBaseline,
        MISECHEF_BETA_DEPLOY_SESSION_FILE: sessionPath,
        MISECHEF_BETA_DEPLOY_SESSION_NONCE: nonce,
        MISECHEF_BETA_CI_LOCK_ID: process.env.MISECHEF_BETA_CI_LOCK_ID || '',
        MISECHEF_BETA_ALLOW_LOCAL_DEPLOY: process.env.MISECHEF_BETA_ALLOW_LOCAL_DEPLOY || ''
      },
      stdio: 'inherit'
    });
    if (result.status !== 0) throw new Error(`Canonical Firebase Beta deployment failed with exit code ${result.status}.`);
    console.log('Beta resources deployed. Do not advance the baseline until live QA and explicit release completion.');
  }
} finally {
  restoreGeneratedFiles();
  if (sessionPath && existsSync(sessionPath)) unlinkSync(sessionPath);
  if (existsSync(lockPath)) unlinkSync(lockPath);
}
