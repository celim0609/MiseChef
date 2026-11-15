import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';

// One exact incident, not a general exception to the live-coherence gate.
export const RENDERER_INCIDENT = Object.freeze({
  project: 'misechef-beta-fa4bf', region: 'us-central1', service: 'renderpublicstore',
  liveCommit: '4cb68c8d34280dc314a506469851501aaca23f13',
  liveTree: '949e768e1178313ea524f686b7895c9d0a86b221',
  baseline: '06a37c0d30c47e037994454119a0461955df4ee3',
  buildId: 'bcced86b-a90f-4cea-aeff-e446cbb8cb3a',
  oldAsset: '/assets/index-DeRtIBaj.js', asset: '/assets/index-C2bCr1fA.js',
  assetSha256: 'ae49aa9089ca9c2b63e19e5d628f1e05aab8a369d54e2507b25e16825e0a317b',
  pinnedRevision: 'renderpublicstore-00237-mab', targetRevision: 'renderpublicstore-00240-koz',
  image: 'us-central1-docker.pkg.dev/misechef-beta-fa4bf/gcf-artifacts/misechef--beta--fa4bf__us--central1__record_store_customer_reminder@sha256:cbc544816ff47724514ea6ede19439e96f692f11d83040eed9e3a8da7d674c00'
});
const origin = `https://${RENDERER_INCIDENT.project}.web.app`;
const command = (binary, args) => execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const shellAsset = html => {
  const match = html.match(/<script[^>]+src=["'](\/assets\/index-[^"']+\.js)["']/i);
  assert.ok(match, 'Renderer image has no versioned application script');
  return match[1];
};
export function inspectRendererImage(image, run = command) {
  assert.equal(image, RENDERER_INCIDENT.image);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'misechef-beta-renderer-'));
  let container;
  try {
    container = run('docker', ['create', image]);
    assert.match(container, /^[a-f0-9]{64}$/);
    run('docker', ['cp', `${container}:/workspace`, directory]);
    const shells = [];
    const visit = folder => {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, item.name);
        if (item.isDirectory()) visit(file);
        else if (item.isFile() && item.name === 'publicStoreAppShell.html') shells.push(file);
      }
    };
    visit(directory);
    assert.equal(shells.length, 1, 'Exactly one renderer shell must be identified in the immutable image');
    return readFileSync(shells[0], 'utf8');
  } finally {
    if (container) run('docker', ['rm', '-v', container]);
    rmSync(directory, { recursive: true, force: true });
  }
}
export function assertRendererIncident(live, service, revision, manifest) {
  const i = RENDERER_INCIDENT;
  for (const [key, expected] of Object.entries({ releaseCommit:i.liveCommit, releaseSourceTree:i.liveTree, releaseProtectedBaseline:i.baseline, releaseBuildId:i.buildId, rootAsset:i.asset, storeAsset:i.oldAsset })) assert.equal(live[key], expected, `Incident ${key} changed`);
  for (const [key, expected] of Object.entries({sourceCommit:i.liveCommit,sourceTree:i.liveTree,protectedBaseline:i.baseline,buildId:i.buildId,entryAsset:i.asset,storeShellAsset:i.asset,entryAssetSha256:i.assetSha256})) assert.equal(manifest[key],expected,`Manifest ${key} changed`);
  assert.equal(service.metadata.name, i.service);
  assert.equal(service.status.latestCreatedRevisionName, i.targetRevision);
  assert.deepEqual(service.spec.traffic, [{percent:100,revisionName:i.pinnedRevision}]);
  assert.deepEqual(service.status.traffic, [{percent:100,revisionName:i.pinnedRevision}]);
  assert.equal(revision.metadata.name, i.targetRevision);
  assert.equal(revision.metadata.labels['serving.knative.dev/service'], i.service);
  assert.equal(revision.metadata.namespace, service.metadata.namespace);
  assert.equal(revision.spec.containers[0].image, i.image);
  assert.ok(revision.status.conditions.some(condition => condition.type === 'Ready' && condition.status === 'True'));
}
export async function repairKnownBetaRendererIncident({
  env = process.env, head, isAncestor,
  run = command, readLive = readLiveBetaFingerprint, fetchImpl = fetch,
  inspectImage = image => inspectRendererImage(image, run),
  hashAsset = bytes => createHash('sha256').update(bytes).digest('hex')
}) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Renderer repair requires protected GitHub Actions');
  assert.equal(env.GITHUB_REPOSITORY, 'celim0609/MiseChef');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.FIREBASE_DEPLOY_TARGET, 'beta');
  assert.equal(env.MISECHEF_BETA_CI_LOCK_ID, 'misechef-beta-deployment');
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.ok(isAncestor(RENDERER_INCIDENT.liveCommit, head), 'Approved candidate must descend from the incident release');
  const i = RENDERER_INCIDENT;
  const describe = (kind, name) => JSON.parse(run('gcloud', ['run',kind,'describe',name,`--project=${i.project}`,`--region=${i.region}`,'--format=json']));
  const before = await readLive();
  const manifestResponse = await fetchImpl(`${origin}/.well-known/misechef-beta-release.json`, { cache:'no-store' });
  assert.equal(manifestResponse.status,200);
  const manifest = await manifestResponse.json();
  const service = describe('services',i.service), revision = describe('revisions',i.targetRevision);
  assertRendererIncident(before,service,revision,manifest);
  run('gcloud',['auth','configure-docker','us-central1-docker.pkg.dev','--quiet']);
  run('docker',['pull',i.image]);
  assert.equal(shellAsset(inspectImage(i.image)),i.asset,'Immutable renderer image shell does not match current Hosting');
  const asset = await fetchImpl(`${origin}${i.asset}`, { cache:'no-store' });
  assert.equal(asset.status,200); assert.match(asset.headers.get('content-type') || '', /javascript/i);
  assert.equal(hashAsset(Buffer.from(await asset.arrayBuffer())),i.assetSha256);
  // Revalidate immediately before the only live mutation, after source tests and image inspection.
  assert.deepEqual(await readLive(),before,'Live release changed while inspecting renderer');
  assert.deepEqual(describe('services',i.service),service,'Renderer state changed during inspection');
  run('gcloud',['run','services','update-traffic',i.service,'--to-latest',`--project=${i.project}`,`--region=${i.region}`,'--quiet']);
  const after = describe('services',i.service);
  assert.deepEqual(after.spec.traffic,[{percent:100,latestRevision:true}],'Renderer must follow latest revisions, not acquire another fixed pin');
  assert.equal(after.status.latestReadyRevisionName,i.targetRevision);
  assert.ok(after.status.traffic.some(target=>target.revisionName===i.targetRevision && target.percent===100));
  const live = await readLive();
  for (const key of ['rootAsset','releaseCommit','releaseSourceTree','releaseProtectedBaseline','releaseBuildId','rootEtag']) assert.equal(live[key],before[key],`Repair changed ${key}`);
  assert.equal(live.storeAsset,i.asset,'Renderer did not converge to unchanged live Hosting');
  return live;
}
