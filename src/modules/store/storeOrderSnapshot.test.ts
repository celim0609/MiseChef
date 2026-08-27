import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  formatStoreOrderSetSelection,
  normalizeStoreOrderItem
} from './storeOrderSnapshot';

const posSource = readFileSync(new URL('./StorePosPage.tsx', import.meta.url), 'utf8');
const ownerOrdersSource = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');

const configuredSetItem = {
  itemType: 'set',
  productId: 'breakfast-set',
  productName: 'Breakfast Set',
  photoUrl: 'https://example.test/breakfast.png',
  quantity: 1,
  basePrice: 7.9,
  unitPrice: 8.4,
  lineTotal: 8.4,
  selectedOptions: [],
  setSnapshot: {
    setId: 'breakfast-set',
    setName: 'Breakfast Set',
    category: 'Breakfast',
    baseSetPrice: 7.9,
    regularValue: 9.2,
    customerSaving: 0.8,
    selectedGroups: [
      {
        groupId: 'main',
        groupName: 'Main',
        productId: 'nasi-lemak',
        productName: 'Nasi Lemak',
        standalonePrice: 5.9,
        priceAdjustment: 0
      },
      {
        groupId: 'drink',
        groupName: 'Drink',
        productId: 'kopi-o-ice',
        productName: 'Kopi-O Ice',
        standalonePrice: 3.3,
        priceAdjustment: 0.5
      }
    ]
  }
};

test('configured Set snapshots survive order item normalization unchanged', () => {
  const normalized = normalizeStoreOrderItem(configuredSetItem);
  assert.deepEqual(normalized.setSnapshot, configuredSetItem.setSnapshot);
  assert.equal(normalized.productName, 'Breakfast Set');
  assert.equal(normalized.unitPrice, 8.4);
});

test('POS formats the stored Set name, selections, and upgrade adjustment', () => {
  const normalized = normalizeStoreOrderItem(configuredSetItem);
  const lines = normalized.setSnapshot!.selectedGroups.map(selection => (
    formatStoreOrderSetSelection(selection, 'MYR')
  ));
  assert.deepEqual(lines, [
    'Main: Nasi Lemak',
    'Drink: Kopi-O Ice (+MYR 0.50)'
  ]);
  assert.match(posSource, /item\.productName/);
  assert.equal(posSource.match(/formatStoreOrderSetSelection\(selection,/g)?.length, 2);
  assert.match(ownerOrdersSource, /item\.setSnapshot\.selectedGroups\.map/);
});

test('standalone Product orders remain unchanged', () => {
  const standalone = {
    productId: 'coffee',
    productName: 'Coffee',
    photoUrl: '',
    quantity: 2,
    basePrice: 3,
    unitPrice: 3.5,
    lineTotal: 7,
    selectedOptions: [{
      groupId: 'temperature',
      groupName: 'Temperature',
      optionId: 'ice',
      optionName: 'Ice',
      priceAdjustment: 0.5
    }]
  };
  assert.deepEqual(normalizeStoreOrderItem(standalone), standalone);
});

test('historical orders without setSnapshot remain compatible', () => {
  const historical = normalizeStoreOrderItem({
    productId: 'legacy-product',
    productName: 'Legacy Product',
    quantity: 1,
    basePrice: 4,
    unitPrice: 4,
    lineTotal: 4
  });
  assert.equal(historical.setSnapshot, undefined);
  assert.deepEqual(historical.selectedOptions, []);
  assert.equal(historical.productName, 'Legacy Product');
});
