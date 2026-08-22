import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStoreOrderItems,
  createDefaultStoreContact,
  createDefaultWorkspaceStore,
  DEFAULT_STORE_ORDER_DAYS,
  createDefaultStorePaymentMethods,
  formatPickupDateLabel,
  formatStoreOptionSelectionRequirement,
  getValidPickupDates,
  normalizeStoreOptionGroup,
  normalizeStoreContact,
  normalizeStorePaymentMethods,
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
  assert.equal(
    singaporeStore.paymentMethods.find(method => method.id === 'touch_n_go_qr')?.enabled,
    false
  );
  assert.equal(malaysiaStore.pickupEnabled, false);
  assert.deepEqual(malaysiaStore.pickupSessions, []);
  assert.deepEqual(malaysiaStore.pickupLocations, []);
});

test('Touch ’n Go configuration is accepted for MY and cleared or rejected for SG', () => {
  const malaysiaStore = createDefaultWorkspaceStore(
    { id: 'workspace-my-tng', name: 'MY Store', country: 'MY' },
    'owner-my'
  );
  const configuredMethods = malaysiaStore.paymentMethods.map(method => method.id === 'touch_n_go_qr'
    ? { ...method, enabled: true, qrCodeUrl: 'https://storage.test/tng.png', instructions: 'Pay exactly.' }
    : method.id === 'stripe' ? { ...method, enabled: false } : method);
  const baseSettings = {
    name: malaysiaStore.name,
    logoUrl: '', coverImageUrl: '', description: '', contactInformation: '', businessWhatsApp: '',
    storeContact: createDefaultStoreContact(),
    businessHours: '', pickupEnabled: false, deliveryEnabled: false, pickupSessions: [], pickupLocations: [],
    orderDays: [...DEFAULT_STORE_ORDER_DAYS], earliestPickupDays: 0 as const, maximumAdvanceDays: 14 as const,
    unavailableDates: [], paymentMethods: configuredMethods
  };

  assert.equal(validateStoreSettings(baseSettings, 'MY'), '');
  assert.equal(
    validateStoreSettings(baseSettings, 'SG'),
    'Touch ’n Go eWallet is available only for Malaysia Stores.'
  );
  const normalizedSg = normalizeStorePaymentMethods(configuredMethods, 'SG')
    .find(method => method.id === 'touch_n_go_qr');
  assert.deepEqual(normalizedSg, {
    id: 'touch_n_go_qr', enabled: false, qrCodeUrl: '', instructions: ''
  });
});

test('pickup stays simple and requires owner-defined locations and sessions', () => {
  const baseSettings = {
    name: 'Test Kitchen',
    logoUrl: '',
    coverImageUrl: '',
    description: '',
    contactInformation: '',
    businessWhatsApp: '',
    storeContact: createDefaultStoreContact(),
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
    unavailableDates: [],
    paymentMethods: createDefaultStorePaymentMethods()
  };

  assert.equal(validateStoreSettings(baseSettings), '');
  assert.equal(validateStoreSettings({
    ...baseSettings,
    pickupLocations: [{ id: 'counter', name: '', address: '', notes: '' }]
  }), 'Every pickup location needs a name and address.');
  assert.equal(validateStoreSettings({
    ...baseSettings,
    storeContact: { ...baseSettings.storeContact, whatsapp: 'not-a-number' }
  }), 'Enter a valid Store WhatsApp number, including country code.');
});

test('legacy Stores remain Stripe-only and QR methods require an owner QR image', () => {
  const legacyMethods = normalizeStorePaymentMethods(undefined);
  assert.deepEqual(legacyMethods.filter(method => method.enabled).map(method => method.id), ['stripe']);
  const baseStore = createDefaultWorkspaceStore(
    { id: 'workspace-payments', name: 'Payment Kitchen', country: 'MY' },
    'owner-payments'
  );
  const baseSettings = {
    name: baseStore.name,
    logoUrl: '', coverImageUrl: '', description: '', contactInformation: '', businessWhatsApp: '',
    storeContact: createDefaultStoreContact(),
    businessHours: '', pickupEnabled: false, deliveryEnabled: false, pickupSessions: [], pickupLocations: [],
    orderDays: [...DEFAULT_STORE_ORDER_DAYS], earliestPickupDays: 0 as const, maximumAdvanceDays: 14 as const,
    unavailableDates: [], paymentMethods: baseStore.paymentMethods.map(method => (
      method.id === 'touch_n_go_qr' ? { ...method, enabled: true } : method.id === 'stripe' ? { ...method, enabled: false } : method
    ))
  };
  assert.equal(validateStoreSettings(baseSettings), 'Upload a merchant QR code before enabling QR payment.');
  assert.equal(validateStoreSettings({
    ...baseSettings,
    paymentMethods: baseSettings.paymentMethods.map(method => method.id === 'touch_n_go_qr'
      ? { ...method, qrCodeUrl: 'https://storage.test/merchant-qr.png' }
      : method)
  }), '');
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

test('legacy Store WhatsApp is migrated into structured contact without inventing other contact data', () => {
  assert.deepEqual(normalizeStoreContact(undefined, '+60 12-3456789'), {
    phone: '',
    email: '',
    whatsapp: '+60 12-3456789',
    facebook: '',
    instagram: '',
    tiktok: '',
    website: ''
  });
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
      { id: 'kopi', name: 'Kopi', priceAdjustment: 0, available: true },
      { id: 'none', name: 'No Drink', priceAdjustment: -1, available: false }
    ]
  });
  assert.equal(validateStoreOptionGroup({ ...group, options: group.options }), '');
  assert.equal(group.selectionType, 'single');
  assert.equal(group.required, true);
  assert.equal(group.minimumSelections, 1);
  assert.equal(group.maximumSelections, 1);
  assert.equal(group.available, true);
  assert.deepEqual(group.options.map(option => option.sortOrder), [0, 1]);
  assert.equal(group.options[0].available, true);
  assert.equal(group.options[1].available, false);
  assert.equal(validateStoreOptionGroup({ ...group, options: [] }), 'Add at least one option.');
  assert.equal(validateStoreOptionGroup({
    ...group,
    maximumSelections: 2
  }), 'Single Select groups must have a maximum selection of one.');
  assert.equal(validateStoreOptionGroup({
    ...group,
    required: true,
    minimumSelections: 0
  }), 'Required groups must have a minimum selection of at least one.');
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
    options: [{ id: 'none', name: 'No Drink', priceAdjustment: -1, available: true }]
  })];
  const items = buildStoreOrderItems([{
    productId: 'set-a',
    quantity: 2,
    selectedOptions: [{ groupId: 'drink', optionId: 'none' }]
  }], products, groups);

  assert.equal(items[0].unitPrice, 9);
  assert.equal(items[0].lineTotal, 18);
  assert.equal(items[0].selectedOptions[0].optionName, 'No Drink');
  assert.equal(items[0].selectedOptions[0].priceAdjustment, -1);
});

test('legacy options default to available and unavailable options cannot enter an order snapshot', () => {
  const legacyGroup = normalizeStoreOptionGroup('size', {
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    name: 'Size',
    options: [{ id: 'regular', name: 'Regular', priceAdjustment: 0 }]
  });
  assert.equal(legacyGroup.options[0].available, true);

  const products = [{
    id: 'set-a',
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    photoUrl: 'https://example.test/set.jpg',
    name: 'Breakfast Set',
    description: '',
    price: 10,
    available: true,
    optionGroupIds: ['size'],
    createdBy: 'owner',
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  }];
  const unavailableGroup = normalizeStoreOptionGroup('size', {
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    name: 'Size',
    options: [{ id: 'large', name: 'Large', priceAdjustment: 2, available: false }]
  });

  assert.throws(() => buildStoreOrderItems([{
    productId: 'set-a',
    quantity: 1,
    selectedOptions: [{ groupId: 'size', optionId: 'large' }]
  }], products, [unavailableGroup]), /Choose an available Size option/);
});

test('multiple-select groups enforce required minimum and maximum selections', () => {
  const product = {
    id: 'toast',
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    photoUrl: 'https://example.test/toast.jpg',
    name: 'Toast',
    description: '',
    price: 10,
    available: true,
    optionGroupIds: ['addons'],
    createdBy: 'owner',
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  };
  const group = normalizeStoreOptionGroup('addons', {
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    name: 'Add-ons',
    selectionType: 'multiple',
    required: true,
    minimumSelections: 1,
    maximumSelections: 2,
    available: true,
    options: [
      { id: 'cheese', name: 'Cheese', priceAdjustment: 2, available: true, sortOrder: 1 },
      { id: 'egg', name: 'Egg', priceAdjustment: 1.5, available: true, sortOrder: 0 },
      { id: 'chicken', name: 'Chicken', priceAdjustment: 4, available: true, sortOrder: 2 }
    ]
  });

  const items = buildStoreOrderItems([{
    productId: product.id,
    quantity: 2,
    selectedOptions: [
      { groupId: group.id, optionId: 'cheese' },
      { groupId: group.id, optionId: 'egg' }
    ]
  }], [product], [group]);
  assert.deepEqual(group.options.map(option => option.id), ['egg', 'cheese', 'chicken']);
  assert.equal(items[0].basePrice, 10);
  assert.equal(items[0].unitPrice, 13.5);
  assert.equal(items[0].lineTotal, 27);
  assert.deepEqual(items[0].selectedOptions.map(option => option.priceAdjustment), [2, 1.5]);

  assert.throws(() => buildStoreOrderItems([{
    productId: product.id,
    quantity: 1,
    selectedOptions: []
  }], [product], [group]), /Choose at least 1 Add-ons option/);
  assert.throws(() => buildStoreOrderItems([{
    productId: product.id,
    quantity: 1,
    selectedOptions: [
      { groupId: group.id, optionId: 'cheese' },
      { groupId: group.id, optionId: 'egg' },
      { groupId: group.id, optionId: 'chicken' }
    ]
  }], [product], [group]), /Choose no more than 2 Add-ons options/);
});

test('optional and unavailable option groups do not require a customer selection', () => {
  const product = {
    id: 'coffee',
    storeId: 'workspace-my',
    workspaceId: 'workspace-my',
    photoUrl: 'https://example.test/coffee.jpg',
    name: 'Coffee',
    description: '',
    price: 5,
    available: true,
    optionGroupIds: ['extras', 'seasonal'],
    createdBy: 'owner',
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  };
  const optionalGroup = normalizeStoreOptionGroup('extras', {
    name: 'Extras',
    selectionType: 'multiple',
    required: false,
    minimumSelections: 2,
    maximumSelections: 3,
    options: [
      { id: 'sugar', name: 'Sugar', priceAdjustment: 0, available: true },
      { id: 'milk', name: 'Milk', priceAdjustment: 1, available: true },
      { id: 'egg', name: 'Egg', priceAdjustment: 1.5, available: true },
      { id: 'chicken', name: 'Chicken', priceAdjustment: 3, available: true }
    ]
  });
  const unavailableGroup = normalizeStoreOptionGroup('seasonal', {
    name: 'Seasonal',
    available: false,
    options: [{ id: 'special', name: 'Special', priceAdjustment: 2 }]
  });
  const items = buildStoreOrderItems([{
    productId: product.id,
    quantity: 1,
    selectedOptions: []
  }], [product], [optionalGroup, unavailableGroup]);
  assert.equal(items[0].unitPrice, 5);
  assert.deepEqual(items[0].selectedOptions, []);
  assert.equal(optionalGroup.minimumSelections, 0);
  assert.equal(formatStoreOptionSelectionRequirement(optionalGroup), 'Choose up to 3 · Optional');

  const oneAddon = buildStoreOrderItems([{
    productId: product.id,
    quantity: 1,
    selectedOptions: [{ groupId: optionalGroup.id, optionId: 'egg' }]
  }], [product], [optionalGroup, unavailableGroup]);
  assert.equal(oneAddon[0].unitPrice, 6.5);
  assert.deepEqual(oneAddon[0].selectedOptions.map(option => option.priceAdjustment), [1.5]);

  const withinMaximum = buildStoreOrderItems([{
    productId: product.id,
    quantity: 1,
    selectedOptions: [
      { groupId: optionalGroup.id, optionId: 'milk' },
      { groupId: optionalGroup.id, optionId: 'egg' },
      { groupId: optionalGroup.id, optionId: 'chicken' }
    ]
  }], [product], [optionalGroup, unavailableGroup]);
  assert.equal(withinMaximum[0].unitPrice, 10.5);

  assert.throws(() => buildStoreOrderItems([{
    productId: product.id,
    quantity: 1,
    selectedOptions: [
      { groupId: optionalGroup.id, optionId: 'sugar' },
      { groupId: optionalGroup.id, optionId: 'milk' },
      { groupId: optionalGroup.id, optionId: 'egg' },
      { groupId: optionalGroup.id, optionId: 'chicken' }
    ]
  }], [product], [optionalGroup, unavailableGroup]), /Choose no more than 3 Extras options/);

  assert.equal(validateStoreOptionGroup({ ...optionalGroup, minimumSelections: 1 }), 'Optional groups must allow zero selections.');
});

test('guest checkout requires pickup availability, valid sessions, and no account', () => {
  const currentDate = new Date('2026-07-25T12:00:00');
  const preorderRules = {
    country: 'MY' as const,
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

test('pickup windows follow the Store region instead of the customer device or UTC day', () => {
  const malaysiaAfterMidnight = new Date('2026-07-25T17:00:00.000Z');
  const dates = getValidPickupDates({
    country: 'MY',
    orderDays: [...DEFAULT_STORE_ORDER_DAYS],
    earliestPickupDays: 0,
    maximumAdvanceDays: 7,
    unavailableDates: []
  }, malaysiaAfterMidnight);

  assert.equal(dates[0], '2026-07-26');
  assert.equal(dates.at(-1), '2026-08-02');
});

test('legacy orders without a pickup date do not crash the Store Owner inbox', () => {
  assert.equal(formatPickupDateLabel('', 'MY'), 'Pickup date unavailable');
  assert.equal(formatPickupDateLabel('not-a-date', 'SG'), 'Pickup date unavailable');
});

test('checkout rejects disabled, blocked, too-early, and out-of-window pickup dates', () => {
  const currentDate = new Date('2026-07-25T12:00:00');
  const store = {
    country: 'MY' as const,
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
  const singaporeStore = { ...store, country: 'SG' as const };
  assert.equal(validateStoreOrder(draft, singaporeStore, currentDate), '');
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
