import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicExperiencePath, resolvePublicPolicyRoute } from './publicRoutes';

test('compliance routes are public without authentication', () => {
  assert.deepEqual(resolvePublicPolicyRoute('/terms'), { page: 'policy', policy: 'terms' });
  assert.deepEqual(resolvePublicPolicyRoute('/privacy'), { page: 'policy', policy: 'privacy' });
  assert.deepEqual(resolvePublicPolicyRoute('/refund-cancellation'), { page: 'policy', policy: 'refund-cancellation' });
  assert.deepEqual(resolvePublicPolicyRoute('/payment-policy'), { page: 'policy', policy: 'payment-policy' });
  assert.deepEqual(resolvePublicPolicyRoute('/pickup-policy'), { page: 'policy', policy: 'pickup-policy' });
  assert.deepEqual(resolvePublicPolicyRoute('/contact-us'), { page: 'policy', policy: 'contact' });

  for (const pathname of ['/terms', '/privacy', '/refund-cancellation', '/payment-policy', '/pickup-policy', '/contact-us']) {
    assert.equal(isPublicExperiencePath(pathname), true);
  }
});
