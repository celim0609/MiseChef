import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPendingOrder,
  createOrderNumber,
  getEnabledStorePaymentMethod,
  PAYMENT_STATUS
} from './storePaymentsCore.js';
import {
  mapStripePaymentStatus,
  readStripeRefundState,
  STRIPE_PROVIDER_ID,
  STRIPE_PROVIDER_MODE
} from './paymentProviders/stripeSingleMerchant.js';
import { assertSellingWorkspace } from './storePayments.js';

const store = {
  id: 'workspace-ce-lim',
  workspaceId: 'workspace-ce-lim',
  slug: 'ce-lim-kitchen',
  name: 'Ce Lim Kitchen',
  country: 'MY',
  currency: 'MYR',
  pickupEnabled: true,
  pickupSessions: ['Breakfast'],
  pickupLocations: [{
    id: 'counter',
    name: 'Main Counter',
    address: '1 Kitchen Street',
    notes: 'Show your order number'
  }],
  orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  earliestPickupDays: 1,
  maximumAdvanceDays: 14,
  unavailableDates: []
};
const products = [{
  id: 'breakfast',
  name: 'Breakfast Set',
  photoUrl: 'https://example.test/breakfast.jpg',
  price: 5.9,
  available: true,
  optionGroupIds: ['drink']
}];
const optionGroups = [{
  id: 'drink',
  name: 'Drink',
  options: [
    { id: 'kopi', name: 'Kopi', priceAdjustment: 0, available: true },
    { id: 'none', name: 'No Drink', priceAdjustment: -1, available: true }
  ]
}];
const draft = {
  customerName: 'Guest',
  phone: '+60123456789',
  pickupDate: '2026-07-27',
  pickupSession: 'Breakfast',
  pickupLocationId: 'counter',
  notes: '',
  selections: [{
    productId: 'breakfast',
    quantity: 2,
    selectedOptions: [{ groupId: 'drink', optionId: 'none' }]
  }]
};

test('single-merchant order is priced from server products and stores provider-neutral payment state', () => {
  const order = buildPendingOrder({
    id: 'order-1',
    orderNumber: 'MC-260726-AAAAAA',
    store,
    products,
    optionGroups,
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft,
    now: new Date('2026-07-26T04:00:00.000Z')
  });

  assert.equal(order.total, 9.8);
  assert.equal(order.payment.amountMinor, 980);
  assert.equal(order.payment.currency, 'MYR');
  assert.equal(order.payment.provider, STRIPE_PROVIDER_ID);
  assert.equal(order.payment.providerMode, STRIPE_PROVIDER_MODE);
  assert.equal(order.payment.status, PAYMENT_STATUS.pending);
  assert.equal(order.status, 'Awaiting Payment');
  assert.equal(order.items[0].productName, 'Breakfast Set');
  assert.equal(order.items[0].selectedOptions[0].optionName, 'No Drink');
  assert.equal(order.items[0].selectedOptions[0].priceAdjustment, -1);
  assert.equal(order.items[0].basePrice, 5.9);
  assert.equal(order.items[0].unitPrice, 4.9);
});

test('server pricing adds available option adjustments and preserves them in the order snapshot', () => {
  const adjustedOrder = buildPendingOrder({
    id: 'order-option-adjustment',
    orderNumber: 'MC-260726-DDDDDD',
    store,
    products,
    optionGroups: [{
      id: 'drink',
      name: 'Size',
      options: [
        { id: 'regular', name: 'Regular', priceAdjustment: 0, available: true },
        { id: 'large', name: 'Large', priceAdjustment: 2, available: true }
      ]
    }],
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft: {
      ...draft,
      selections: [{
        productId: 'breakfast',
        quantity: 2,
        selectedOptions: [{ groupId: 'drink', optionId: 'large' }]
      }]
    },
    now: new Date('2026-07-26T04:00:00.000Z')
  });

  assert.equal(adjustedOrder.items[0].basePrice, 5.9);
  assert.equal(adjustedOrder.items[0].unitPrice, 7.9);
  assert.equal(adjustedOrder.items[0].lineTotal, 15.8);
  assert.equal(adjustedOrder.items[0].selectedOptions[0].priceAdjustment, 2);
  assert.equal(adjustedOrder.total, 15.8);
  assert.equal(adjustedOrder.payment.amountMinor, 1580);
});

test('server checkout rejects an option that the Store Owner made unavailable', () => {
  assert.throws(() => buildPendingOrder({
    id: 'order-unavailable-option',
    orderNumber: 'MC-260726-EEEEEE',
    store,
    products,
    optionGroups: [{
      id: 'drink',
      name: 'Size',
      options: [
        { id: 'large', name: 'Large', priceAdjustment: 2, available: false }
      ]
    }],
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft: {
      ...draft,
      selections: [{
        productId: 'breakfast',
        quantity: 1,
        selectedOptions: [{ groupId: 'drink', optionId: 'large' }]
      }]
    },
    now: new Date('2026-07-26T04:00:00.000Z')
  }), /Choose an available Size option/);
});

test('server pricing validates multiple-select limits and snapshots every adjustment', () => {
  const multipleGroup = [{
    id: 'drink',
    name: 'Add-ons',
    selectionType: 'multiple',
    required: true,
    minimumSelections: 1,
    maximumSelections: 2,
    available: true,
    options: [
      { id: 'cheese', name: 'Cheese', priceAdjustment: 2, available: true },
      { id: 'egg', name: 'Egg', priceAdjustment: 1.5, available: true },
      { id: 'chicken', name: 'Chicken', priceAdjustment: 4, available: true }
    ]
  }];
  const selections = [{
    productId: 'breakfast',
    quantity: 2,
    selectedOptions: [
      { groupId: 'drink', optionId: 'cheese' },
      { groupId: 'drink', optionId: 'egg' }
    ]
  }];
  const order = buildPendingOrder({
    id: 'order-multiple-options',
    orderNumber: 'MC-260726-MULTI1',
    store,
    products,
    optionGroups: multipleGroup,
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft: { ...draft, selections },
    now: new Date('2026-07-26T04:00:00.000Z')
  });

  assert.equal(order.items[0].basePrice, 5.9);
  assert.equal(order.items[0].unitPrice, 9.4);
  assert.equal(order.items[0].lineTotal, 18.8);
  assert.deepEqual(order.items[0].selectedOptions.map(option => ({
    name: option.optionName,
    adjustment: option.priceAdjustment
  })), [
    { name: 'Cheese', adjustment: 2 },
    { name: 'Egg', adjustment: 1.5 }
  ]);
  assert.equal(order.total, 18.8);
  assert.equal(order.payment.amountMinor, 1880);

  assert.throws(() => buildPendingOrder({
    id: 'order-too-many-options',
    orderNumber: 'MC-260726-MULTI2',
    store,
    products,
    optionGroups: multipleGroup,
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft: {
      ...draft,
      selections: [{
        ...selections[0],
        selectedOptions: [
          ...selections[0].selectedOptions,
          { groupId: 'drink', optionId: 'chicken' }
        ]
      }]
    },
    now: new Date('2026-07-26T04:00:00.000Z')
  }), /Choose no more than 2 Add-ons options/);
});

test('server keeps legacy groups as required single-select groups', () => {
  assert.throws(() => buildPendingOrder({
    id: 'order-legacy-missing',
    orderNumber: 'MC-260726-LEGACY',
    store,
    products,
    optionGroups,
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft: {
      ...draft,
      selections: [{
        productId: 'breakfast',
        quantity: 1,
        selectedOptions: []
      }]
    },
    now: new Date('2026-07-26T04:00:00.000Z')
  }), /Choose at least 1 Drink option/);
});

test('customer-submitted prices and merchant routing are not accepted as checkout inputs', () => {
  const tamperedDraft = {
    ...draft,
    total: 0.01,
    currency: 'SGD',
    workspaceId: 'attacker-workspace',
    providerMode: 'connect'
  };
  const order = buildPendingOrder({
    id: 'order-2',
    orderNumber: 'MC-260726-BBBBBB',
    store,
    products,
    optionGroups,
    paymentProvider: STRIPE_PROVIDER_ID,
    paymentProviderMode: STRIPE_PROVIDER_MODE,
    draft: tamperedDraft,
    now: new Date('2026-07-26T04:00:00.000Z')
  });

  assert.equal(order.total, 9.8);
  assert.equal(order.currency, 'MYR');
  assert.equal(order.workspaceId, 'workspace-ce-lim');
  assert.equal(order.payment.providerMode, 'single_merchant');
});

test('payment providers are selected outside the order and cart UX data', () => {
  const futureProviderOrder = buildPendingOrder({
    id: 'order-future-provider',
    orderNumber: 'MC-260726-CCCCCC',
    store,
    products,
    optionGroups,
    paymentProvider: 'future_malaysia_wallet',
    paymentProviderMode: 'merchant_gateway',
    draft,
    now: new Date('2026-07-26T04:00:00.000Z')
  });

  assert.equal(futureProviderOrder.payment.provider, 'future_malaysia_wallet');
  assert.equal(futureProviderOrder.payment.providerMode, 'merchant_gateway');
  assert.deepEqual(Object.keys(draft).sort(), [
    'customerName',
    'notes',
    'phone',
    'pickupDate',
    'pickupLocationId',
    'pickupSession',
    'selections'
  ]);
});

test('Phase 1 accepts only the configured Ce Lim Kitchen workspace id, never its display name', () => {
  assert.doesNotThrow(() => assertSellingWorkspace(store, 'workspace-ce-lim'));
  assert.throws(
    () => assertSellingWorkspace({ ...store, workspaceId: 'another-workspace', name: 'Ce Lim Kitchen' }, 'workspace-ce-lim'),
    /not available for this Store/
  );
  assert.throws(
    () => assertSellingWorkspace(store, ''),
    /not configured yet/
  );
});

test('Store payment configuration is server-authoritative and manual methods keep server pricing', () => {
  const configuredStore = {
    ...store,
    paymentMethods: [
      { id: 'cash_on_pickup', enabled: true, qrCodeUrl: '', instructions: 'Pay at pickup.' },
      { id: 'touch_n_go_qr', enabled: true, qrCodeUrl: 'https://storage.test/tng.png', instructions: '' },
      { id: 'duitnow_qr', enabled: false, qrCodeUrl: '', instructions: '' },
      { id: 'bank_transfer', enabled: true, qrCodeUrl: '', instructions: 'Bank account details' },
      { id: 'stripe', enabled: false, qrCodeUrl: '', instructions: '' }
    ]
  };
  const method = getEnabledStorePaymentMethod(configuredStore, 'touch_n_go_qr');
  const order = buildPendingOrder({
    id: 'manual-order', orderNumber: 'MC-260726-MANUAL', store: configuredStore,
    products, optionGroups, paymentProvider: method.provider, paymentProviderMode: method.mode,
    paymentMethod: method, draft: { ...draft, paymentMethodId: method.id },
    now: new Date('2026-07-26T04:00:00.000Z')
  });
  assert.equal(order.paymentMethodId, 'touch_n_go_qr');
  assert.equal(order.paymentMethodName, "Touch 'n Go QR");
  assert.equal(order.payment.provider, 'manual');
  assert.equal(order.total, 9.8);
  assert.throws(() => getEnabledStorePaymentMethod(configuredStore, 'stripe'), /no longer available/);
  assert.throws(() => getEnabledStorePaymentMethod(configuredStore, 'duitnow_qr'), /no longer available/);
});

test('legacy Stores remain Stripe-only until the owner enables another method', () => {
  assert.equal(getEnabledStorePaymentMethod(store, 'stripe').provider, 'stripe');
  assert.throws(() => getEnabledStorePaymentMethod(store, 'cash_on_pickup'), /no longer available/);
});

test('Stripe lifecycle maps to stable MiseChef payment states', () => {
  assert.equal(mapStripePaymentStatus('succeeded'), 'paid');
  assert.equal(mapStripePaymentStatus('processing'), 'processing');
  assert.equal(mapStripePaymentStatus('requires_payment_method'), 'failed');
  assert.equal(mapStripePaymentStatus('canceled'), 'cancelled');
  assert.equal(mapStripePaymentStatus('requires_action'), 'pending');
});

test('Stripe refunds map to full, partial, pending, and failed MiseChef states', () => {
  const basePaymentIntent = {
    amount: 980,
    latest_charge: { amount_refunded: 980 }
  };
  assert.deepEqual(
    readStripeRefundState(basePaymentIntent, { type: 'charge.refunded', data: { object: {} } }),
    { status: 'refunded', refundedAmountMinor: 980, failureCode: '' }
  );
  assert.deepEqual(
    readStripeRefundState({
      ...basePaymentIntent,
      latest_charge: { amount_refunded: 400 }
    }, { type: 'refund.updated', data: { object: { status: 'succeeded' } } }),
    { status: 'partial', refundedAmountMinor: 400, failureCode: '' }
  );
  assert.deepEqual(
    readStripeRefundState({
      ...basePaymentIntent,
      latest_charge: { amount_refunded: 0 }
    }, { type: 'refund.created', data: { object: { status: 'pending' } } }),
    { status: 'pending', refundedAmountMinor: 0, failureCode: '' }
  );
  assert.deepEqual(
    readStripeRefundState({
      ...basePaymentIntent,
      latest_charge: { amount_refunded: 0 }
    }, { type: 'refund.failed', data: { object: { status: 'failed', failure_reason: 'lost_or_stolen_card' } } }),
    { status: 'failed', refundedAmountMinor: 0, failureCode: 'lost_or_stolen_card' }
  );
});

test('customer order numbers remain separate from Stripe and Firestore ids', () => {
  const orderNumber = createOrderNumber(
    new Date('2026-07-26T04:00:00.000Z'),
    Uint8Array.from([0, 1, 2, 3, 4, 5])
  );
  assert.equal(orderNumber, 'MC-260726-ABCDEF');
});
