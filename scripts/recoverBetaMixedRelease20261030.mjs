import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import { createRequire } from 'node:module';
import { ALLOWED_POST_BUILD_DIRTY_PATHS, BETA_PROJECT_ID, FULL_BETA_RESOURCE_PLAN, MANDATORY_BETA_BASELINE, assertArtifactCompatibility, assertAuthority, assertCleanSource, assertExactResourcePlan, assertPinnedFirebaseCliStorageBehavior, parsePorcelainDirtyPaths } from './betaDeploymentSafety.mjs';
import { createBetaHostingReader, readDurableBetaLiveState } from './betaDurableLiveRelease.mjs';
import { readCloudRunServiceState, readLiveAssetProof, readLiveReleaseMetadata } from './betaRun33530702897Recovery.mjs';
import { run20260926PermissionPreflight } from './betaMixedRelease20260926PermissionPreflight.mjs';
import { BETA_MIXED_RELEASE_20261030_INCIDENT as incident, assert20261030Available, assert20261030Candidate, assert20261030LiveState, assert20261030TemporaryConfig, assertDurableLiveUnchanged, read20261030IncidentState, assert20261030DeployCompleted, assertRecovery20261030Mode, create20261030Marker, create20261030TemporaryRc, write20261030TemporaryFirebaseFiles } from './betaMixedRelease20261030Recovery.mjs';

const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateFlag = process.argv.indexOf('--candidate-root'); const candidateRoot = candidateFlag >= 0 ? path.resolve(process.argv[candidateFlag + 1] || '') : '';
const dryRun = process.argv.includes('--dry-run-before-marker');
if (!candidateRoot || !existsSync(path.join(candidateRoot, '.git'))) throw new Error('Recovery requires an immutable candidate checkout.');
const git = (args, root = candidateRoot) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const command = (bin, args, cwd = candidateRoot, env = {}) => execFileSync(bin, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
const gate = process.env.MISECHEF_BETA_MIXED_RELEASE_20261030_GATE_SHA || '';
if (!/^[0-9a-f]{40}$/.test(gate) || git(['rev-parse', 'HEAD'], controllerRoot) !== gate) throw new Error('Recovery controller does not match the protected gate SHA.');
assertRecovery20261030Mode({ confirmation: process.env.MISECHEF_BETA_MIXED_RELEASE_20261030_CONFIRMATION, approvedSha: process.env.MISECHEF_BETA_MIXED_RELEASE_20261030_APPROVED_SHA, githubActions: process.env.GITHUB_ACTIONS === 'true', ciLockId: process.env.MISECHEF_BETA_CI_LOCK_ID });
const head = git(['rev-parse', 'HEAD']); const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
assert20261030Candidate({ head, sourceTree, isAncestor: (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: candidateRoot }).status === 0 });
assertCleanSource(parsePorcelainDirtyPaths(execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: candidateRoot, encoding: 'utf8' })));
assertExactResourcePlan(FULL_BETA_RESOURCE_PLAN);
const firebaseConfig = JSON.parse(readFileSync(path.join(candidateRoot, 'firebase.json'), 'utf8')); const candidateRc = JSON.parse(readFileSync(path.join(candidateRoot, '.firebaserc'), 'utf8')); const temporaryRc = create20261030TemporaryRc(candidateRc);
assert20261030TemporaryConfig({ firebaseConfig, firebaseRc: temporaryRc, resolvedProject: BETA_PROJECT_ID });
assertAuthority({ authorityBaseline: process.env.MISECHEF_BETA_PROTECTED_BASELINE, documentedBaseline: MANDATORY_BETA_BASELINE, head, isAncestor: (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: candidateRoot }).status === 0 });
const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim(); const firebaseToolsRoot = path.join(globalNpmRoot, 'firebase-tools');
assertPinnedFirebaseCliStorageBehavior({ version: execFileSync('firebase', ['--version'], { encoding: 'utf8' }).trim(), prepareSource: readFileSync(path.join(firebaseToolsRoot, 'lib/deploy/storage/prepare.js'), 'utf8') });
const candidateRequire = createRequire(path.join(candidateRoot, 'functions', 'package.json')); const { GoogleAuth } = candidateRequire('google-auth-library'); const auth = new GoogleAuth({ projectId: BETA_PROJECT_ID, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const request = options => auth.request(options); const readDurable = () => readDurableBetaLiveState({ readHostingVersion: createBetaHostingReader(request), readServices: () => readCloudRunServiceState({ firebaseToolsRoot }) });
const live = () => read20261030IncidentState({readDurable,request});
const markerPath = incident.consumptionMarker; const markerPrefix = markerPath.slice(0, markerPath.lastIndexOf('/') + 1);
const readMarker = () => { try { return JSON.parse(execFileSync('gcloud', ['storage', 'cat', markerPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { if (/matched no objects or files|No URLs matched|Not Found/.test(`${e.stdout || ''}${e.stderr || ''}`)) return null; throw new Error('Unable to read the protected incident marker.'); } };
const writeObject = (local, target) => execFileSync('gcloud', ['storage', 'cp', '--if-generation-match=0', local, target], { stdio: 'inherit' });
const probe = () => { const probeDir = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-20261030-probe-')); const file = path.join(probeDir, 'probe.json'); const target = `${markerPrefix}probe-${randomBytes(32).toString('hex')}`; try { writeFileSync(file, '{"probe":true}\n'); writeObject(file, target); execFileSync('gcloud', ['storage', 'rm', target], { stdio: 'inherit' }); } finally { rmSync(probeDir, { recursive: true, force: true }); } };

assert20261030Available(readMarker()); const before = await live(); assert20261030LiveState(before);
command('npm', ['run', 'validate:firebase-env:beta']); command('npx', ['vite', 'build', '--mode', 'beta']); command('node', ['scripts/prepareStoreSocialTemplate.mjs']); command('node', ['scripts/generateBetaBuildManifest.mjs'], candidateRoot, { MISECHEF_BETA_PROTECTED_BASELINE: MANDATORY_BETA_BASELINE });
const manifest = JSON.parse(readFileSync(path.join(candidateRoot, 'dist/.well-known/misechef-beta-release.json'), 'utf8')); assertArtifactCompatibility({ repositoryRoot: candidateRoot, manifest: { ...manifest, currentSourceTree: sourceTree }, head, baseline: MANDATORY_BETA_BASELINE }); assertCleanSource(parsePorcelainDirtyPaths(execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: candidateRoot, encoding: 'utf8' })), ALLOWED_POST_BUILD_DIRTY_PATHS);
const beforeDeploy = await live(); assertDurableLiveUnchanged(before, beforeDeploy); assert20261030LiveState(beforeDeploy); assert20261030Available(readMarker());
const dir = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-20261030-')); const session = path.join(dir, 'session.json'); const configPath = path.join(dir, 'firebase.json'); const rcPath = path.join(dir, '.firebaserc'); const nonce = randomBytes(32).toString('hex'); const lockPath = path.resolve(candidateRoot, git(['rev-parse', '--git-common-dir']), 'misechef-beta-deployment.lock');
try {
  const deployConfig = structuredClone(firebaseConfig); const predeploy = [`node ${path.join(controllerRoot, 'scripts/validateBetaMixedRelease20261030Predeploy.mjs')} --candidate-root ${candidateRoot}`];
  deployConfig.functions = { ...deployConfig.functions, source: path.join(candidateRoot, deployConfig.functions.source), predeploy }; deployConfig.firestore = { ...deployConfig.firestore, rules: path.join(candidateRoot, deployConfig.firestore.rules), indexes: path.join(candidateRoot, deployConfig.firestore.indexes), predeploy }; deployConfig.storage = deployConfig.storage.map(item => ({ ...item, rules: path.join(candidateRoot, item.rules), predeploy })); deployConfig.hosting = { ...deployConfig.hosting, public: path.join(candidateRoot, deployConfig.hosting.public), predeploy };
  const temporaryFiles = write20261030TemporaryFirebaseFiles({ directory: dir, firebaseConfig, candidateRc });
  if (temporaryFiles.configPath !== configPath || temporaryFiles.rcPath !== rcPath) throw new Error('temporary Firebase config paths changed unexpectedly.');
  writeFileSync(configPath, JSON.stringify(deployConfig));
  await run20260926PermissionPreflight({ request, firebaseToolsRoot });
  const immediatelyBeforeMarker = await live(); assertDurableLiveUnchanged(beforeDeploy, immediatelyBeforeMarker); assert20261030LiveState(immediatelyBeforeMarker); assert20261030Available(readMarker());
  if (dryRun) { console.log('20261030 recovery dry run passed and stopped before marker probe/write/deploy.'); process.exitCode = 0; }
  else {
    writeFileSync(session, JSON.stringify({ version: 1, nonce, sourceCommit: head, protectedBaseline: MANDATORY_BETA_BASELINE, sourceTree, resources: FULL_BETA_RESOURCE_PLAN, durableLiveState: immediatelyBeforeMarker, buildId: manifest.buildId, recovery: incident.id, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000 }));
    closeSync(openSync(lockPath, 'wx', 0o600)); probe();
    command('firebase', ['experiments:disable', 'functionsv2deployoptimizations']);
    if ((process.env.FIREBASE_CLI_EXPERIMENTS || '').split(',').includes('functionsv2deployoptimizations')) throw new Error('Unsafe source-token optimization forced by environment.');
    execFileSync(process.execPath, ['-e', `if(require(${JSON.stringify(path.join(firebaseToolsRoot,'lib/experiments.js'))}).isEnabled('functionsv2deployoptimizations')) process.exit(1)`]);
    const markerFile = path.join(dir, 'consumed.json'); writeFileSync(markerFile, JSON.stringify(create20261030Marker({ runId: process.env.GITHUB_RUN_ID || '' }))); writeObject(markerFile, markerPath);
    let deployOutput = '';
    const child = spawn('firebase', ['deploy', '--config', configPath, '--project', 'beta', '--only', FULL_BETA_RESOURCE_PLAN.join(',')], { cwd: candidateRoot, env: { ...process.env, FIREBASE_DEPLOY_TARGET: 'beta', MISECHEF_BETA_DEPLOY_SESSION_FILE: session, MISECHEF_BETA_DEPLOY_SESSION_NONCE: nonce, MISECHEF_BETA_CI_LOCK_ID: 'misechef-beta-deployment' }, stdio: ['ignore','pipe','pipe'] });
    for (const [stream, target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]) stream.on('data', chunk => { target.write(chunk); deployOutput = (deployOutput + chunk).slice(-262144); });
    await once(child, 'spawn');
    const [code] = await once(child, 'close'); assert20261030DeployCompleted({code, output:deployOutput});
    const after = await live(); const metadata = await readLiveReleaseMetadata();  if (after.releaseCommit !== head || after.releaseSourceTree !== sourceTree || after.rootAsset !== manifest.entryAsset || after.storeAsset !== manifest.entryAsset || metadata.storeShellAsset !== manifest.entryAsset) throw new Error('Post-deploy durable convergence failed.'); const proof = await readLiveAssetProof({ origin: 'https://misechef-beta-fa4bf.web.app', asset: manifest.entryAsset }); if (proof.sha256 !== manifest.entryAssetSha256) throw new Error('Deployed root asset bytes do not match the candidate manifest.');
    const {verifyBetaWebRelease, stylesheetPaths} = await import(pathToFileURL(path.join(candidateRoot,'scripts/betaWebReleaseVerification.mjs')).href);
    const {createHash} = await import('node:crypto');
    const expectedCss = stylesheetPaths(readFileSync(path.join(candidateRoot,'dist/index.html'),'utf8')).map(asset=>({path:asset,sha256:createHash('sha256').update(readFileSync(path.join(candidateRoot,'dist',asset.slice(1)))).digest('hex')}));
    await verifyBetaWebRelease({manifest, expectedCss});
    const deployedFunctions=[]; let pageToken='';
    do { const response=await request({method:'GET',url:`https://cloudfunctions.googleapis.com/v2/projects/${BETA_PROJECT_ID}/locations/-/functions`,params:{pageSize:1000,...(pageToken?{pageToken}:{})}}); deployedFunctions.push(...(response.data.functions || [])); pageToken=response.data.nextPageToken || ''; } while(pageToken);
    const expectedFunctions=[...readFileSync(path.join(candidateRoot,'functions/index.js'),'utf8').matchAll(/^export const (\w+)\s*=/gm)].map(match=>match[1]);
    for(const id of expectedFunctions) if(!deployedFunctions.some(fn=>fn.name.endsWith('/'+id) && fn.state==='ACTIVE')) throw new Error(`Expected Function is not ACTIVE: ${id}`);
  }
} finally { if (existsSync(lockPath)) unlinkSync(lockPath); rmSync(dir, { recursive: true, force: true }); }
