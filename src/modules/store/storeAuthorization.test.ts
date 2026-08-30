import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStoreAuthorizationIssue,
  getStoreAuthorizationMessage
} from './storeAuthorization';

const baseContext = {
  authenticatedUid: 'owner-a',
  requestedUserId: 'owner-a',
  workspaceId: 'workspace-a',
  workspaceOwnerId: 'owner-a',
  membership: null,
  store: { id: 'workspace-a', workspaceId: 'workspace-a' },
  subscriptionStatus: 'trialing' as const
};

test('canonical Workspace Owner can manage products even when a legacy membership is absent', () => {
  assert.equal(getStoreAuthorizationIssue(baseContext), null);
});

test('active Manager can manage products for the matching Workspace', () => {
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    authenticatedUid: 'manager-a',
    requestedUserId: 'manager-a',
    membership: { role: 'Manager', status: 'Active' }
  }), null);
});

test('active Head Chef can manage products without receiving Store settings authority', () => {
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    authenticatedUid: 'head-chef-a',
    requestedUserId: 'head-chef-a',
    membership: { role: 'Head Chef', status: 'Active' }
  }), null);
});

test('cross-Workspace user is rejected', () => {
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    authenticatedUid: 'owner-b',
    requestedUserId: 'owner-b',
    membership: null
  }), 'membership-missing');
});

test('malformed Store and product identity are distinguished from role denial', () => {
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    store: { id: 'workspace-a', workspaceId: 'workspace-b' }
  }), 'store-identity-mismatch');
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    product: { storeId: 'workspace-b', workspaceId: 'workspace-a' }
  }), 'product-identity-mismatch');
  assert.match(getStoreAuthorizationMessage('store-identity-mismatch'), /stale Workspace information/);
});

test('inactive and insufficient memberships have distinct outcomes', () => {
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    authenticatedUid: 'manager-a',
    requestedUserId: 'manager-a',
    membership: { role: 'Manager', status: 'Disabled' }
  }), 'membership-inactive');
  assert.equal(getStoreAuthorizationIssue({
    ...baseContext,
    authenticatedUid: 'chef-a',
    requestedUserId: 'chef-a',
    membership: { role: 'Chef', status: 'Active' }
  }), 'role-denied');
});
