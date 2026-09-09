import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceSubscription } from './subscriptionService';
import { hasActiveBusinessEntitlement } from './businessEntitlement';

const subscription = (
  overrides: Partial<Pick<WorkspaceSubscription, 'subscriptionPlan' | 'subscriptionStatus' | 'trialEndsAt'>>
): Pick<WorkspaceSubscription, 'subscriptionPlan' | 'subscriptionStatus' | 'trialEndsAt'> => ({
  subscriptionPlan: 'professional',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  ...overrides
});

test('client Business entitlement matrix matches the server fail-closed boundary', () => {
  const now = new Date('2026-08-30T00:00:00.000Z');
  assert.equal(hasActiveBusinessEntitlement(subscription({ subscriptionPlan: 'starter' }), now), true);
  assert.equal(hasActiveBusinessEntitlement(subscription({ subscriptionStatus: 'trialing', trialEndsAt: '2026-08-31T00:00:00.000Z' }), now), true);
  assert.equal(hasActiveBusinessEntitlement(subscription({ subscriptionStatus: 'trialing', trialEndsAt: '2026-08-29T00:00:00.000Z' }), now), false);
  assert.equal(hasActiveBusinessEntitlement(subscription({ subscriptionPlan: 'free' }), now), false);
  assert.equal(hasActiveBusinessEntitlement(subscription({ subscriptionStatus: 'suspended' }), now), false);
  assert.equal(hasActiveBusinessEntitlement(subscription({ subscriptionStatus: 'trialing', trialEndsAt: 'malformed' }), now), false);
  assert.equal(hasActiveBusinessEntitlement(null, now), false);
});
