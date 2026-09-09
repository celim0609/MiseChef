import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_RELEASE_DIRTY_PATHS,
  PRODUCTION_PROJECT_ID,
  assertArtifactCompatibility,
  assertCleanCandidate,
  assertLiveUnchanged,
  assertProductionEnvironment,
  assertProductionFirebaseConfig,
  assertSession
} from './productionDeploymentSafety.mjs';
import { readLiveProductionFingerprint } from './productionLiveRelease.mjs';

const candidateFlag = process.argv.indexOf('--candidate-root');
if (candidateFlag < 0 || !process.argv[candidateFlag + 1]) throw new Error('--candidate-root is required.');
const candidateRoot = path.resolve(process.argv[candidateFlag + 1]);
const firebaseProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
if (firebaseProject !== PRODUCTION_PROJECT_ID) {
  throw new Error(`Production predeploy refuses Firebase project ${firebaseProject || '(missing)'}.`);
}
assertProductionEnvironment(process.env);

const git = args => execFileSync('git', args, {
  cwd: candidateRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trimEnd();
const head = git(['rev-parse', 'HEAD']);
const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
const baseline = process.env.MISECHEF_PRODUCTION_PROTECTED_BASELINE || '';
const dirtyPaths = git(['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n').filter(Boolean).map(line => line.slice(3));
assertCleanCandidate(dirtyPaths, ALLOWED_RELEASE_DIRTY_PATHS);

execFileSync('node', ['scripts/validateFirebaseEnv.mjs'], {
  cwd: candidateRoot,
  env: process.env,
  stdio: 'inherit'
});

const config = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.production.json'), 'utf8'));
assertProductionFirebaseConfig(config);
const manifest = JSON.parse(readFileSync(
  path.join(candidateRoot, 'dist', '.well-known', 'misechef-production-release.json'),
  'utf8'
));
assertArtifactCompatibility({ repositoryRoot: candidateRoot, manifest, head, sourceTree, baseline });

const session = JSON.parse(readFileSync(process.env.MISECHEF_PRODUCTION_DEPLOY_SESSION_FILE, 'utf8'));
const currentLive = await readLiveProductionFingerprint();
assertSession({
  session,
  nonce: process.env.MISECHEF_PRODUCTION_DEPLOY_SESSION_NONCE,
  head,
  sourceTree,
  baseline,
  liveFingerprint: currentLive
});
assertLiveUnchanged(session.liveFingerprint, currentLive);
console.log(`Canonical Production predeploy session verified for exact SHA ${head}.`);
