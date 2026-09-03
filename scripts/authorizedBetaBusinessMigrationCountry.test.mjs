import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTHORIZED_MIGRATION_MARKET,
  SUPPORTED_MARKETS,
  assertAuthorizedSourceStoreMarket,
  assertSupportedMarket,
  buildWorkspaceCountryPatch
} from './authorizedBetaBusinessMigrationCountry.mjs';

const workspace = country => ({
  name: 'projects/misechef-fa4bf/databases/(default)/documents/workspaces/stShXwdbIzOh14ItTtQ4hRB5oBz1',
  updateTime: '2026-09-03T00:00:00.000000Z',
  fields: {
    ownerId: { stringValue: 'stShXwdbIzOh14ItTtQ4hRB5oBz1' },
    name: { stringValue: 'MiseChef' },
    ...(country === undefined ? {} : { country: { stringValue: country } })
  }
});

const store = (country, currency) => ({
  fields: {
    country: { stringValue: country },
    currency: { stringValue: currency }
  }
});

test('platform market guard supports Malaysia and Singapore pairs', () => {
  assert.deepEqual(SUPPORTED_MARKETS, { MY: 'MYR', SG: 'SGD' });
  assert.doesNotThrow(() => assertSupportedMarket({ country: 'MY', currency: 'MYR' }));
  assert.doesNotThrow(() => assertSupportedMarket({ country: 'SG', currency: 'SGD' }));
  assert.throws(() => assertSupportedMarket({ country: 'MY', currency: 'SGD' }));
  assert.throws(() => assertSupportedMarket({ country: 'SG', currency: 'MYR' }));
});

test('this one-time Grab & Go migration is specifically MY/MYR', () => {
  assert.deepEqual(AUTHORIZED_MIGRATION_MARKET, { country: 'MY', currency: 'MYR' });
  assert.doesNotThrow(() => assertAuthorizedSourceStoreMarket(store('MY', 'MYR')));
  assert.throws(() => assertAuthorizedSourceStoreMarket(store('SG', 'SGD')));
});

test('missing workspace country plans a masked MY-only update with concurrency precondition', () => {
  const original = workspace();
  const patch = buildWorkspaceCountryPatch(original);
  assert.equal(patch.write.update.name, original.name);
  assert.deepEqual(patch.write.update.fields, { country: { stringValue: 'MY' } });
  assert.deepEqual(patch.write.updateMask, { fieldPaths: ['country'] });
  assert.equal(patch.write.update.updateMask, undefined);
  assert.deepEqual(patch.write.currentDocument, { updateTime: original.updateTime });
  assert.strictEqual(patch.original, original);
});

test('existing MY workspace country is preserved without a write', () => {
  assert.equal(buildWorkspaceCountryPatch(workspace('MY')), null);
});

test('existing non-MY workspace country fails closed for this Malaysia migration', () => {
  assert.throws(() => buildWorkspaceCountryPatch(workspace('SG')));
});

test('workspace patch requires updateTime so apply cannot race an unversioned workspace', () => {
  const value = workspace();
  delete value.updateTime;
  assert.throws(() => buildWorkspaceCountryPatch(value));
});
