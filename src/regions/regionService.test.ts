import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REGION_CODE,
  LEGACY_WORKSPACE_REGION_CODE,
  REGION_CONFIGURATIONS,
  formatRegionCurrency,
  getWorkspaceRegionConfiguration,
  normalizeRegionCode
} from './index';

test('Malaysia configuration exposes the approved currency and payment methods', () => {
  const malaysia = REGION_CONFIGURATIONS.MY;

  assert.equal(malaysia.locale, 'en-MY');
  assert.equal(malaysia.currency, 'MYR');
  assert.deepEqual(
    malaysia.paymentMethods.map(method => method.name),
    ["Touch 'n Go", 'GrabPay MY', 'FPX', 'Card']
  );
});

test('Singapore configuration exposes the approved currency and payment methods', () => {
  const singapore = REGION_CONFIGURATIONS.SG;

  assert.equal(singapore.locale, 'en-SG');
  assert.equal(singapore.currency, 'SGD');
  assert.deepEqual(
    singapore.paymentMethods.map(method => method.name),
    ['PayNow', 'GrabPay SG', 'Card']
  );
});

test('workspace switching resolves configuration only from the active workspace country', () => {
  const malaysia = getWorkspaceRegionConfiguration({ country: 'MY' });
  const singapore = getWorkspaceRegionConfiguration({ country: 'SG' });

  assert.equal(malaysia.country, 'MY');
  assert.equal(malaysia.currency, 'MYR');
  assert.equal(singapore.country, 'SG');
  assert.equal(singapore.currency, 'SGD');
});

test('new workspaces default to Malaysia while legacy workspaces preserve Singapore behavior', () => {
  assert.equal(DEFAULT_REGION_CODE, 'MY');
  assert.equal(LEGACY_WORKSPACE_REGION_CODE, 'SG');
  assert.equal(normalizeRegionCode(undefined), 'MY');
  assert.equal(normalizeRegionCode(''), 'MY');
  assert.equal(normalizeRegionCode('AU'), 'MY');
  assert.equal(normalizeRegionCode('sg'), 'SG');
  assert.equal(getWorkspaceRegionConfiguration({}).country, 'SG');
  assert.equal(getWorkspaceRegionConfiguration({ country: 'AU' }).country, 'SG');
});

test('every region exposes provider catalogs without enabling integrations', () => {
  Object.values(REGION_CONFIGURATIONS).forEach(configuration => {
    assert.ok(Array.isArray(configuration.deliveryProviders));
    assert.ok(Array.isArray(configuration.supplierProviders));
  });
});

test('currency formatting takes an explicit region currency', () => {
  assert.equal(formatRegionCurrency(12.5, 'MYR'), 'MYR 12.50');
  assert.equal(formatRegionCurrency(12.5, 'SGD'), 'SGD 12.50');
});
