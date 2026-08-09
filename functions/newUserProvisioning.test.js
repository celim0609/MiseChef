import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { buildProvisioningRecords, provisionNewUser, selectProvisioningDisplayName } from './newUserProvisioning.js';

const UID = 'fresh-user';
const EMAIL = 'fresh@example.test';
const NOW = new Date('2026-08-09T00:00:00.000Z');

test('entered registration name provisions profile, workspace, Owner membership, and exact trial atomically', () => {
  const records = buildProvisioningRecords({
    uid: UID,
    email: EMAIL,
    displayName: 'Aisha Rahman',
    now: NOW,
    workspaceCreateTime: Timestamp.fromDate(NOW)
  });

  assert.equal(records.user.displayName, 'Aisha Rahman');
  assert.equal(records.user.profile.name, 'Aisha Rahman');
  assert.equal(records.workspace.name, 'Aisha Rahman Kitchen');
  assert.equal(records.workspace.ownerId, UID);
  assert.equal(records.membership.id, `${UID}_${UID}`);
  assert.equal(records.membership.role, 'Owner');
  assert.equal(records.membership.status, 'Active');
  assert.equal(records.workspace.subscriptionPlan, 'professional');
  assert.equal(records.workspace.subscriptionStatus, 'trialing');
  assert.equal(records.workspace.trialStartedAt.toDate().toISOString(), NOW.toISOString());
  assert.equal(records.workspace.trialEndsAt.toDate().toISOString(), '2026-08-23T00:00:00.000Z');
  assert.equal(records.result.ready, true);
});

test('idempotent provisioning preserves manually edited workspace and profile names without extending trial', () => {
  const trialStart = Timestamp.fromDate(new Date('2026-08-08T00:00:00.000Z'));
  const trialEnd = Timestamp.fromDate(new Date('2026-08-22T00:00:00.000Z'));
  const records = buildProvisioningRecords({
    uid: UID,
    email: EMAIL,
    displayName: 'New Auth Name',
    now: NOW,
    workspaceCreateTime: trialStart,
    userExists: true,
    workspaceExists: true,
    membershipExists: true,
    existingUser: {
      uid: UID,
      displayName: 'Existing Auth Name',
      profile: { name: 'Chef-edited Profile', photo: '' }
    },
    existingWorkspace: {
      id: UID,
      name: 'My Hand-edited Restaurant',
      ownerId: UID,
      createdAt: '2026-08-08T00:00:00.000Z',
      subscriptionPlan: 'professional',
      subscriptionStatus: 'trialing',
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
      members: []
    },
    existingMembership: {
      id: `${UID}_${UID}`,
      createdAt: '2026-08-08T00:00:00.000Z'
    }
  });

  assert.equal(records.user.profile.name, 'Chef-edited Profile');
  assert.equal(records.workspace.name, 'My Hand-edited Restaurant');
  assert.equal(records.workspace.trialStartedAt.toDate().toISOString(), '2026-08-08T00:00:00.000Z');
  assert.equal(records.workspace.trialEndsAt.toDate().toISOString(), '2026-08-22T00:00:00.000Z');
  assert.equal(records.membership.workspaceName, 'My Hand-edited Restaurant');
});

test('entered registration name wins before Firebase Auth displayName is available', () => {
  assert.equal(selectProvisioningDisplayName({
    requestedDisplayName: 'Entered Name',
    authDisplayName: '',
    email: EMAIL
  }), 'Entered Name');
});

test('minimum workspace readiness documents commit through one transaction', async () => {
  const writes = [];
  const authUpdates = [];
  const refs = new Map();
  const db = {
    collection(collectionName) {
      return {
        doc(documentId) {
          const ref = { path: `${collectionName}/${documentId}` };
          refs.set(ref.path, ref);
          return ref;
        }
      };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) {
          return {
            exists: false,
            createTime: undefined,
            data: () => undefined,
            ref
          };
        },
        set(ref, data, options) {
          writes.push({ path: ref.path, data, options });
        }
      });
    }
  };
  const auth = {
    async updateUser(uid, update) {
      authUpdates.push({ uid, update });
    }
  };

  const result = await provisionNewUser({
    db,
    auth,
    uid: UID,
    email: EMAIL,
    authDisplayName: '',
    requestedDisplayName: 'Atomic Chef',
    now: NOW
  });

  assert.equal(result.ready, true);
  assert.deepEqual(authUpdates, [{ uid: UID, update: { displayName: 'Atomic Chef' } }]);
  assert.deepEqual(writes.map(write => write.path).sort(), [
    `companies/${UID}`,
    `users/${UID}`,
    `workspaceMembers/${UID}_${UID}`,
    `workspaces/${UID}`
  ]);
  assert.ok(writes.every(write => write.options?.merge === true));
});
