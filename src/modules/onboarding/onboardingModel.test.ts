import assert from 'node:assert/strict';
import test from 'node:test';
import { getOnboardingDestination, normalizeOnboarding } from './onboardingModel';

test('missing onboarding belongs to a legacy user and does not interrupt existing accounts', () => {
  assert.deepEqual(normalizeOnboarding(undefined), {
    version: 1,
    status: 'legacy',
    goals: [],
    createdAt: '',
    updatedAt: '',
    completedAt: null
  });
});

test('onboarding preserves only valid, unique multi-select goals', () => {
  const onboarding = normalizeOnboarding({
    status: 'completed',
    goals: ['recipes', 'chef_profile', 'recipes', 'invalid', 'sell_food']
  });
  assert.deepEqual(onboarding.goals, ['recipes', 'chef_profile', 'sell_food']);
});

test('each intent combination has the expected first destination', () => {
  assert.equal(getOnboardingDestination(['chef_profile']), 'portfolio');
  assert.equal(getOnboardingDestination(['recipes']), 'home');
  assert.equal(getOnboardingDestination(['sell_food']), 'store');
  assert.equal(getOnboardingDestination(['chef_profile', 'recipes']), 'portfolio');
  assert.equal(getOnboardingDestination(['chef_profile', 'recipes', 'sell_food']), 'store');
  assert.equal(getOnboardingDestination([]), 'home');
});
