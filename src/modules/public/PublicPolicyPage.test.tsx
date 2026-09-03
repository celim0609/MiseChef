import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublicRoute } from './publicRoutes';

test('compliance routes are public without authentication', () => {
  assert.deepEqual(resolvePublicRoute('/terms'), { page: 'policy', policy: 'terms' });
  assert.deepEqual(resolvePublicRoute('/privacy'), { page: 'policy', policy: 'privacy' });
  assert.deepEqual(resolvePublicRoute('/refund-cancellation'), { page: 'policy', policy: 'refund-cancellation' });
  assert.deepEqual(resolvePublicRoute('/payment-policy'), { page: 'policy', policy: 'payment-policy' });
  assert.deepEqual(resolvePublicRoute('/pickup-policy'), { page: 'policy', policy: 'pickup-policy' });
  assert.deepEqual(resolvePublicRoute('/contact-us'), { page: 'policy', policy: 'contact' });
});
