import assert from 'node:assert/strict';
import test from 'node:test';
import { customerDeliveryFeeChanged, quoteHasSufficientLifetime } from './deliveryQuoteFreshness';

test('quote lifetime boundary is used only when the customer begins payment', () => {
  const now = Date.parse('2026-09-12T02:00:00.000Z');
  assert.equal(quoteHasSufficientLifetime({ expiresAt: '2026-09-12T02:00:10.000Z', minimumValidityMs: 5_000, now }), true);
  assert.equal(quoteHasSufficientLifetime({ expiresAt: '2026-09-12T02:00:05.000Z', minimumValidityMs: 5_000, now }), false);
});

test('only a customer-facing delivery fee change requires renewed confirmation', () => {
  assert.equal(customerDeliveryFeeChanged(4, 4), false);
  assert.equal(customerDeliveryFeeChanged(4, 4.004), false);
  assert.equal(customerDeliveryFeeChanged(4, 4.01), true);
});
