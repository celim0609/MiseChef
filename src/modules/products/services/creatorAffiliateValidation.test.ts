import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCreatorCode,
  requireCreatorLinkVerification
} from './creatorAffiliateValidation';

test('accepts only stable non-personal creator codes', () => {
  assert.equal(normalizeCreatorCode(' mc002 '), 'MC002');
  assert.equal(normalizeCreatorCode('MC000123'), 'MC000123');
  assert.equal(normalizeCreatorCode('MC2'), '');
  assert.equal(normalizeCreatorCode('chef@example.com'), '');
  assert.equal(normalizeCreatorCode('MC002-CE-LIM'), '');
});

test('requires both manual Shopee verification confirmations before activation', () => {
  assert.throws(
    () => requireCreatorLinkVerification(true, false),
    /Confirm both the Shopee Sub_id and Click Report/
  );
  assert.throws(
    () => requireCreatorLinkVerification(false, true),
    /Confirm both the Shopee Sub_id and Click Report/
  );
  assert.doesNotThrow(() => requireCreatorLinkVerification(true, true));
});
