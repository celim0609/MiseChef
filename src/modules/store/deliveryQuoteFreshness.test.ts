import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteHasSufficientLifetime, scheduleDeliveryQuoteRefresh } from './deliveryQuoteFreshness';

test('fake timer refreshes at the freshness threshold and commits a replacement quote id', () => {
  const now = Date.parse('2026-09-12T02:00:00.000Z');
  let callback: (() => void) | null = null; let delay = -1; let quoteId = 'old-quote'; let requests = 0;
  scheduleDeliveryQuoteRefresh({ expiresAt: '2026-09-12T02:00:10.000Z', minimumValidityMs: 5_000, now, schedule: (next, nextDelay) => { callback = next; delay = nextDelay; return 1 as unknown as ReturnType<typeof window.setTimeout>; }, onRefresh: () => { requests += 1; quoteId = 'new-quote'; } });
  assert.equal(delay, 5_000); callback?.();
  assert.equal(requests, 1); assert.equal(quoteId, 'new-quote');
  assert.equal(quoteHasSufficientLifetime({ expiresAt: '2026-09-12T02:00:10.000Z', minimumValidityMs: 5_000, now }), true);
});
