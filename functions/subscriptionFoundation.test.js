import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FREE_TRIAL_DAYS,
  hasActiveBusinessEntitlement,
  requireWorkspaceFeature,
  resolveWorkspaceSubscription,
  SUBSCRIPTION_PLANS,
  UNLIMITED
} from './subscriptionFoundation.js';

const day = 24 * 60 * 60 * 1000;

test('subscription foundation exposes public tiers plus the internal-only unlimited tier', () => {
  assert.deepEqual(Object.keys(SUBSCRIPTION_PLANS), ['free', 'starter', 'professional', 'business', 'internal_unlimited']);
  for (const definition of Object.values(SUBSCRIPTION_PLANS)) {
    assert.equal(typeof definition.features.recipes, 'boolean');
    assert.equal(typeof definition.features.teamMembers, 'boolean');
    assert.equal(typeof definition.features.reports, 'boolean');
    assert.equal(typeof definition.features.inventory, 'boolean');
  }
});

test('Internal Unlimited is active, non-expiring, non-purchasable, and removes every current plan limit', () => {
  const subscription = resolveWorkspaceSubscription({
    data: {
      subscriptionPlan: 'internal_unlimited',
      subscriptionStatus: 'cancelled',
      trialStartedAt: '2026-08-01T00:00:00.000Z',
      trialEndsAt: '2026-08-15T00:00:00.000Z'
    },
    now: new Date('2026-08-25T00:00:00.000Z')
  });

  assert.equal(subscription.subscriptionPlan, 'internal_unlimited');
  assert.equal(subscription.subscriptionStatus, 'active');
  assert.equal(subscription.trialStartedAt, null);
  assert.equal(subscription.trialEndsAt, null);
  assert.equal(SUBSCRIPTION_PLANS.internal_unlimited.availability, 'internal');
  assert.equal(SUBSCRIPTION_PLANS.internal_unlimited.requiresPayment, false);
  assert.equal(SUBSCRIPTION_PLANS.internal_unlimited.expires, false);
  assert.ok(Object.values(subscription.features).every(Boolean));
  assert.ok(Object.values(subscription.limits).every(limit => limit === UNLIMITED));
});

test('active Workspace members inherit its plan independently of role and switching Workspace changes entitlement', async () => {
  const roles = ['Manager', 'Head Chef', 'Sous Chef', 'Chef', 'Purchasing', 'Finance', 'Viewer'];
  const workspaces = {
    unlimited: { ownerId: 'owner', subscriptionPlan: 'internal_unlimited', subscriptionStatus: 'active', trialStartedAt: null, trialEndsAt: null },
    free: { ownerId: 'other-owner', subscriptionPlan: 'free', subscriptionStatus: 'active' }
  };
  let role = 'Viewer';
  const db = {
    collection: collectionName => ({
      doc: id => ({
        get: async () => collectionName === 'workspaces'
          ? { exists: Boolean(workspaces[id]), data: () => workspaces[id], ref: { set: async () => assert.fail('unexpected persistence') } }
          : { exists: true, data: () => ({ userId: 'member', workspaceId: id.split('_member')[0], status: 'Active', role }) }
      })
    })
  };

  for (const memberRole of roles) {
    role = memberRole;
    const entitlement = await requireWorkspaceFeature({ db, uid: 'member', workspaceId: 'unlimited', feature: 'aiRequests' });
    assert.equal(entitlement.role, memberRole);
    assert.equal(entitlement.plan, 'internal_unlimited');
    assert.equal(entitlement.limits.aiRequests, UNLIMITED);
  }

  role = 'Finance';
  await assert.rejects(
    requireWorkspaceFeature({ db, uid: 'member', workspaceId: 'free', feature: 'aiRequests' }),
    error => error?.code === 'permission-denied' && error?.details?.reason === 'business-entitlement-required'
  );
});

test('Business entitlement matrix is fail closed and time bounded', () => {
  const now = new Date('2026-08-30T00:00:00.000Z');
  assert.equal(hasActiveBusinessEntitlement({ subscriptionPlan: 'starter', subscriptionStatus: 'active' }, now), true);
  assert.equal(hasActiveBusinessEntitlement({ subscriptionPlan: 'professional', subscriptionStatus: 'trialing', trialEndsAt: '2026-08-31T00:00:00.000Z' }, now), true);
  assert.equal(hasActiveBusinessEntitlement({ subscriptionPlan: 'professional', subscriptionStatus: 'trialing', trialEndsAt: '2026-08-29T00:00:00.000Z' }, now), false);
  assert.equal(hasActiveBusinessEntitlement({ subscriptionPlan: 'free', subscriptionStatus: 'active' }, now), false);
  assert.equal(hasActiveBusinessEntitlement({ subscriptionPlan: 'professional', subscriptionStatus: 'suspended' }, now), false);
  assert.equal(hasActiveBusinessEntitlement({ subscriptionPlan: 'professional', subscriptionStatus: 'trialing', trialEndsAt: 'not-a-date' }, now), false);
  assert.equal(hasActiveBusinessEntitlement({}, now), false);
  assert.equal(hasActiveBusinessEntitlement(null, now), false);
});

test('subscription foundation has no payment-provider integration', () => {
  const source = readFileSync(new URL('./subscriptionFoundation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /stripe|checkout|paymentintent|webhook/i);
});

test('a new workspace never receives a Business trial implicitly', () => {
  const createdAt = new Date('2026-08-01T00:00:00.000Z');
  const subscription = resolveWorkspaceSubscription({
    data: {},
    createTime: createdAt,
    now: new Date(createdAt.getTime() + day)
  });

  assert.equal(FREE_TRIAL_DAYS, 14);
  assert.equal(subscription.subscriptionPlan, 'free');
  assert.equal(subscription.subscriptionStatus, 'suspended');
  assert.equal(subscription.trialStartedAt, null);
  assert.equal(subscription.trialEndsAt, null);
});

test('missing subscription data never receives an implicit Business trial during authorization', () => {
  const subscription = resolveWorkspaceSubscription({
    data: {},
    createTime: new Date('2026-08-29T00:00:00.000Z'),
    now: new Date('2026-08-30T00:00:00.000Z')
  });
  assert.equal(subscription.subscriptionPlan, 'free');
  assert.equal(subscription.subscriptionStatus, 'suspended');
  assert.equal(hasActiveBusinessEntitlement(subscription), false);
});

test('an expired trial downgrades to Free and never extends a client-supplied trial date', () => {
  const createdAt = new Date('2026-08-01T00:00:00.000Z');
  const subscription = resolveWorkspaceSubscription({
    data: {
      subscriptionPlan: 'professional',
      subscriptionStatus: 'trialing',
      trialEndsAt: '2099-01-01T00:00:00.000Z'
    },
    createTime: createdAt,
    now: new Date(createdAt.getTime() + 15 * day)
  });

  assert.equal(subscription.subscriptionPlan, 'free');
  assert.equal(subscription.subscriptionStatus, 'active');
  assert.equal(subscription.trialEndsAt.toDate().toISOString(), '2026-08-15T00:00:00.000Z');
});

test('trial expiry updates entitlement fields only and does not delete workspace data', () => {
  const source = readFileSync(new URL('./subscriptionFoundation.js', import.meta.url), 'utf8');
  const expiryWrite = source.slice(source.indexOf('if (needsPersistence'), source.indexOf('return subscription;'));
  assert.match(expiryWrite, /subscriptionPlan/);
  assert.match(expiryWrite, /subscriptionStatus/);
  assert.doesNotMatch(expiryWrite, /\.delete\(|recursiveDelete|members|recipes|ingredients|invoices/);
});

test('Firestore rules keep subscription fields server-owned and enforce trial expiry', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /affectedKeys\(\)\.hasNone\(\['subscriptionPlan', 'subscriptionStatus', 'trialStartedAt', 'trialEndsAt', 'subscriptionUpdatedAt'\]\)/);
  assert.match(rules, /request\.time < get\([\s\S]*trialEndsAt/);
  assert.match(rules, /subscriptionPlan in \['starter', 'professional', 'business', 'internal_unlimited'\]/);
});
