import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_RELEASE_DIRTY_PATHS,
  FULL_PRODUCTION_RESOURCE_PLAN,
  PINNED_FIREBASE_CLI_VERSION,
  PRODUCTION_PROJECT_ID,
  assertArtifactCompatibility,
  assertBootstrapLive,
  assertCleanCandidate,
  assertLiveUnchanged,
  assertPostDeploy,
  assertProductionAuthority,
  assertProductionEnvironment,
  assertProductionFirebaseConfig,
  buildProductionFirebaseConfig,
  createProductionManifest,
  discoverCandidateFunctions
} from './productionDeploymentSafety.mjs';
import { readLiveProductionFingerprint, readProductionFunctions } from './productionLiveRelease.mjs';

const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateFlag = process.argv.indexOf('--candidate-root');
if (candidateFlag < 0 || !process.argv[candidateFlag + 1]) throw new Error('--candidate-root is required.');
const candidateRoot = path.resolve(process.argv[candidateFlag + 1]);
const git = args => execFileSync('git', args, {
  cwd: candidateRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trimEnd();
const run = (command, args, extraEnv = {}) => execFileSync(command, args, {
  cwd: candidateRoot,
  env: { ...process.env, ...extraEnv },
  stdio: 'inherit'
});
const dirtyPaths = () => git(['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n').filter(Boolean).map(line => line.slice(3));
const isAncestor = (ancestor, descendant) => spawnSync(
  'git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: candidateRoot, stdio: 'ignore' }
).status === 0;

assertProductionEnvironment(process.env);
const head = git(['rev-parse', 'HEAD']);
const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
const expectedSha = process.env.MISECHEF_PRODUCTION_EXPECTED_SHA || '';
const approvedSha = process.env.MISECHEF_PRODUCTION_APPROVED_SHA || '';
const protectedBaseline = process.env.MISECHEF_PRODUCTION_PROTECTED_BASELINE || '';
assertProductionAuthority({
  expectedSha,
  approvedSha,
  protectedBaseline,
  resolvedSha: head,
  githubRef: process.env.GITHUB_REF,
  githubEvent: process.env.GITHUB_EVENT_NAME,
  isAncestor
});
assertCleanCandidate(dirtyPaths());

const firebaseVersion = execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim();
if (firebaseVersion !== PINNED_FIREBASE_CLI_VERSION) {
  throw new Error(`Production release requires Firebase CLI ${PINNED_FIREBASE_CLI_VERSION}; found ${firebaseVersion}.`);
}

const liveBefore = await readLiveProductionFingerprint();
if (liveBefore.releaseCommit) {
  if (!isAncestor(liveBefore.releaseCommit, head)) {
    throw new Error(`Candidate ${head} does not descend from live Production ${liveBefore.releaseCommit}.`);
  }
  const liveTree = git(['rev-parse', `${liveBefore.releaseCommit}^{tree}`]);
  if (liveTree !== liveBefore.releaseSourceTree) throw new Error('Live Production manifest source tree is invalid.');
  if (liveBefore.customRootAsset !== liveBefore.defaultRootAsset
    || liveBefore.customRootAsset !== liveBefore.releaseEntryAsset) {
    throw new Error('Live Production manifest and Hosting assets are incoherent.');
  }
} else {
  assertBootstrapLive({
    fingerprint: liveBefore,
    expectedAsset: process.env.MISECHEF_PRODUCTION_BOOTSTRAP_LIVE_ASSET,
    expectedVersion: process.env.MISECHEF_PRODUCTION_BOOTSTRAP_HOSTING_VERSION
  });
}

const generatedShellPath = path.join(candidateRoot, 'functions', 'generated', 'publicStoreAppShell.html');
const generatedShellBefore = existsSync(generatedShellPath) ? readFileSync(generatedShellPath) : null;
const productionConfigPath = path.join(candidateRoot, 'firebase.production.json');
const productionConfigBefore = existsSync(productionConfigPath) ? readFileSync(productionConfigPath) : null;
const productionFunctionsEnvPath = path.join(candidateRoot, 'functions', `.env.${PRODUCTION_PROJECT_ID}`);
const productionFunctionsEnvBefore = existsSync(productionFunctionsEnvPath) ? readFileSync(productionFunctionsEnvPath) : null;
let sessionPath = '';

try {
  rmSync(path.join(candidateRoot, 'dist'), { recursive: true, force: true });
  run('npm', ['run', 'build'], { FIREBASE_DEPLOY_TARGET: 'production' });

  const manifest = createProductionManifest({
    repositoryRoot: candidateRoot,
    sourceCommit: head,
    sourceTree,
    protectedBaseline,
    buildId: randomUUID(),
    builtAt: new Date().toISOString()
  });
  const manifestDirectory = path.join(candidateRoot, 'dist', '.well-known');
  mkdirSync(manifestDirectory, { recursive: true });
  writeFileSync(
    path.join(manifestDirectory, 'misechef-production-release.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  assertArtifactCompatibility({
    repositoryRoot: candidateRoot,
    manifest,
    head,
    sourceTree,
    baseline: protectedBaseline
  });

  const predeployCommand = 'node "$MISECHEF_PRODUCTION_CONTROLLER_ROOT/scripts/validateProductionPredeploy.mjs" --candidate-root "$PROJECT_DIR"';
  const candidateConfig = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.json'), 'utf8'));
  const productionConfig = buildProductionFirebaseConfig({ candidateConfig, predeployCommand });
  assertProductionFirebaseConfig(productionConfig);
  writeFileSync(productionConfigPath, `${JSON.stringify(productionConfig, null, 2)}\n`, { mode: 0o600 });
  for (const name of ['SELLING_WORKSPACE_ID', 'PUBLIC_SITE_ORIGIN']) {
    if (/[\r\n]/.test(process.env[name] || '')) throw new Error(`${name} contains an invalid newline.`);
  }
  writeFileSync(productionFunctionsEnvPath, [
    `SELLING_WORKSPACE_ID=${process.env.SELLING_WORKSPACE_ID}`,
    `PUBLIC_SITE_ORIGIN=${process.env.PUBLIC_SITE_ORIGIN}`,
    ''
  ].join('\n'), { mode: 0o600 });
  assertCleanCandidate(dirtyPaths(), ALLOWED_RELEASE_DIRTY_PATHS);

  const liveBeforeDeploy = await readLiveProductionFingerprint();
  assertLiveUnchanged(liveBefore, liveBeforeDeploy);

  const nonce = randomBytes(32).toString('hex');
  sessionPath = path.join(os.tmpdir(), `misechef-production-deploy-${process.pid}-${nonce}.json`);
  writeFileSync(sessionPath, `${JSON.stringify({
    version: 1,
    nonce,
    sourceCommit: head,
    sourceTree,
    protectedBaseline,
    resources: FULL_PRODUCTION_RESOURCE_PLAN,
    liveFingerprint: liveBeforeDeploy,
    buildId: manifest.buildId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000
  }, null, 2)}\n`, { mode: 0o600 });

  const result = spawnSync('firebase', [
    'deploy',
    '--project', PRODUCTION_PROJECT_ID,
    '--config', 'firebase.production.json',
    '--only', FULL_PRODUCTION_RESOURCE_PLAN.join(','),
    '--non-interactive'
  ], {
    cwd: candidateRoot,
    env: {
      ...process.env,
      FIREBASE_DEPLOY_TARGET: 'production',
      MISECHEF_PRODUCTION_CONTROLLER_ROOT: controllerRoot,
      MISECHEF_PRODUCTION_DEPLOY_SESSION_FILE: sessionPath,
      MISECHEF_PRODUCTION_DEPLOY_SESSION_NONCE: nonce
    },
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Canonical Production deployment failed with exit code ${result.status}.`);

  const expectedFunctions = discoverCandidateFunctions(
    readFileSync(path.join(candidateRoot, 'functions', 'index.js'), 'utf8')
  );
  let verificationError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const [fingerprint, deployedFunctions] = await Promise.all([
        readLiveProductionFingerprint(),
        readProductionFunctions()
      ]);
      assertPostDeploy({ fingerprint, expectedCommit: head, expectedTree: sourceTree, expectedFunctions, deployedFunctions });
      console.log(`Production release verified for exact SHA ${head}.`);
      verificationError = null;
      break;
    } catch (error) {
      verificationError = error;
      await new Promise(resolve => setTimeout(resolve, 15_000));
    }
  }
  if (verificationError) throw verificationError;
} finally {
  if (generatedShellBefore === null) rmSync(generatedShellPath, { force: true });
  else writeFileSync(generatedShellPath, generatedShellBefore);
  if (productionConfigBefore === null) rmSync(productionConfigPath, { force: true });
  else writeFileSync(productionConfigPath, productionConfigBefore);
  if (productionFunctionsEnvBefore === null) rmSync(productionFunctionsEnvPath, { force: true });
  else writeFileSync(productionFunctionsEnvPath, productionFunctionsEnvBefore);
  if (sessionPath && existsSync(sessionPath)) unlinkSync(sessionPath);
}
