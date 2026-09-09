import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProvisioningRecords, provisionNewUser, selectProvisioningDisplayName } from './newUserProvisioning.js';

const UID = 'fresh-user';
const EMAIL = 'fresh@example.test';
const NOW = new Date('2026-08-09T00:00:00.000Z');

test('registration provisions only the Personal account and never a workspace or trial', () => {
  const records = buildProvisioningRecords({ uid: UID, email: EMAIL, displayName: 'Aisha Rahman', now: NOW });
  assert.equal(records.user.displayName, 'Aisha Rahman');
  assert.equal(records.user.profile.name, 'Aisha Rahman');
  assert.equal(records.user.companyId, undefined);
  assert.equal(records.user.companyRole, undefined);
  assert.equal(records.workspace, undefined);
  assert.equal(records.membership, undefined);
  assert.equal(records.company, undefined);
  assert.equal(records.result.ready, true);
  assert.equal(records.result.userRole, 'user');
  assert.equal(records.result.subscriptionStatus, undefined);
});

test('idempotent Personal provisioning preserves edited profile and existing business identity fields', () => {
  const records = buildProvisioningRecords({
    uid: UID, email: EMAIL, displayName: 'New Auth Name', now: NOW, userExists: true,
    existingUser: {
      uid: UID, companyId: 'existing-business', companyRole: 'owner', displayName: 'Existing Auth Name',
      profile: { name: 'Chef-edited Profile', photo: '' }
    }
  });
  assert.equal(records.user.displayName, 'Existing Auth Name');
  assert.equal(records.user.profile.name, 'Chef-edited Profile');
  assert.equal(records.user.companyId, 'existing-business');
  assert.equal(records.user.companyRole, 'owner');
  assert.equal(records.user.onboarding, undefined);
});

test('entered registration name wins before Firebase Auth displayName is available', () => {
  assert.equal(selectProvisioningDisplayName({ requestedDisplayName: 'Entered Name', authDisplayName: '', email: EMAIL }), 'Entered Name');
});

test('Personal provisioning transaction writes only the user document', async () => {
  const writes = [];
  const authUpdates = [];
  const db = {
    collection(collectionName) { return { doc(documentId) { return { path: `${collectionName}/${documentId}` }; } }; },
    async runTransaction(callback) {
      return callback({
        async get(ref) { return { exists: false, data: () => undefined, ref }; },
        set(ref, data, options) { writes.push({ path: ref.path, data, options }); }
      });
    }
  };
  const auth = { async updateUser(uid, update) { authUpdates.push({ uid, update }); } };
  const result = await provisionNewUser({ db, auth, uid: UID, email: EMAIL, authDisplayName: '', requestedDisplayName: 'Atomic Chef', now: NOW });
  assert.equal(result.ready, true);
  assert.deepEqual(authUpdates, [{ uid: UID, update: { displayName: 'Atomic Chef' } }]);
  assert.deepEqual(writes.map(write => write.path), [`users/${UID}`]);
  assert.ok(writes.every(write => write.options?.merge === true));
});
