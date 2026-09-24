import assert from 'node:assert/strict';
import test from 'node:test';
import { BETA_MIXED_RELEASE_20260925_INCIDENT as incident, assert20260925Available, assert20260925LiveState, assertDurableLiveUnchanged } from './betaMixedRelease20260925Recovery.mjs';
import { assertIncidentAvailable as assertOldIncidentAvailable } from './betaMixedReleaseRecovery.mjs';

const live = { ...incident.live, rootAssetSha256: 'root', storeAssetSha256: 'store' };
test('durable live guard ignores unstable HTTP ETags but rejects every durable release change', () => {
  assert.doesNotThrow(() => assertDurableLiveUnchanged({ ...live, rootEtag: 'first', storeEtag: '' }, { ...live, rootEtag: 'second', storeEtag: 'different' }));
  for (const changed of [
    { rootAsset: '/assets/new.js' }, { storeAsset: '/assets/new.js' }, { releaseCommit: 'a'.repeat(40) },
    { releaseSourceTree: 'b'.repeat(40) }, { releaseBuildId: 'new-build' }, { releaseStoreShellAsset: '/assets/new.js' },
    { hostingVersion: 'sites/misechef-beta-fa4bf/versions/new' }, { renderPublicStoreRevision: 'renderpublicstore-new' }
  ]) assert.throws(() => assertDurableLiveUnchanged(live, { ...live, ...changed }), /durable live release identity changed/);
});
test('new incident pins the exact mixed state and the old consumed incident remains unusable', () => {
  assert.doesNotThrow(() => assert20260925LiveState(live));
  assert.throws(() => assert20260925LiveState({ ...live, storeAsset: '/assets/other.js' }), /pinned incident/);
  assert.doesNotThrow(() => assert20260925Available(null));
  assert.throws(() => assert20260925Available({ incident: 'beta-mixed-release-2026-09-24' }), /already consumed/);
  assert.throws(() => assertOldIncidentAvailable({ incident: 'beta-mixed-release-2026-09-24' }), /already consumed/);
});
