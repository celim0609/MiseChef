import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStoreOrderItems,
  createDefaultWorkspaceStore,
  DEFAULT_STORE_ORDER_DAYS,
  getValidPickupDates,
  normalizeStoreOptionGroup,
  normalizeWorkspaceStore,
  toStoreSlug,
  validateStoreOptionGroup,
  validateStoreOrder,
  validateStoreProduct,
  validateStoreSettings
} from './storeModel';
import { resolvePublicRoute } from '../public/publicRoutes';
import { canAccessRootTab } from '../team/permissions';
import type { StoreOrderDay } from './types';

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
  assert.equal(malaysiaStore.pickupEnabled, false);
  assert.deepEqual(malaysiaStore.pickupSessions, []);
  assert.deepEqual(malaysiaStore.pickupLocations, []);
});

test('pickup stays simple and requires owner-defined locations and sessions', () => {
  const baseSettings = {
    name: 'Test Kitchen',
    logoUrl: '',
    coverImageUrl: '',
    description: '',
    contactInformation: '',
    businessHours: '',
    pickupEnabled: true,
    deliveryEnabled: false,
    pickupSessions: ['Lunch'],
    pickupLocations: [{
      id: 'counter',
      name: 'Main Counter',
      address: '1 Main Street',
      notes: ''
    }],
    orderDays: [...DEFAULT_STORE_ORDER_DAYS],
    earliestPickupDays: 0 as const,
    maximumAdvanceDays: 14 as const,
    unavailableDates: []
  };

  assert.equal(validateStoreSettings(baseSettings), '');
  assert.equal(validateStoreSettings({
    ...baseSettings,
    pickupLocations: [{ id: 'counter', name: '', address: '', notes: '' }]
  }), 'Every pickup location needs a name and address.');
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
    available: true,
    optionGroupIds: []
  }), '');
  assert.equal(validateStoreProduct({
    photoUrl: '',
    name: 'Signature Tart',
    description: '',
    price: 12.5,
    available: true,
    optionGroupIds: []
  }), 'Product photo is required.');
});

test('public Store route contains the ordering flow without exposing order tracking routes', () => {
  assert.deepEqual(resolvePublicRoute('/store/ce-lim-kitchen'), {
    page: 'store',
    slug: 'ce-lim-kitchen'
  });
  assert.equal(resolvePublicRoute('/store/ce-lim-kitchen/orders'), null);
  assert.equal(resolvePublicRoute('/store/ce-lim-kitchen/checkout'), null);
});

test('reusable option groups require owner-provided choices', () => {
  const group = normalizeStoreOptionGroup('drink', {
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    name: 'Drink',
    options: [
      { id: 'kopi', name: 'Kopi', priceAdjustment: 0 },
      { id: 'none', name: 'No Drink', priceAdjustment: -1 }
    ]
  });
  assert.equal(validateStoreOptionGroup({ name: group.name, options: group.options }), '');
  assert.equal(validateStoreOptionGroup({ name: 'Drink', options: [] }), 'Add at least one option.');
});

test('order snapshots use current available products and owner-defined option pricing', () => {
  const products = [{
    id: 'set-a',
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    photoUrl: 'https://example.test/set.jpg',
    name: 'Breakfast Set',
    description: '',
    price: 10,
    available: true,
    optionGroupIds: ['drink'],
    createdBy: 'owner',
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  }];
  const groups = [normalizeStoreOptionGroup('drink', {
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    name: 'Drink',
    options: [{ id: 'none', name: 'No Drink', priceAdjustment: -1 }]
  })];
  const items = buildStoreOrderItems([{
    productId: 'set-a',
    quantity: 2,
    selectedOptions: [{ groupId: 'drink', optionId: 'none' }]
  }], products, groups);

  assert.equal(items[0].unitPrice, 9);
  assert.equal(items[0].lineTotal, 18);
  assert.equal(items[0].selectedOptions[0].optionName, 'No Drink');
});

test('guest checkout requires pickup availability, valid sessions, and no account', () => {
  const currentDate = new Date('2026-07-25T12:00:00');
  const preorderRules = {
    orderDays: [...DEFAULT_STORE_ORDER_DAYS],
    earliestPickupDays: 0 as const,
    maximumAdvanceDays: 14 as const,
    unavailableDates: []
  };
  const validDraft = {
    customerName: 'Customer',
    phone: '+60123456789',
    pickupDate: '2026-07-28',
    pickupSession: '12:00–12:30',
    pickupLocationId: 'front-counter',
    notes: '',
    selections: [{ productId: 'set-a', quantity: 1, selectedOptions: [] }]
  };
  assert.equal(validateStoreOrder(validDraft, {
    pickupEnabled: true,
    pickupSessions: ['12:00–12:30'],
    pickupLocations: [{ id: 'front-counter', name: 'Front Counter', address: '1 Main Street', notes: '' }],
    ...preorderRules
  }, currentDate), '');
  assert.equal(validateStoreOrder(validDraft, {
    pickupEnabled: false,
    pickupSessions: ['12:00–12:30'],
    pickupLocations: [{ id: 'front-counter', name: 'Front Counter', address: '1 Main Street', notes: '' }],
    ...preorderRules
  }, currentDate), 'Pickup ordering is not available.');
  assert.equal(validateStoreOrder({ ...validDraft, pickupSession: '13:00–13:30' }, {
    pickupEnabled: true,
    pickupSessions: ['12:00–12:30'],
    pickupLocations: [{ id: 'front-counter', name: 'Front Counter', address: '1 Main Street', notes: '' }],
    ...preorderRules
  }, currentDate), 'Choose a valid pickup session.');
  assert.equal(validateStoreOrder({ ...validDraft, pickupLocationId: 'unknown' }, {
    pickupEnabled: true,
    pickupSessions: ['12:00–12:30'],
    pickupLocations: [{ id: 'front-counter', name: 'Front Counter', address: '1 Main Street', notes: '' }],
    ...preorderRules
  }, currentDate), 'Choose a valid pickup location.');
});

test('pre-order rules give customers only enabled, in-window, unblocked dates', () => {
  const currentDate = new Date('2026-07-25T12:00:00');
  const storeRules = {
    orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as StoreOrderDay[],
    earliestPickupDays: 1 as const,
    maximumAdvanceDays: 14 as const,
    unavailableDates: ['2026-07-27', '2026-08-04']
  };

  assert.deepEqual(getValidPickupDates(storeRules, currentDate), [
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-03',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07'
  ]);
});

test('checkout rejects disabled, blocked, too-early, and out-of-window pickup dates', () => {
  const currentDate = new Date('2026-07-25T12:00:00');
  const store = {
    pickupEnabled: true,
    pickupSessions: ['Lunch'],
    pickupLocations: [{ id: 'counter', name: 'Counter', address: '1 Main Street', notes: '' }],
    orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as StoreOrderDay[],
    earliestPickupDays: 1 as const,
    maximumAdvanceDays: 14 as const,
    unavailableDates: ['2026-07-27']
  };
  const draft = {
    customerName: 'Customer',
    phone: '+60123456789',
    pickupDate: '2026-07-28',
    pickupSession: 'Lunch',
    pickupLocationId: 'counter',
    notes: '',
    selections: [{ productId: 'set-a', quantity: 1, selectedOptions: [] }]
  };

  for (const invalidDate of ['2026-07-25', '2026-07-26', '2026-07-27', '2026-08-10']) {
    assert.equal(
      validateStoreOrder({ ...draft, pickupDate: invalidDate }, store, currentDate),
      'Choose an available pickup date.'
    );
  }
  assert.equal(validateStoreOrder(draft, store, currentDate), '');
});

test('legacy Stores receive safe default pre-order rules', () => {
  const store = normalizeWorkspaceStore('workspace-my', {
    workspaceId: 'workspace-my',
    name: 'Legacy Store',
    country: 'MY'
  });

  assert.deepEqual(store.orderDays, DEFAULT_STORE_ORDER_DAYS);
  assert.equal(store.earliestPickupDays, 0);
  assert.equal(store.maximumAdvanceDays, 14);
  assert.deepEqual(store.unavailableDates, []);
});

test('only workspace owners and managers can manage Store settings and products', () => {
  assert.equal(canAccessRootTab('store', 'Owner'), true);
  assert.equal(canAccessRootTab('store', 'Manager'), true);
  assert.equal(canAccessRootTab('store', 'Chef'), false);
  assert.equal(canAccessRootTab('store', 'Viewer'), false);
});
