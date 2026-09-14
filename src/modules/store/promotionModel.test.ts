import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPromotionDraft, promotionStatus, promotionSummary, validatePromotionDraft } from './promotionModel';

test('merchant promotion form validates each V1 type and schedule', () => {
  const base = { ...emptyPromotionDraft(), name: 'Muffin deal', eligibleProductIds: ['muffin'], startsAt: new Date('2026-09-14T00:00:00Z') };
  assert.equal(validatePromotionDraft(base), '');
  assert.match(validatePromotionDraft({ ...base, type: 'percentage', percentageOff: 101 }), /between 1 and 100/);
  assert.match(validatePromotionDraft({ ...base, type: 'fixed_amount', fixedAmountOff: 0 }), /greater than zero/);
  assert.match(validatePromotionDraft({ ...base, type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 0 }), /whole numbers/);
  assert.match(validatePromotionDraft({ ...base, endsAt: new Date('2026-09-13T00:00:00Z') }), /after the start/);
});
test('merchant promotion labels and statuses are customer-readable', () => {
  assert.equal(promotionSummary({ type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1 }), 'Buy 2, Get 1 Free');
  const now = new Date('2026-09-14T00:00:00Z');
  assert.equal(promotionStatus({ active: true, startsAt: new Date('2026-09-15T00:00:00Z'), endsAt: null }, now), 'Scheduled');
  assert.equal(promotionStatus({ active: true, startsAt: now, endsAt: new Date('2026-09-13T00:00:00Z') }, now), 'Expired');
  assert.equal(promotionStatus({ active: false, startsAt: now, endsAt: null }, now), 'Inactive');
});
