import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicDiscoverStoreSummary, loadPublicDiscoverStores } from './publicDiscover.js';

test('public Discover Store projection exposes only display fields and available products', () => {
  const summary = buildPublicDiscoverStoreSummary({
    store: {
      id: 'workspace-private',
      slug: 'public-store',
      name: 'Public Store',
      description: 'Breakfast and drinks.',
      coverImageUrl: 'https://images.example.com/store.jpg',
      logoUrl: 'https://images.example.com/logo.jpg',
      createdBy: 'private-owner',
      contactInformation: 'private contact',
      paymentMethods: [{ instructions: 'private payment text' }]
    },
    products: [
      { id: 'available', name: 'Kopi', description: 'Fresh coffee.', photoUrl: 'https://images.example.com/kopi.jpg', available: true, createdBy: 'private-owner' },
      { id: 'hidden', name: 'Hidden Product', description: '', photoUrl: '', available: false }
    ]
  });

  assert.deepEqual(Object.keys(summary).sort(), ['description', 'imageUrl', 'name', 'products', 'slug']);
  assert.deepEqual(Object.keys(summary.products[0]).sort(), ['description', 'id', 'imageUrl', 'name']);
  assert.equal(summary.products.length, 1);
  assert.doesNotMatch(JSON.stringify(summary), /workspace-private|private-owner|private contact|private payment text|Hidden Product/);
});

test('public Discover loader uses the controlled public slug and available-product query', async () => {
  const calls = [];
  const stores = await loadPublicDiscoverStores({
    loadStore: async slug => {
      calls.push(['store', slug]);
      return { id: 'store-id', slug, name: 'MiseChef Store', description: '', coverImageUrl: '', logoUrl: '' };
    },
    loadAvailableProducts: async storeId => {
      calls.push(['products', storeId]);
      return [{ id: 'coffee', name: 'Coffee', description: '', photoUrl: '', available: true }];
    }
  });
  assert.deepEqual(calls, [
    ['store', 'misechef-s-grab-go-store'],
    ['products', 'store-id']
  ]);
  assert.equal(stores[0].products[0].name, 'Coffee');
});
