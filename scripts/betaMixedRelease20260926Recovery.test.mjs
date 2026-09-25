import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BETA_MIXED_RELEASE_20260926_INCIDENT as incident, BETA_APP_ENGINE_SERVICE_ACCOUNT, PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS, assert20260926Available, assert20260926PermissionPreflight, assert20260926TemporaryConfig, create20260926TemporaryRc, write20260926TemporaryFirebaseFiles } from './betaMixedRelease20260926Recovery.mjs';
import { BETA_PROJECT_ID } from './betaDeploymentSafety.mjs';

const candidateConfig = { storage: [{ target: 'beta-default', rules: 'storage.rules' }] };
const candidateRc = { projects: { beta: BETA_PROJECT_ID, production: 'misechef-fa4bf' }, targets: { [BETA_PROJECT_ID]: { storage: { 'beta-default': ['misechef-beta-fa4bf.firebasestorage.app'] } } } };
test('temporary recovery config preserves the Beta alias and Storage target', () => {
  const temporaryRc = create20260926TemporaryRc(candidateRc);
  assert.equal(temporaryRc.projects.beta, BETA_PROJECT_ID);
  assert.deepEqual(temporaryRc.targets[BETA_PROJECT_ID].storage['beta-default'], ['misechef-beta-fa4bf.firebasestorage.app']);
  assert.doesNotThrow(() => assert20260926TemporaryConfig({ firebaseConfig: candidateConfig, firebaseRc: temporaryRc, resolvedProject: BETA_PROJECT_ID }));
  const directory = mkdtempSync(`${os.tmpdir()}/misechef-20260926-test-`);
  try {
    const files = write20260926TemporaryFirebaseFiles({ directory, firebaseConfig: candidateConfig, candidateRc });
    assert.ok(existsSync(files.configPath));
    assert.ok(existsSync(files.rcPath));
  } finally { rmSync(directory, { recursive: true, force: true }); }
  assert.throws(() => assert20260926TemporaryConfig({ firebaseConfig: candidateConfig, firebaseRc: temporaryRc, resolvedProject: 'beta' }), /never literal beta/);
});
test('ActAs and every pinned deploy permission fail before any marker may be created', () => {
  assert.throws(() => assert20260926PermissionPreflight({ projectPermissions: PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS, actAsPermissions: [] }), new RegExp(BETA_APP_ENGINE_SERVICE_ACCOUNT));
  assert.throws(() => assert20260926PermissionPreflight({ projectPermissions: PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS.slice(1), actAsPermissions: ['iam.serviceAccounts.actAs'] }), /pinned full deploy permission preflight failed/);
  assert.doesNotThrow(() => assert20260926PermissionPreflight({ projectPermissions: PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS, actAsPermissions: ['iam.serviceAccounts.actAs'] }));
});
test('permission preflight is ordered before marker probe, marker write, and Firebase deploy', () => {
  const controller = readFileSync(fileURLToPath(new URL('./recoverBetaMixedRelease20260926.mjs', import.meta.url)), 'utf8');
  const preflight = controller.indexOf('await run20260926PermissionPreflight');
  const probe = controller.lastIndexOf('probe();');
  const deploy = controller.indexOf("spawn('firebase'");
  const consume = controller.lastIndexOf('create20260926Marker');
  assert.ok(preflight >= 0 && preflight < probe && probe < deploy && deploy < consume);
});
test('consumption of either old incident cannot authorize the new incident', () => {
  assert.throws(() => assert20260926Available({ incident: 'beta-mixed-release-2026-09-24' }), /already consumed/);
  assert.throws(() => assert20260926Available({ incident: 'beta-mixed-release-2026-09-25' }), /already consumed/);
  assert.doesNotThrow(() => assert20260926Available(null));
  assert.match(incident.consumptionMarker, /2026-09-26/);
});
