import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultWorkspaceStore,
  normalizeWorkspaceStore,
  toStoreSlug,
  validateStoreProduct
} from './storeModel';
import { resolvePublicRoute } from '../public/publicRoutes';
import { canAccessRootTab } from '../team/permissions';

test('every workspace receives exactly one region-aware Store identity', () => {
  const malaysiaStore = createDefaultWorkspaceStore(
    { id: 'workspace-my', name: 'Ce Lim Kitchen', country: 'MY' },
    'owner-my',
    '2026-07-25T00:00:00.000Z'
  );
  const singaporeStore = createDefaultWorkspaceStore(
    { id: 'workspace-sg', name: 'Bella Bistro', country: 'SG' },
    'owner-sg',
    '2026-07-25T00:00:00.000Z'
  );

  assert.equal(malaysiaStore.id, 'workspace-my');
  assert.equal(malaysiaStore.workspaceId, 'workspace-my');
  assert.equal(malaysiaStore.currency, 'MYR');
  assert.equal(singaporeStore.id, 'workspace-sg');
  assert.equal(singaporeStore.workspaceId, 'workspace-sg');
  assert.equal(singaporeStore.currency, 'SGD');
});

test('public Store slugs are stable and URL safe', () => {
  assert.equal(toStoreSlug('  Ce Lim Kitchen  '), 'ce-lim-kitchen');
  assert.equal(toStoreSlug('Bella & Sons Bistro'), 'bella-sons-bistro');
});

test('stored currency is derived from country instead of editable Store data', () => {
  const store = normalizeWorkspaceStore('workspace-my', {
    workspaceId: 'workspace-my',
    slug: 'ce-lim-kitchen',
    name: 'Ce Lim Kitchen',
    country: 'MY',
    currency: 'SGD'
  });

  assert.equal(store.country, 'MY');
  assert.equal(store.currency, 'MYR');
});

test('simple products require only the milestone fields', () => {
  assert.equal(validateStoreProduct({
    photoUrl: 'https://example.test/product.jpg',
    name: 'Signature Tart',
    description: 'Freshly baked.',
    price: 12.5,
    available: true
  }), '');
  assert.equal(validateStoreProduct({
    photoUrl: '',
    name: 'Signature Tart',
    description: '',
    price: 12.5,
    available: true
  }), 'Product photo is required.');
});

test('public Store routes resolve without enabling ordering routes', () => {
  assert.deepEqual(resolvePublicRoute('/store/ce-lim-kitchen'), {
    page: 'store',
    slug: 'ce-lim-kitchen'
  });
  assert.equal(resolvePublicRoute('/store/ce-lim-kitchen/orders'), null);
  assert.equal(resolvePublicRoute('/store/ce-lim-kitchen/checkout'), null);
});

test('only workspace owners and managers can manage Store settings and products', () => {
  assert.equal(canAccessRootTab('store', 'Owner'), true);
  assert.equal(canAccessRootTab('store', 'Manager'), true);
  assert.equal(canAccessRootTab('store', 'Chef'), false);
  assert.equal(canAccessRootTab('store', 'Viewer'), false);
});
