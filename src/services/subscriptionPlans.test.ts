import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPlanDefinition,
  getPlanLimits,
  getPublicPlanDefinitions,
  normalizeSubscriptionPlan,
  UNLIMITED_PLAN_LIMIT
} from './subscriptionPlans';

test('Internal Unlimited is a recognized internal Workspace plan and is absent from public plans', () => {
  assert.equal(normalizeSubscriptionPlan('internal_unlimited'), 'internal_unlimited');
  assert.equal(getPlanDefinition('internal_unlimited').name, 'Internal Unlimited');
  assert.equal(getPlanDefinition('internal_unlimited').availability, 'internal');
  assert.equal(getPlanDefinition('internal_unlimited').requiresPayment, false);
  assert.equal(getPlanDefinition('internal_unlimited').expires, false);
  assert.ok(getPublicPlanDefinitions().every(plan => plan.availability === 'public'));
  assert.ok(getPublicPlanDefinitions().every(plan => plan.id !== 'internal_unlimited'));
});

test('Internal Unlimited removes every numeric plan limit and enables every current plan feature', () => {
  const definition = getPlanDefinition('internal_unlimited');
  const limits = getPlanLimits('internal_unlimited');

  assert.ok(Object.values(definition.features).every(Boolean));
  assert.ok(Object.values(definition.limits).every(limit => limit === UNLIMITED_PLAN_LIMIT));
  for (const [name, value] of Object.entries(limits)) {
    if (name.startsWith('can')) assert.equal(value, true, name);
    else assert.equal(value, UNLIMITED_PLAN_LIMIT, name);
  }
});
