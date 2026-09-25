import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BETA_PROJECT_ID, BETA_STORAGE_BUCKET, BETA_STORAGE_TARGET, PINNED_FIREBASE_CLI_VERSION } from './betaDeploymentSafety.mjs';
import { BETA_APP_ENGINE_SERVICE_ACCOUNT, assert20260926Candidate, assert20260926TemporaryConfig, create20260926TemporaryRc, write20260926TemporaryFirebaseFiles } from './betaMixedRelease20260926Recovery.mjs';
import { run20260926PermissionPreflight } from './betaMixedRelease20260926PermissionPreflight.mjs';

const candidateFlag = process.argv.indexOf('--candidate-root');
const candidateRoot = candidateFlag >= 0 ? path.resolve(process.argv[candidateFlag + 1] || '') : '';
const offline = process.argv.includes('--offline');
if (!candidateRoot || !existsSync(path.join(candidateRoot, '.git'))) throw new Error('Authenticated preflight requires the immutable candidate checkout.');
const git = args => execFileSync('git', args, { cwd: candidateRoot, encoding: 'utf8' }).trim();
const head = git(['rev-parse', 'HEAD']); const tree = git(['rev-parse', 'HEAD^{tree}']);
assert20260926Candidate({ head, sourceTree: tree, isAncestor: (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: candidateRoot, stdio: 'ignore' }).status === 0 });
const firebaseConfig = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.json'), 'utf8')); const candidateRc = JSON.parse(readFileSync(path.join(candidateRoot, '.firebaserc'), 'utf8'));
const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim(); const firebaseToolsRoot = path.join(globalNpmRoot, 'firebase-tools');
if (JSON.parse(readFileSync(path.join(firebaseToolsRoot, 'package.json'), 'utf8')).version !== PINNED_FIREBASE_CLI_VERSION) throw new Error(`Authenticated preflight requires firebase-tools ${PINNED_FIREBASE_CLI_VERSION}.`);
const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-20260926-auth-preflight-'));
try {
  const files = write20260926TemporaryFirebaseFiles({ directory: temporaryDirectory, firebaseConfig, candidateRc });
  const firebaseRequire = createRequire(path.join(firebaseToolsRoot, 'package.json')); const rc = firebaseRequire('./lib/rc.js').loadRC({ cwd: candidateRoot, configPath: files.configPath });
  const resolvedProject = rc.resolveAlias('beta'); const resolvedStorage = rc.target(resolvedProject, 'storage', BETA_STORAGE_TARGET);
  assert20260926TemporaryConfig({ firebaseConfig: JSON.parse(readFileSync(files.configPath, 'utf8')), firebaseRc: JSON.parse(readFileSync(files.rcPath, 'utf8')), resolvedProject });
  if (resolvedProject !== BETA_PROJECT_ID || resolvedProject === 'beta' || JSON.stringify(resolvedStorage) !== JSON.stringify([BETA_STORAGE_BUCKET])) throw new Error('Pinned Firebase CLI did not resolve the temporary Beta alias and Storage target exactly.');
  const declaredServiceAccounts = spawnSync('git', ['grep', '-n', '-E', 'serviceAccountEmail|serviceAccount', '--', 'functions'], { cwd: candidateRoot, encoding: 'utf8' });
  if (declaredServiceAccounts.status === 0) throw new Error(`Candidate declares additional function service accounts:\n${declaredServiceAccounts.stdout}`);
  if (declaredServiceAccounts.status !== 1) throw new Error('Unable to audit candidate Functions service-account declarations.');
  if (offline) {
    console.log(JSON.stringify({ mode: 'offline', project: resolvedProject, storageTarget: resolvedStorage, actAsServiceAccount: BETA_APP_ENGINE_SERVICE_ACCOUNT, additionalActAsServiceAccounts: [] }));
  } else {
    // functions:list is the furthest pinned CLI Functions path that is read-only.
    // Do not substitute firebase deploy --dry-run: that command may enable APIs.
    execFileSync('firebase', ['functions:list', '--json', '--config', files.configPath, '--project', 'beta'], { cwd: candidateRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    const candidateRequire = createRequire(path.join(candidateRoot, 'functions', 'package.json')); const { GoogleAuth } = candidateRequire('google-auth-library'); const auth = new GoogleAuth({ projectId: BETA_PROJECT_ID, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const report = await run20260926PermissionPreflight({ request: options => auth.request(options), firebaseToolsRoot });
    if (!report.functions || !report.hosting || !report.firestoreIndexes || !report.firestoreStorageRules || !report.httpsFunctionIam || !report.actAs) throw new Error('Authenticated permission preflight did not pass every required category.');
    console.log(JSON.stringify({ mode: 'authenticated', project: resolvedProject, storageTarget: resolvedStorage, functions: 'PASS', hosting: 'PASS', firestoreIndexes: 'PASS', firestoreStorageRules: 'PASS', httpsFunctionIam: 'PASS', actAs: 'PASS', actAsServiceAccount: BETA_APP_ENGINE_SERVICE_ACCOUNT, additionalActAsServiceAccounts: [] }));
  }
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
