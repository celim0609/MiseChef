import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrderItems } from './storePaymentsCore.js';

const products = [
  { id: 'nasi', name: 'Nasi Lemak', photoUrl: 'nasi.jpg', price: 5.9, estimatedCost: 1.83, available: true, optionGroupIds: [] },
  { id: 'kopi', name: 'Kopi O', photoUrl: 'kopi.jpg', price: 3.5, estimatedCost: 1.05, available: true, optionGroupIds: [] },
  { id: 'ice', name: 'Kopi Ice', photoUrl: 'ice.jpg', price: 4, available: true, optionGroupIds: [] }
];
const set = {
  id: 'breakfast', name: 'Breakfast Set', photoUrl: 'set.jpg', category: 'Breakfast', price: 7.9, available: true,
  groups: [
    { id: 'main', name: 'Main', required: true, selectionCount: 1, sortOrder: 0, options: [{ productId: 'nasi', priceAdjustment: 0 }] },
    { id: 'drink', name: 'Drink', required: true, selectionCount: 1, sortOrder: 1, options: [{ productId: 'kopi', priceAdjustment: 0 }, { productId: 'ice', priceAdjustment: 0.5 }] }
  ]
};

test('trusted checkout ignores client prices and snapshots current set and product pricing', () => {
  const items = buildOrderItems([{
    productId: 'client-lie', setId: 'breakfast', quantity: 2, selectedOptions: [],
    selectedSetItems: [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'ice' }],
    price: 0.01, total: 0.01
  }], products, [], [set]);
  assert.equal(items[0].itemType, 'set');
  assert.equal(items[0].unitPrice, 8.4);
  assert.equal(items[0].lineTotal, 16.8);
  assert.equal(items[0].setSnapshot.regularValue, 9.9);
  assert.deepEqual(items[0].setSnapshot.selectedGroups.map(item => item.productName), ['Nasi Lemak', 'Kopi Ice']);
});

test('trusted checkout rejects missing, foreign, duplicate and unavailable set selections', () => {
  const base = { productId: 'breakfast', setId: 'breakfast', quantity: 1, selectedOptions: [] };
  assert.throws(() => buildOrderItems([{ ...base, selectedSetItems: [{ groupId: 'main', productId: 'nasi' }] }], products, [], [set]), /Choose 1 Drink/);
  assert.throws(() => buildOrderItems([{ ...base, selectedSetItems: [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'foreign' }] }], products, [], [set]), /available Drink/);
  assert.throws(() => buildOrderItems([{ ...base, selectedSetItems: [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'kopi' }, { groupId: 'other', productId: 'kopi' }] }], products, [], [set]), /selection.*no longer available/i);
  assert.throws(() => buildOrderItems([{ ...base, selectedSetItems: [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'kopi' }] }], products.map(product => product.id === 'kopi' ? { ...product, available: false } : product), [], [set]), /available Drink/);
});

test('standalone trusted checkout stays unchanged when no set id is supplied', () => {
  const items = buildOrderItems([{ productId: 'kopi', quantity: 2, selectedOptions: [] }], products, [], [set]);
  assert.equal(items[0].itemType, 'product');
  assert.equal(items[0].unitPrice, 3.5);
  assert.equal(items[0].lineTotal, 7);
  assert.equal(items[0].setSnapshot, undefined);
});

