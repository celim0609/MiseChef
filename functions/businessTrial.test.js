import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { buildBusinessTrialRecords } from './businessTrial.js';

const input = {
  uid: 'trial-user', email: 'trial@example.test', authDisplayName: 'Trial Chef',
  now: new Date('2026-08-09T00:00:00.000Z')
};

test('explicit Business trial creates an exact 14-day Professional trial and Owner membership', () => {
  const records = buildBusinessTrialRecords(input);
  assert.equal(records.workspace.subscriptionPlan, 'professional');
  assert.equal(records.workspace.subscriptionStatus, 'trialing');
  assert.equal(records.workspace.trialStartedAt.toDate().toISOString(), '2026-08-09T00:00:00.000Z');
  assert.equal(records.workspace.trialEndsAt.toDate().toISOString(), '2026-08-23T00:00:00.000Z');
  assert.equal(records.membership.role, 'Owner');
  assert.equal(records.user.companyId, 'trial-user');
  assert.equal(records.company.subscriptionPlan, 'professional');
  assert.equal(records.company.subscriptionStatus, 'trialing');
  assert.equal(records.result.workspaceId, 'trial-user');
});

test('a previous trial cannot be restarted or extended', () => {
  assert.throws(() => buildBusinessTrialRecords({
    ...input, workspaceExists: true,
    existingWorkspace: {
      ownerId: input.uid, subscriptionPlan: 'free', subscriptionStatus: 'suspended',
      trialStartedAt: Timestamp.fromDate(new Date('2026-07-01T00:00:00.000Z')),
      trialEndsAt: Timestamp.fromDate(new Date('2026-07-15T00:00:00.000Z'))
    }
  }), /already been used/);
});

test('existing active Business entitlement is never overwritten', () => {
  assert.throws(() => buildBusinessTrialRecords({
    ...input, workspaceExists: true,
    existingWorkspace: { ownerId: input.uid, subscriptionPlan: 'starter', subscriptionStatus: 'active' }
  }), /already has a Business entitlement/);
});

test('another owner workspace cannot be claimed through trial activation', () => {
  assert.throws(() => buildBusinessTrialRecords({
    ...input, workspaceExists: true,
    existingWorkspace: { ownerId: 'someone-else', subscriptionPlan: 'free', subscriptionStatus: 'suspended' }
  }), /Only the workspace owner/);
});
