import assert from 'node:assert/strict';

export const SUPPORTED_MARKETS = Object.freeze({
  MY: 'MYR',
  SG: 'SGD'
});

export const AUTHORIZED_MIGRATION_MARKET = Object.freeze({
  country: 'MY',
  currency: 'MYR'
});

const readStringValue = value => value?.stringValue || '';
const stringValue = value => ({ stringValue: value });

export const assertSupportedMarket = ({ country, currency }) => {
  assert.ok(Object.hasOwn(SUPPORTED_MARKETS, country), `Unsupported country ${country || '<missing>'}.`);
  assert.equal(
    currency,
    SUPPORTED_MARKETS[country],
    `Currency ${currency || '<missing>'} does not match country ${country}.`
  );
};

export const assertAuthorizedSourceStoreMarket = store => {
  const country = readStringValue(store?.fields?.country);
  const currency = readStringValue(store?.fields?.currency);
  assertSupportedMarket({ country, currency });
  assert.deepEqual(
    { country, currency },
    AUTHORIZED_MIGRATION_MARKET,
    'Authorized Beta Grab & Go store must remain MY/MYR for this migration.'
  );
};

export const buildWorkspaceCountryPatch = workspace => {
  assert.ok(workspace, 'Production workspace is missing.');
  assert.ok(workspace.updateTime, 'Production workspace updateTime is required.');

  const countryField = workspace.fields?.country;
  if (countryField !== undefined) {
    assert.equal(
      readStringValue(countryField),
      AUTHORIZED_MIGRATION_MARKET.country,
      `Production workspace country must be ${AUTHORIZED_MIGRATION_MARKET.country} for this authorized Malaysia business migration.`
    );
    return null;
  }

  return {
    write: {
      update: {
        name: workspace.name,
        fields: {
          country: stringValue(AUTHORIZED_MIGRATION_MARKET.country)
        },
        updateMask: { fieldPaths: ['country'] }
      },
      currentDocument: { updateTime: workspace.updateTime }
    },
    original: workspace
  };
};
