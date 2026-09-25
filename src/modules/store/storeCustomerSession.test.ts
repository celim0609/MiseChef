import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginStoreCustomerSession,
  clearStoreCustomerSession,
  getClaimEnvelope,
  hasStoreClaim,
  setClaimEnvelope
} from './storeCustomerSession';

const withSessionStorage = (run: () => void) => {
  const previous = (globalThis as { window?: unknown }).window;
  const values = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } };
  try { run(); } finally { (globalThis as { window?: unknown }).window = previous; }
};

test('Store claim session retains the exact payment credential across auth cancellation and clears only after success', () => {
  withSessionStorage(() => {
    assert.equal(beginStoreCustomerSession('/store/claim-store'), true);
    assert.equal(setClaimEnvelope({ slug: 'claim-store', provider: 'stripe', paymentSessionId: 'pi_123', checkoutAccessToken: 'exact-current-token' }), true);
    // A popup cancellation does not call clearStoreCustomerSession.
    assert.equal(hasStoreClaim(), true);
    assert.deepEqual(getClaimEnvelope(), { slug: 'claim-store', provider: 'stripe', paymentSessionId: 'pi_123', checkoutAccessToken: 'exact-current-token' });
    clearStoreCustomerSession();
    assert.equal(hasStoreClaim(), false);
  });
});

test('Store claim session rejects non-public or cross-origin return targets', () => {
  withSessionStorage(() => {
    assert.equal(beginStoreCustomerSession('https://attacker.example/store/claim-store'), false);
    assert.equal(beginStoreCustomerSession('/app'), false);
    assert.equal(hasStoreClaim(), false);
  });
});
