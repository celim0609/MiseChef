import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoreOrderItems } from './storeModel';
import {
  calculateStoreSetAnalysis,
  getStoreSetUnavailableReason,
  normalizeStoreSet,
  validateStoreSet,
  validateStoreSetSelections
} from './storeSetModel';
import type { StoreProduct, StoreSet } from './types';

const now = '2026-08-26T00:00:00.000Z';
const products: StoreProduct[] = [{
  id: 'nasi', storeId: 'store', workspaceId: 'store', photoUrl: 'nasi.jpg', name: 'Nasi Lemak', description: '',
  price: 5.9, estimatedCost: 1.83, available: true, optionGroupIds: [], createdBy: 'owner', createdAt: now, updatedAt: now
}, {
  id: 'kopi', storeId: 'store', workspaceId: 'store', photoUrl: 'kopi.jpg', name: 'Kopi O 8oz', description: '',
  price: 3.5, estimatedCost: 1.05, available: true, optionGroupIds: [], createdBy: 'owner', createdAt: now, updatedAt: now
}, {
  id: 'kopi-ice', storeId: 'store', workspaceId: 'store', photoUrl: 'ice.jpg', name: 'Kopi Ice', description: '',
  price: 4, estimatedCost: 1.2, available: true, optionGroupIds: [], createdBy: 'owner', createdAt: now, updatedAt: now
}];

const breakfastSet: StoreSet = normalizeStoreSet('breakfast', {
  storeId: 'store', workspaceId: 'store', name: 'Breakfast Set', description: '', photoUrl: 'set.jpg', category: 'Breakfast',
  price: 7.9, available: true, sortOrder: 0, createdBy: 'owner', createdAt: now, updatedAt: now,
  groups: [{ id: 'main', name: 'Main', required: true, selectionCount: 1, sortOrder: 0, options: [{ productId: 'nasi', priceAdjustment: 0, sortOrder: 0 }] },
    { id: 'drink', name: 'Drink', required: true, selectionCount: 1, sortOrder: 1, options: [{ productId: 'kopi', priceAdjustment: 0, sortOrder: 0 }, { productId: 'kopi-ice', priceAdjustment: 0.5, sortOrder: 1 }] }]
});

test('owner can define a generic set that references existing product ids', () => {
  assert.equal(validateStoreSet({
    name: breakfastSet.name, description: '', photoUrl: breakfastSet.photoUrl, category: breakfastSet.category,
    price: breakfastSet.price, available: true, sortOrder: 0, groups: breakfastSet.groups
  }), '');
  assert.deepEqual(breakfastSet.groups.flatMap(group => group.options.map(option => option.productId)), ['nasi', 'kopi', 'kopi-ice']);
});

test('included selections, regular value, saving, cost, profit and margin calculate automatically', () => {
  const selections = [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'kopi' }];
  assert.equal(validateStoreSetSelections(breakfastSet, products, selections), '');
  const analysis = calculateStoreSetAnalysis(breakfastSet, products, selections);
  assert.deepEqual(analysis, {
    upgradeTotal: 0,
    sellingPrice: 7.9,
    regularValue: 9.4,
    customerSaving: 1.5,
    estimatedCost: 2.88,
    grossProfit: 5.02,
    grossMargin: 63.5
  });
});

test('upgrade price and multiple quantity apply to the complete configured set', () => {
  const items = buildStoreOrderItems([{
    productId: breakfastSet.id,
    setId: breakfastSet.id,
    quantity: 3,
    selectedOptions: [],
    selectedSetItems: [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'kopi-ice' }]
  }], products, [], [breakfastSet]);
  assert.equal(items[0].unitPrice, 8.4);
  assert.equal(items[0].lineTotal, 25.2);
  assert.equal(items[0].setSnapshot?.selectedGroups[1].priceAdjustment, 0.5);
});

test('required groups reject missing or unavailable child products and explain automatic unavailability', () => {
  assert.match(validateStoreSetSelections(breakfastSet, products, [{ groupId: 'main', productId: 'nasi' }]), /Choose 1 Drink/);
  const unavailableProducts = products.map(product => product.id === 'kopi' || product.id === 'kopi-ice' ? { ...product, available: false } : product);
  assert.equal(getStoreSetUnavailableReason(breakfastSet, unavailableProducts), 'Unavailable — Drink group has no available options.');
  assert.match(validateStoreSetSelections(breakfastSet, unavailableProducts, [
    { groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'kopi' }
  ]), /Drink group has no available options/);
});

test('checkout snapshot remains unchanged after current product and set edits', () => {
  const item = buildStoreOrderItems([{
    productId: breakfastSet.id, setId: breakfastSet.id, quantity: 1, selectedOptions: [],
    selectedSetItems: [{ groupId: 'main', productId: 'nasi' }, { groupId: 'drink', productId: 'kopi' }]
  }], products, [], [breakfastSet])[0];
  const snapshot = structuredClone(item.setSnapshot);
  products[0].name = 'Renamed Nasi';
  products[0].price = 8;
  breakfastSet.name = 'Renamed Set';
  breakfastSet.price = 9.9;
  breakfastSet.groups[1].options[0].priceAdjustment = 2;
  assert.deepEqual(item.setSnapshot, snapshot);
  assert.equal(item.productName, 'Breakfast Set');
  assert.equal(item.unitPrice, 7.9);
});

test('standalone product order behavior remains backward compatible', () => {
  const item = buildStoreOrderItems([{ productId: 'kopi', quantity: 2, selectedOptions: [] }], products, [])[0];
  assert.equal(item.itemType, 'product');
  assert.equal(item.unitPrice, 3.5);
  assert.equal(item.lineTotal, 7);
  assert.equal(item.setSnapshot, undefined);
});

