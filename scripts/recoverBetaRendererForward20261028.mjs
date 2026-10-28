import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';
import { assertLiveBaseline } from './betaDeploymentSafety.mjs';

const project = 'misechef-beta-fa4bf';
const region = 'us-central1';
const service = 'renderpublicstore';
const currentRevision = 'renderpublicstore-00236-wag';
const targetRevision = 'renderpublicstore-00237-mab';
const candidateCommit = 'b14f22f6fff00f332aed9d45508fbb257d3763b0';
const candidateTree = '2bf1169fed09627e0367a49b470855a5902bff7f';
const protectedBaseline = '06a37c0d30c47e037994454119a0461955df4ee3';
const candidateAsset = '/assets/index-DeRtIBaj.js';
const candidateAssetSha256 = '129341322996a392570f7939d97d724262e0ba7a63cd767f2247c2b22481a173';
const targetImage = 'us-central1-docker.pkg.dev/misechef-beta-fa4bf/gcf-artifacts/misechef--beta--fa4bf__us--central1__cancel_public_store_payment@sha256:4f67e7971f26c7fbce5c2ebfb2df390d0604b7d02e500683efd3a12332e95b7f';
const origin = 'https://misechef-beta-fa4bf.web.app';
const command = (binary, args) => execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const candidateSource = path.join(process.env.GITHUB_WORKSPACE || '', 'candidate-source');
const candidateGit = args => command('git', ['-C', candidateSource, ...args]);
const gcloud = args => command('gcloud', [...args, `--project=${project}`, `--region=${region}`, '--format=json']);
const revision = name => JSON.parse(gcloud(['run', 'revisions', 'describe', name]));
const services = () => JSON.parse(gcloud(['run', 'services', 'list']));
const traffic = item => (item.status?.traffic || []).map(({ revisionName, percent }) => ({ revisionName, percent }));
const serviceTraffic = items => Object.fromEntries(items.map(item => [item.metadata.name, traffic(item)]));
const assertTraffic = (items, expectedRevision) => {
  const item = items.find(entry => entry.metadata.name === service);
  assert.ok(item, 'Beta renderer service is missing');
  assert.deepEqual(traffic(item), [{ revisionName: expectedRevision, percent: 100 }]);
};
const assertReady = item => assert.ok(
  item.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'),
  'Target renderer revision is not ready'
);
const assertApprovedManifest = manifest => {
  assert.equal(manifest.sourceCommit, candidateCommit);
  assert.equal(manifest.sourceTree, candidateTree);
  assert.equal(manifest.protectedBaseline, protectedBaseline);
  assert.equal(manifest.entryAsset, candidateAsset);
  assert.equal(manifest.storeShellAsset, candidateAsset);
  assert.equal(manifest.entryAssetSha256, candidateAssetSha256);
};
const assertTargetImage = image => assert.equal(image, targetImage, 'Target renderer image digest differs from approved image');
const assetFromShell = html => {
  const match = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  assert.ok(match, 'Target image has no versioned Store shell asset');
  return new URL(match[1], origin).pathname;
};
const shellFromWorkspace = (workspace, readText = file => readFileSync(file, 'utf8')) => {
  const matches = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(location);
      else if (entry.name === 'publicStoreAppShell.html') {
        assert.ok(entry.isFile(), 'Target Store shell is not a regular file');
        matches.push(location);
      }
    }
  };
  visit(workspace);
  assert.equal(matches.length, 1, 'Cannot independently identify exactly one Store shell in target image');
  return readText(matches[0]);
};
const inspectImage = (image, docker = args => command('docker', args)) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-renderer-'));
  let container = '';
  try {
    container = docker(['create', image]);
    assert.match(container, /^[0-9a-f]{64}$/, 'Docker did not return an immutable container ID');
    const workspace = path.join(directory, 'workspace');
    docker(['cp', `${container}:/workspace`, workspace]);
    return shellFromWorkspace(workspace);
  } finally {
    try {
      if (container) docker(['rm', '-v', container]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
};
const runInspectionSelfTests = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-renderer-test-'));
  try {
    const shell = path.join(directory, 'publicStoreAppShell.html');
    const valid = `<script src="${candidateAsset}"></script>`;
    writeFileSync(shell, valid);
    assert.equal(assetFromShell(shellFromWorkspace(directory)), candidateAsset);
    assert.throws(() => shellFromWorkspace(directory, () => { throw new Error('unreadable'); }), /unreadable/);
    writeFileSync(shell, '<script src="/assets/index-wrong.js"></script>');
    assert.throws(() => assert.equal(assetFromShell(shellFromWorkspace(directory)), candidateAsset));
    rmSync(shell);
    assert.throws(() => shellFromWorkspace(directory), /exactly one Store shell/);
    writeFileSync(shell, valid);
    mkdirSync(path.join(directory, 'duplicate'));
    writeFileSync(path.join(directory, 'duplicate', 'publicStoreAppShell.html'), valid);
    assert.throws(() => shellFromWorkspace(directory), /exactly one Store shell/);
    rmSync(path.join(directory, 'duplicate'), { recursive: true });
    const calls = [];
    const id = 'a'.repeat(64);
    const extracted = inspectImage('immutable-image', args => {
      calls.push(args[0]);
      if (args[0] === 'create') return id;
      if (args[0] === 'cp') {
        mkdirSync(args[2]);
        writeFileSync(path.join(args[2], 'publicStoreAppShell.html'), valid);
      }
      return '';
    });
    assert.equal(assetFromShell(extracted), candidateAsset);
    assert.deepEqual(calls, ['create', 'cp', 'rm']);
    const approvedManifest = { sourceCommit: candidateCommit, sourceTree: candidateTree,
      protectedBaseline, entryAsset: candidateAsset, storeShellAsset: candidateAsset,
      entryAssetSha256: candidateAssetSha256 };
    assertApprovedManifest(approvedManifest);
    assert.throws(() => assertApprovedManifest({ ...approvedManifest, sourceCommit: 'wrong' }));
    assert.throws(() => assertApprovedManifest({ ...approvedManifest, entryAssetSha256: 'wrong' }));
    assertTargetImage(targetImage);
    assert.throws(() => assertTargetImage('wrong-image'));
    assertTraffic([{ metadata: { name: service }, status: { traffic: [{ revisionName: currentRevision, percent: 100 }] } }], currentRevision);
    assert.throws(() => assertTraffic([{ metadata: { name: service }, status: { traffic: [{ revisionName: targetRevision, percent: 100 }] } }], currentRevision));
    assert.throws(() => assertTraffic([{ metadata: { name: service }, status: { traffic: [{ revisionName: currentRevision, percent: 99 }] } }], currentRevision));
    assertReady({ status: { conditions: [{ type: 'Ready', status: 'True' }] } });
    assert.throws(() => assertReady({ status: { conditions: [{ type: 'Ready', status: 'False' }] } }));
    console.log('Forward convergence preflight tests passed: image, shell, manifest, traffic, readiness, and no-container-execution checks.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const live = async () => {
  const fingerprint = await readLiveBetaFingerprint();
  assert.equal(fingerprint.releaseCommit, candidateCommit);
  assert.equal(fingerprint.rootAsset, candidateAsset);
  return fingerprint;
};

if (process.argv.includes('--self-test')) {
  runInspectionSelfTests();
  process.exit(0);
}

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Recovery must run in GitHub Actions');
assert.equal(process.env.GITHUB_REPOSITORY, 'celim0609/MiseChef', 'Recovery is limited to the MiseChef repository');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Recovery must run from main');
assert.equal(process.env.FIREBASE_DEPLOY_TARGET, 'beta');
assert.equal(process.env.RECOVERY_CONFIRMATION, 'CONVERGE BETA RENDERER 20261028');
assert.equal(candidateGit(['rev-parse', 'HEAD']), candidateCommit);

const before = await live();
assert.equal(before.storeAsset, '/assets/index-Cd3zjrhY.js', 'Incident state has changed; stop before traffic update');
const manifestResponse = await fetch(`${origin}/.well-known/misechef-beta-release.json`, { cache: 'no-store' });
assert.equal(manifestResponse.status, 200);
const manifest = await manifestResponse.json();
assertApprovedManifest(manifest);

const beforeServices = services();
assertTraffic(beforeServices, currentRevision);
const current = revision(currentRevision);
const target = revision(targetRevision);
assertReady(current);
assertReady(target);
assert.equal(target.metadata.labels['serving.knative.dev/service'], service);
assert.equal(target.metadata.namespace, current.metadata.namespace);

// Inspect the immutable target image offline. Never switch traffic merely because
// its revision number or creation timestamp resembles the previous release.
const image = target.spec.containers[0].image;
assertTargetImage(image);
command('gcloud', ['auth', 'configure-docker', 'us-central1-docker.pkg.dev', '--quiet']);
command('docker', ['pull', image]);
const targetShell = inspectImage(image);
assert.equal(assetFromShell(targetShell), candidateAsset, 'Target renderer image does not serve the Hosting asset');

const assetResponse = await fetch(`${origin}${candidateAsset}`, { cache: 'no-store' });
assert.equal(assetResponse.status, 200);
assert.match(assetResponse.headers.get('content-type') || '', /javascript/i);
const assetBytes = Buffer.from(await assetResponse.arrayBuffer());
assert.equal(createHash('sha256').update(assetBytes).digest('hex'), candidateAssetSha256);

// Recheck the live state immediately before the sole mutation.
assert.deepEqual(await live(), before, 'Live release changed during preflight');
assertTraffic(services(), currentRevision);
command('gcloud', ['run', 'services', 'update-traffic', service,
  `--to-revisions=${targetRevision}=100`, `--project=${project}`, `--region=${region}`, '--quiet']);

const afterServices = services();
assertTraffic(afterServices, targetRevision);
const priorAllocations = serviceTraffic(beforeServices);
const finalAllocations = serviceTraffic(afterServices);
delete priorAllocations[service];
delete finalAllocations[service];
assert.deepEqual(finalAllocations, priorAllocations, 'Another Cloud Run service traffic allocation changed');

const after = await live();
assert.equal(after.storeAsset, candidateAsset);
assertLiveBaseline({
  liveFingerprint: after,
  resolveSourceTree: commit => candidateGit(['rev-parse', `${commit}^{tree}`]),
  isAncestor: (ancestor, descendant) => {
    try { candidateGit(['merge-base', '--is-ancestor', ancestor, descendant]); return true; }
    catch { return false; }
  }
});
const finalAsset = await fetch(`${origin}${candidateAsset}`, { cache: 'no-store' });
assert.equal(finalAsset.status, 200);
assert.match(finalAsset.headers.get('content-type') || '', /javascript/i);
assert.equal(createHash('sha256').update(Buffer.from(await finalAsset.arrayBuffer())).digest('hex'), candidateAssetSha256);
console.log(JSON.stringify({ project, previousRevision: currentRevision, finalRevision: targetRevision,
  traffic: traffic(afterServices.find(item => item.metadata.name === service)), asset: candidateAsset,
  manifestCommit: candidateCommit, consistency: 'passed' }, null, 2));
