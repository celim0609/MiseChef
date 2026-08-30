import assert from 'node:assert/strict';
import test from 'node:test';
import { getStorePermissions } from './permissions';

test('Store capabilities remain role-based inside an entitled Workspace', () => {
  assert.deepEqual(getStorePermissions('Owner'), {
    viewStore: true,
    viewOrders: true,
    processOrders: true,
    manageProducts: true,
    manageAvailability: true,
    manageStoreSettings: true,
    managePaymentSettings: true,
    refundFinancialActions: true,
    manageHostGroupOrders: true
  });
  assert.equal(getStorePermissions('Head Chef').manageProducts, true);
  assert.equal(getStorePermissions('Head Chef').manageStoreSettings, false);
  assert.equal(getStorePermissions('Sous Chef').processOrders, true);
  assert.equal(getStorePermissions('Finance').viewOrders, true);
  assert.equal(getStorePermissions('Finance').processOrders, false);
  assert.equal(getStorePermissions('Viewer').viewStore, true);
  assert.equal(getStorePermissions('Viewer').viewOrders, false);
});
