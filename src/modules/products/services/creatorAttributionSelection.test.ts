import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNextAffiliateCreatorCode } from './creatorAttributionSelection';

test('establishes attribution only from the authenticated creator profile result', () => {
  assert.equal(resolveNextAffiliateCreatorCode({
    currentCode: '',
    availableCode: 'MC002',
    currentProductIds: [],
    nextProductIds: ['bread_flour']
  }), 'MC002');
  assert.equal(resolveNextAffiliateCreatorCode({
    currentCode: '',
    availableCode: '',
    currentProductIds: [],
    nextProductIds: ['bread_flour']
  }), '');
});

test('preserves attribution for removals and never reassigns it to another editor', () => {
  assert.equal(resolveNextAffiliateCreatorCode({
    currentCode: 'MC002',
    availableCode: '',
    currentProductIds: ['bread_flour', 'yeast'],
    nextProductIds: ['bread_flour']
  }), 'MC002');
  assert.equal(resolveNextAffiliateCreatorCode({
    currentCode: 'MC002',
    availableCode: 'MC003',
    currentProductIds: ['bread_flour'],
    nextProductIds: ['bread_flour', 'yeast']
  }), 'MC002');
});
