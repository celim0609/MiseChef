import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPendingOrder,
  createOrderNumber,
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
    { id: 'kopi', name: 'Kopi', priceAdjustment: 0 },
    { id: 'none', name: 'No Drink', priceAdjustment: -1 }
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
