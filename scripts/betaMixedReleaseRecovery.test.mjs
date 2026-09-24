import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BETA_MIXED_RELEASE_INCIDENT,
  assertBetaProjectAlias,
  assertExactCandidate,
  assertExpectedMixedLiveState,
  assertIncidentAvailable,
  isMissingConsumptionMarkerError,
  assertRecoveredRelease,
  assertRecoveryMode,
  createConsumptionMarker
} from './betaMixedReleaseRecovery.mjs';
import { readLiveReleaseMetadata } from './betaRun33530702897Recovery.mjs';

const incident = BETA_MIXED_RELEASE_INCIDENT;
const validCandidate = { head: incident.candidateCommit, sourceTree: incident.candidateSourceTree, isAncestor: () => true };
const controllerSource = readFileSync(new URL('./recoverBetaMixedRelease.mjs', import.meta.url), 'utf8');

test('mixed-release recovery fails closed on every authorization precondition', () => {
  for (const invalid of [
    { confirmation: 'wrong', authorization: 'wrong', githubActions: true, ciLockId: 'misechef-beta-deployment' },
    { confirmation: incident.confirmation, authorization: 'wrong', githubActions: true, ciLockId: 'misechef-beta-deployment' },
    { confirmation: incident.confirmation, authorization: 'wrong', githubActions: false, ciLockId: 'misechef-beta-deployment' },
    { confirmation: incident.confirmation, authorization: 'wrong', githubActions: true, ciLockId: 'other' }
  ]) assert.throws(() => assertRecoveryMode(invalid), /recovery refused/);
  assert.match(readFileSync(new URL('./betaMixedReleaseRecovery.mjs', import.meta.url), 'utf8'), /createHash\('sha256'\)/);
});

test('mixed-release recovery fails closed on candidate, alias, live-state, and prior-consumption drift', () => {
  assert.doesNotThrow(() => assertExactCandidate(validCandidate));
  assert.throws(() => assertExactCandidate({ ...validCandidate, sourceTree: '0'.repeat(40) }), /recovery refused/);
  assert.throws(() => assertExactCandidate({ ...validCandidate, isAncestor: () => false }), /recovery refused/);
  assert.doesNotThrow(() => assertBetaProjectAlias({ projects: { beta: 'misechef-beta-fa4bf', production: 'misechef-fa4bf' } }));
  assert.throws(() => assertBetaProjectAlias({ projects: { beta: 'misechef-fa4bf', production: 'misechef-fa4bf' } }), /recovery refused/);
  assert.doesNotThrow(() => assertExpectedMixedLiveState(incident.live));
  assert.throws(() => assertExpectedMixedLiveState({ ...incident.live, rootAsset: '/assets/unapproved.js' }), /recovery refused/);
  assert.doesNotThrow(() => assertIncidentAvailable(null));
  assert.throws(() => assertIncidentAvailable({ incident: incident.id }), /already consumed/);
});

test('pinned Store-shell incident evidence comes from live manifest metadata', async () => {
  const metadata = await readLiveReleaseMetadata({
    origin: 'https://misechef-beta-fa4bf.web.app',
    request: async url => {
      assert.match(url, /\.well-known\/misechef-beta-release\.json\?beta-recovery-check=/);
      return {
        ok: true,
        json: async () => ({ storeShellAsset: '/assets/index-BKXk7Nzq.js' })
      };
    }
  });
  assert.equal(metadata.storeShellAsset, incident.live.releaseStoreShellAsset);
});

test('a first-run missing marker is unused while consumed and real read errors fail closed', () => {
  const missing = { stderr: 'ERROR: (gcloud.storage.cat) The following URLs matched no objects or files:\ngs://bucket/misechef-release-guards/incident.json' };
  assert.equal(isMissingConsumptionMarkerError(missing), true);
  assert.doesNotThrow(() => assertIncidentAvailable(null));
  assert.throws(() => assertIncidentAvailable({ incident: incident.id }), /already consumed/);
  for (const error of [
    { stderr: 'ERROR: (gcloud.storage.cat) 403 Permission denied.' },
    { stderr: 'ERROR: (gcloud.storage.cat) 401 Unauthenticated.' },
    { stderr: 'ERROR: (gcloud.storage.cat) The specified bucket does not exist.' }
  ]) assert.equal(isMissingConsumptionMarkerError(error), false);
});

test('consumption marker is created only after Firebase reports a started process', () => {
  assert.deepEqual(createConsumptionMarker({ runId: '123', startedAt: '2026-09-24T00:00:00.000Z' }), {
    incident: incident.id,
    candidateCommit: incident.candidateCommit,
    runId: '123',
    deployStartedAt: '2026-09-24T00:00:00.000Z'
  });
  assert.ok(controllerSource.indexOf("await once(child, 'spawn');") < controllerSource.indexOf('markConsumedAfterDeployStart();'));
  assert.match(controllerSource, /gcloud', \['storage', 'cp', '--if-generation-match=0'/);
  assert.match(controllerSource, /probe-\$\{randomBytes\(32\)\.toString\('hex'\)\}/);
  assert.ok(controllerSource.indexOf('probeMarkerAccess();') < controllerSource.indexOf("spawn('firebase'"));
  assert.match(controllerSource, /MARKER WRITE FAILED - DO NOT RE-DISPATCH/);
});

test('controller retains every fail-closed precondition before Firebase deploy', () => {
  for (const guard of [
    'assertRecoveryMode',
    'assertExactCandidate',
    'assertExplicitBetaStorageTarget',
    'assertBetaProjectAlias',
    'assertPinnedFirebaseCliStorageBehavior',
    'assertAuthority',
    'assertIncidentAvailable(readMarker())',
    'assertExpectedMixedLiveState(liveBefore)',
    'assertArtifactCompatibility',
    'assertLiveReleaseUnchanged'
  ]) assert.ok(controllerSource.indexOf(guard) >= 0, `${guard} must remain fail-closed`);
  assert.ok(controllerSource.indexOf("spawn('firebase'") > controllerSource.indexOf('assertExpectedMixedLiveState(liveBeforeDeploy)'));
});

test('post-deploy verification fails closed until assets, manifest, and Store revision converge', () => {
  const manifest = { sourceCommit: incident.candidateCommit, sourceTree: incident.candidateSourceTree, entryAsset: '/assets/index-new.js', storeShellAsset: '/assets/index-new.js' };
  const live = { releaseCommit: manifest.sourceCommit, releaseSourceTree: manifest.sourceTree, releaseProtectedBaseline: incident.live.releaseProtectedBaseline, rootAsset: manifest.entryAsset, storeAsset: manifest.entryAsset };
  const before = { latestReadyRevision: 'renderpublicstore-00040-old' };
  const after = { latestReadyRevision: 'renderpublicstore-00041-new', trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100 }] };
  assert.doesNotThrow(() => assertRecoveredRelease({ live, manifest, renderPublicStoreBefore: before, renderPublicStoreAfter: after }));
  assert.throws(() => assertRecoveredRelease({ live: { ...live, storeAsset: '/assets/old.js' }, manifest, renderPublicStoreBefore: before, renderPublicStoreAfter: after }), /converge/);
  assert.throws(() => assertRecoveredRelease({ live, manifest, renderPublicStoreBefore: before, renderPublicStoreAfter: before }), /new ready revision/);
});
