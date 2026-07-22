import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApprovedAffiliateUrl } from './approvedProductValidation';

test('accepts only exact HTTPS s.shopee.sg affiliate destinations', () => {
  assert.equal(normalizeApprovedAffiliateUrl(' https://s.shopee.sg/111Wt2DdGq '), 'https://s.shopee.sg/111Wt2DdGq');
  assert.equal(normalizeApprovedAffiliateUrl('http://s.shopee.sg/item'), '');
  assert.equal(normalizeApprovedAffiliateUrl('https://offers.s.shopee.sg/item'), '');
  assert.equal(normalizeApprovedAffiliateUrl('https://s.shopee.sg.evil.test/item'), '');
  assert.equal(normalizeApprovedAffiliateUrl('https://not-s.shopee.sg/item'), '');
  assert.equal(normalizeApprovedAffiliateUrl('https://user:pass@s.shopee.sg/item'), '');
});
