import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FREE_TRIAL_DAYS,
  resolveWorkspaceSubscription,
  SUBSCRIPTION_PLANS
} from './subscriptionFoundation.js';

const day = 24 * 60 * 60 * 1000;

test('subscription foundation exposes exactly the four milestone tiers and feature flags', () => {
  assert.deepEqual(Object.keys(SUBSCRIPTION_PLANS), ['free', 'starter', 'professional', 'business']);
  for (const definition of Object.values(SUBSCRIPTION_PLANS)) {
    assert.equal(typeof definition.features.recipes, 'boolean');
    assert.equal(typeof definition.features.teamMembers, 'boolean');
    assert.equal(typeof definition.features.reports, 'boolean');
    assert.equal(typeof definition.features.inventory, 'boolean');
  }
});

test('subscription foundation has no payment-provider integration', () => {
  const source = readFileSync(new URL('./subscriptionFoundation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /stripe|checkout|paymentintent|webhook/i);
});

test('a new workspace receives a 14-day Professional trial', () => {
  const createdAt = new Date('2026-08-01T00:00:00.000Z');
  const subscription = resolveWorkspaceSubscription({
    data: {},
    createTime: createdAt,
    now: new Date(createdAt.getTime() + day)
  });

  assert.equal(FREE_TRIAL_DAYS, 14);
  assert.equal(subscription.subscriptionPlan, 'professional');
  assert.equal(subscription.subscriptionStatus, 'trialing');
  assert.equal(subscription.trialEndsAt.toDate().toISOString(), '2026-08-15T00:00:00.000Z');
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
  assert.match(rules, /subscriptionPlan in \['professional', 'business'\]/);
});
