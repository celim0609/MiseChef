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
const currentRevision = 'renderpublicstore-00237-mab';
const targetRevision = 'renderpublicstore-00236-wag';
const stableCommit = '22550b371d096b8b441f91fd24a86f3c0196cb3d';
const stableAsset = '/assets/index-Cd3zjrhY.js';
const origin = 'https://misechef-beta-fa4bf.web.app';
const command = (binary, args) => execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const stableSource = path.join(process.env.GITHUB_WORKSPACE || '', 'stable-source');
const stableGit = args => command('git', ['-C', stableSource, ...args]);
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
    const valid = `<script src="${stableAsset}"></script>`;
    writeFileSync(shell, valid);
    assert.equal(assetFromShell(shellFromWorkspace(directory)), stableAsset);
    assert.throws(() => shellFromWorkspace(directory, () => { throw new Error('unreadable'); }), /unreadable/);
    writeFileSync(shell, '<script src="/assets/index-wrong.js"></script>');
    assert.throws(() => assert.equal(assetFromShell(shellFromWorkspace(directory)), stableAsset));
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
    assert.equal(assetFromShell(extracted), stableAsset);
    assert.deepEqual(calls, ['create', 'cp', 'rm']);
    console.log('Offline image inspection: success, wrong asset, missing, ambiguous, unreadable, and no-container-execution checks passed.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const live = async () => {
  const fingerprint = await readLiveBetaFingerprint();
  assert.equal(fingerprint.releaseCommit, stableCommit);
  assert.equal(fingerprint.rootAsset, stableAsset);
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
assert.equal(process.env.RECOVERY_CONFIRMATION, 'RESTORE BETA RENDERER 20261028');
assert.equal(stableGit(['rev-parse', 'HEAD']), stableCommit);

const before = await live();
assert.equal(before.storeAsset, '/assets/index-DeRtIBaj.js', 'Incident state has changed; stop before traffic update');
const manifestResponse = await fetch(`${origin}/.well-known/misechef-beta-release.json`, { cache: 'no-store' });
assert.equal(manifestResponse.status, 200);
const manifest = await manifestResponse.json();
assert.equal(manifest.sourceCommit, stableCommit);
assert.equal(manifest.entryAsset, stableAsset);
assert.equal(manifest.storeShellAsset, stableAsset);

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
assert.match(image, /^us-central1-docker\.pkg\.dev\/misechef-beta-fa4bf\/gcf-artifacts\/.+@sha256:[0-9a-f]{64}$/);
command('gcloud', ['auth', 'configure-docker', 'us-central1-docker.pkg.dev', '--quiet']);
command('docker', ['pull', image]);
const targetShell = inspectImage(image);
assert.equal(assetFromShell(targetShell), stableAsset, 'Target renderer image does not serve the Hosting asset');

const assetResponse = await fetch(`${origin}${stableAsset}`, { cache: 'no-store' });
assert.equal(assetResponse.status, 200);
assert.match(assetResponse.headers.get('content-type') || '', /javascript/i);
const assetBytes = Buffer.from(await assetResponse.arrayBuffer());
assert.equal(createHash('sha256').update(assetBytes).digest('hex'), manifest.entryAssetSha256);

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
assert.equal(after.storeAsset, stableAsset);
assertLiveBaseline({
  liveFingerprint: after,
  resolveSourceTree: commit => stableGit(['rev-parse', `${commit}^{tree}`]),
  isAncestor: (ancestor, descendant) => {
    try { stableGit(['merge-base', '--is-ancestor', ancestor, descendant]); return true; }
    catch { return false; }
  }
});
const finalAsset = await fetch(`${origin}${stableAsset}`, { cache: 'no-store' });
assert.equal(finalAsset.status, 200);
assert.match(finalAsset.headers.get('content-type') || '', /javascript/i);
assert.equal(createHash('sha256').update(Buffer.from(await finalAsset.arrayBuffer())).digest('hex'), manifest.entryAssetSha256);
console.log(JSON.stringify({ project, previousRevision: currentRevision, finalRevision: targetRevision,
  traffic: traffic(afterServices.find(item => item.metadata.name === service)), asset: stableAsset,
  manifestCommit: stableCommit, consistency: 'passed' }, null, 2));
