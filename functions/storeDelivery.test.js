import test from 'node:test';
import { buildPendingOrder } from './storePaymentsCore.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePreOrderSchedule, validateInstantSchedule, assertFutureLalamoveSchedule, buildLalamoveQuoteRequest, providerRoutingDestination, quoteMatchesDestination, sameDeliveryCoordinates } from './storeDelivery.js';

const source = readFileSync(new URL('./storeDelivery.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('./storePayments.js', import.meta.url), 'utf8');
const fulfilment = readFileSync(new URL('./storeFulfilment.js', import.meta.url), 'utf8');

test('delivery checkout revalidates the provider quote, expiry, route, cart, and ignores client totals', () => {
  assert.match(source, /buildOrderItems\(draft\?\.selections/);
  assert.match(source, /Date\.parse\(quote\.expiresAt\) <= Number\(now\) \+ Number\(minimumValidityMs\)/);
  assert.match(source, /Delivery quote no longer matches/);
  assert.doesNotMatch(source, /draft\?\.total/);
  assert.match(payments, /revalidateDeliveryForPayment/);
  assert.match(source, /DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS = 5_000/);
  assert.match(payments, /minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS/);
  assert.match(source, /minimumValidityMs: DELIVERY_PAYMENT_QUOTE_MINIMUM_VALIDITY_MS/);
  assert.match(source, /quoteMatchesDestination\(\{ quote, destination \}\)/);
  assert.match(source, /typeof value === 'number'/);
  assert.match(source, /config\.environment\) !== readString\(provider\?\.environment\)/);
  assert.match(source, /environment: provider\.environment/);
});
test('delivery operational calls cannot cross the persisted provider environment boundary', () => {
  assert.match(source, /assertDeliveryEnvironment/);
  assert.match(source, /Delivery environment does not match this Firebase project/);
  assert.match(source, /Legacy Sandbox orders pre-date the environment snapshot/);
  assert.match(source, /assertDeliveryEnvironment\(\{ delivery, provider \}\)/);
  assert.match(source, /assertDeliveryEnvironment\(\{ delivery: order\.delivery \|\| \{\}, provider \}\)/);
});
test('provider numeric coordinates and equivalent customer strings do not create a false destination mismatch', () => {
  assert.match(source, /Number\.isFinite\(numeric\)/);
  assert.match(source, /sameDeliveryCoordinates/);
  assert.equal(sameDeliveryCoordinates(4.6569255, '4.65692550'), true);
  assert.equal(sameDeliveryCoordinates(101.1172608, '101.1172608'), true);
  assert.equal(sameDeliveryCoordinates(4.1234567890123456, '4.1234567890123456'), true);
  assert.equal(sameDeliveryCoordinates(4.6569255, '4.6569256'), false);
});
test('pre-order quotations include the validated Malaysia delivery slot as UTC scheduleAt', () => {
  const request = buildLalamoveQuoteRequest({
    config: { serviceType: 'MOTORCYCLE' },
    pickup: { latitude: '4.641333', longitude: '101.1420132', address: 'Pickup address' },
    destination: { latitude: '4.6569255', longitude: '101.1172608', address: 'Delivery address' },
    schedule: { mode: 'preorder', date: '2026-10-06', time: '09:00', timeZone: 'Asia/Kuala_Lumpur' }
  });
  assert.deepEqual(request, {
    market: 'MY',
    data: {
      serviceType: 'MOTORCYCLE',
      language: 'en_MY',
      scheduleAt: '2026-10-06T01:00:00.000Z',
      stops: [
        { coordinates: { lat: '4.641333', lng: '101.1420132' }, address: 'Pickup address' },
        { coordinates: { lat: '4.6569255', lng: '101.1172608' }, address: 'Delivery address' }
      ]
    }
  });
});
test('instant quotations omit scheduleAt', () => {
  const request = buildLalamoveQuoteRequest({
    config: { serviceType: 'MOTORCYCLE' },
    pickup: { latitude: '4.641333', longitude: '101.1420132', address: 'Pickup address' },
    destination: { latitude: '4.6569255', longitude: '101.1172608', address: 'Delivery address' },
    schedule: { mode: 'instant' }
  });
  assert.equal('scheduleAt' in request.data, false);
});
test('quotation coordinates are serialized to Lalamove’s maximum 15 fractional digits', () => {
  const request = buildLalamoveQuoteRequest({
    config: { serviceType: 'MOTORCYCLE' },
    pickup: { latitude: '4.5974811234567891', longitude: '101.0788491234567891', address: 'Pickup address' },
    destination: { latitude: '4.6095571234567891', longitude: '101.0958211234567891', address: 'Delivery address' },
    schedule: { mode: 'instant' }
  });
  assert.deepEqual(request.data.stops.map(stop => stop.coordinates), [
    { lat: '4.597481123456789', lng: '101.078849123456789' },
    { lat: '4.609557123456789', lng: '101.095821123456789' }
  ]);
  for (const stop of request.data.stops) for (const coordinate of Object.values(stop.coordinates)) {
    assert.match(coordinate, /^[-+]?\d+(?:\.\d{1,15})?$/);
  }
});
test('pre-order quotations reject a scheduleAt that has already passed in Malaysia time', () => {
  const schedule = { mode: 'preorder', date: '2026-10-06', time: '21:00', timeZone: 'Asia/Kuala_Lumpur' };
  assert.throws(
    () => assertFutureLalamoveSchedule(schedule, Date.parse('2026-10-06T13:00:00.000Z')),
    /Choose a future delivery time/
  );
  assert.deepEqual(
    assertFutureLalamoveSchedule(schedule, Date.parse('2026-10-06T12:59:59.999Z')),
    schedule
  );
});
test('a quote returns Lalamove canonical routing coordinates while retaining the Google Places address', () => {
  const googleDestination = {
    address: 'Google Places formatted address', latitude: '4.6569255', longitude: '101.1172608', instructions: 'Unit / Floor: 3'
  };
  const providerQuote = {
    stops: [
      { coordinates: { lat: '4.641333', lng: '101.1420132' } },
      { coordinates: { lat: 4.65693, lng: 101.11726 } }
    ]
  };
  const routingDestination = providerRoutingDestination({ quote: providerQuote, destination: googleDestination });
  assert.deepEqual(routingDestination, {
    ...googleDestination, latitude: '4.65693', longitude: '101.11726'
  });
  assert.equal(quoteMatchesDestination({ quote: providerQuote, destination: routingDestination }), true);
});
test('a genuine destination change still fails provider route validation', () => {
  const providerQuote = { stops: [
    { coordinates: { lat: '4.641333', lng: '101.1420132' } },
    { coordinates: { lat: '4.65693', lng: '101.11726' } }
  ] };
  assert.equal(quoteMatchesDestination({ quote: providerQuote, destination: {
    address: 'Different selected place', latitude: '4.65694', longitude: '101.11726', instructions: ''
  } }), false);
});
test('a quotation without a canonical provider drop-off is rejected before payment can use it', () => {
  assert.throws(() => providerRoutingDestination({ quote: { stops: [] }, destination: {
    address: 'Google Places formatted address', latitude: '4.6569255', longitude: '101.1172608', instructions: ''
  } }), /invalid quotation/);
});
test('delivery payment cannot be created without a quote snapshot while pickup remains independent', () => {
  assert.match(payments, /A valid delivery quote is required before payment/);
  assert.match(payments, /readString\(draft\?\.fulfilmentMethod\) === 'delivery'/);
});
test('delivery payment checkout reserves one opaque attempt before creating an order or provider session', () => {
  assert.match(payments, /const checkoutAttemptId = isCheckoutAttemptId\(draft\?\.checkoutAttemptId\)/);
  assert.match(payments, /storeCheckoutAttempts/);
  assert.match(payments, /This checkout is already being created\. Please wait\./);
  assert.match(payments, /transaction\.create\(checkoutAttemptReference/);
  assert.match(payments, /const payment = await activeAdapter\.createPayment/);
  assert.ok(payments.indexOf('deliverySnapshot: await revalidateDeliveryForPayment') < payments.indexOf('const checkoutAttemptReference'));
});
test('promotion delivery pricing is bound to an opaque server snapshot and must be refreshed when totals change', () => {
  assert.match(source, /storeDeliveryQuoteSnapshots/);
  assert.match(source, /pricingSnapshotId/);
  assert.match(payments, /freshPromotionSnapshot = await transaction\.get/);
  assert.match(payments, /Promotion or delivery pricing changed\. Refresh your delivery quote before checkout\./);
  assert.match(payments, /displayed\.discountedMerchandiseTotal/);
  assert.match(payments, /displayed\.deliveryFee/);
  assert.match(payments, /displayed\.grandTotal/);
});
test('dispatch is tenant guarded, idempotent, recovers provider failures, and applies exact RM5 limit', () => {
  assert.match(source, /assertWorkspaceOperator/);
  assert.match(source, /delivery\.dispatch\?\.status === 'created'/);
  assert.match(source, /\['creating', 'outcome_unknown', 'cancel_requested'\]\.includes/);
  assert.match(source, /difference > 5/);
  assert.match(source, /dispatch_blocked_requote/);
  assert.match(source, /submitted \? 'outcome_unknown' : 'failed'/);
});
test('refresh, cancellation, reconciliation, and completion remain server-authoritative', () => {
  assert.match(source, /cancelStoreDelivery/);
  assert.match(source, /reconcileActiveDeliveries/);
  assert.match(source, /provider\.retrieveOrder/);
  assert.match(fulfilment, /delivery order can only complete after Lalamove confirms/);
});
test('instant delivery has an independent documented provider lifecycle and never changes kitchen readiness at assignment', () => {
  assert.match(source, /LALAMOVE_DELIVERY_LIFECYCLE/);
  for (const status of ['ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED', 'CANCELED', 'EXPIRED', 'REJECTED']) assert.match(source, new RegExp(status));
  assert.match(source, /\['Preparing', 'Ready'\]/);
  assert.match(source, /delivery\.fulfilmentMode === 'instant'/);
  assert.doesNotMatch(source, /fulfilmentStatus: 'Dispatching'/);
});
test('delivery status updates preserve terminal outcomes, history, driver data, and server-authoritative reconciliation', () => {
  assert.match(source, /TERMINAL_DELIVERY_STATES/);
  assert.match(source, /delivery\.lifecycle\.history/);
  assert.match(source, /provider\.retrieveDriver/);
  assert.match(source, /Lalamove returns 403 until driver details are permitted/);
  assert.match(source, /scheduled_reconciliation/);
  assert.match(source, /provider_terminal/);
  assert.match(source, /difference > 5/);
});
test('instant checkout is Store-configured and server-time validated without a preorder schedule', () => {
  assert.match(source, /validateInstantSchedule/);
  assert.match(source, /timeZone: zone/);
  assert.match(source, /Instant delivery is unavailable/);
  assert.match(source, /fulfilmentMode: schedule\.mode/);
  assert.match(source, /schedule\.mode === 'preorder'/);
});

// Behavioural tests exercise the same transaction claims and external effects
// as callable handlers; a serialized fake transaction models Firestore retries.
const multiDb = documents => {
  let serial = Promise.resolve(); const writes = [];
  const dataAt = (data, field) => field.split('.').reduce((value, key) => value?.[key], data);
  const apply = (key, patch) => {
    if (db.failWrite?.(key, patch)) throw new Error('database persistence unavailable');
    const document = documents[key] ||= {};
    for (const [field, value] of Object.entries(patch)) {
      const parts = field.split('.'); const last = parts.pop();
      let target = document; for (const part of parts) target = target[part] ||= {};
      target[last] = value;
    }
    writes.push({ key, patch });
  };
  const snapshot = (key, ref) => ({ id: key.split('/').at(-1), ref, exists: documents[key] !== undefined, data: () => structuredClone(documents[key]) });
  const reference = key => ({ key, id: key.split('/').at(-1), get: async () => snapshot(key, reference(key)),
    update: async patch => apply(key, patch), create: async value => { if (documents[key]) throw new Error('already exists'); apply(key, value); },
    collection: name => collection(`${key}/${name}`) });
  const collection = (name, filters = [], max = Infinity) => ({
    doc: id => reference(`${name}/${id}`),
    where: (field, operator, value) => collection(name, [...filters, { field, operator, value }], max),
    limit: limit => collection(name, filters, limit),
    get: async () => {
      const docs = Object.keys(documents).filter(key => key.startsWith(`${name}/`) && key.slice(name.length + 1).indexOf('/') === -1
        && filters.every(filter => filter.operator === 'in' ? filter.value.includes(dataAt(documents[key], filter.field)) : dataAt(documents[key], filter.field) === filter.value))
        .slice(0, max).map(key => snapshot(key, reference(key)));
      return { docs, empty: !docs.length };
    }
  });
  const db = { documents, writes, collection,
    runTransaction: handler => {
      const result = serial.then(async () => {
        const pending = [];
        const value = await handler({ get: ref => ref.get(), update: (ref, patch) => pending.push(() => apply(ref.key, patch)), create: (ref, patch) => pending.push(() => apply(ref.key, patch)) });
        pending.forEach(write => write()); return value;
      });
      serial = result.catch(() => undefined); return result;
    }
  };
  return db;
};

const multiOrder = () => ({ id: 'multi', orderNumber: 'MC-MULTI', workspaceId: 's', storeId: 's', fulfilmentMethod: 'delivery', fulfilmentStatus: 'New',
  payment: { status: 'paid', amountMinor: 10000 }, total: 100, totals: { deliveryFee: 14, grandTotal: 100 },
  deliveryPricingSnapshot: { firstDayFee: 7, fulfilmentCount: 2, finalDeliveryTotal: 14 },
  fulfilments: ['2026-10-12','2026-10-16'].map((date, index) => ({ id: `day_${index}`, method: 'delivery', date, time: '10:00', allocations: [{ itemIndex: index, quantity: 1 }] })),
  fulfilmentOperations: { day_0: { kitchenStatus: 'Ready' }, day_1: { kitchenStatus: 'Ready' } }, fulfilmentCompletion: {},
  delivery: { environment: 'sandbox', fulfilmentMethod: 'delivery', quote: { fee: 7, serviceType: 'MOTORCYCLE' },
    pickup: { address: 'Kitchen', latitude: '4.6', longitude: '101.1', contactName: 'Chef', contactPhoneE164: '+60123456789' },
    recipient: { address: 'Customer', latitude: '4.7', longitude: '101.2', name: 'Guest', phoneE164: '+60123456789', instructions: '' } }
});
const dispatchFixture = () => {
  const db = multiDb({ 'workspaces/s': { ownerId: 'owner' }, 'storeOrders/multi': multiOrder() });
  let creations = 0; let quotes = 0;
  const provider = { environment: 'sandbox',
    createQuote: async request => { quotes++; return { quotationId: 'dispatch-quote', serviceType: 'MOTORCYCLE', priceBreakdown: { total: 40, currency: 'MYR' }, stops: request.data.stops.map((stop, index) => ({ ...stop, stopId: `stop-${index}` })) }; },
    createOrder: async request => { creations++; return { orderId: `provider-${request.data.metadata.misechefFulfilmentId}`, status: 'ASSIGNING_DRIVER' }; },
    retrieveOrder: async ({ orderId }) => ({ orderId, status: 'COMPLETED', priceBreakdown: { total: 45, currency: 'MYR' } }),
    cancelOrder: async () => undefined
  };
  return { db, provider, counts: () => ({ creations, quotes }), args: { db, provider, uid: 'owner', orderId: 'multi', fulfilmentId: 'day_0' } };
};

const { dispatchStoreDelivery, refreshStoreDelivery, cancelStoreDelivery, createStoreDeliveryQuote, revalidateDeliveryForPayment, reconcileActiveDeliveries } = await import('./storeDelivery.js');

test('per-fulfilment transactional claim prevents concurrent and retried provider submissions', async () => {
  const fixture = dispatchFixture();
  await Promise.all(Array.from({ length: 6 }, () => dispatchStoreDelivery(fixture.args)));
  await dispatchStoreDelivery(fixture.args);
  assert.deepEqual(fixture.counts(), { creations: 1, quotes: 1 });
  const first = fixture.db.documents['storeOrders/multi'];
  assert.equal(first.fulfilmentOperations.day_0.dispatch.identity, 'multi:day_0');
  assert.equal(first.fulfilmentOperations.day_0.providerOrder.orderId, 'provider-day_0');
  await dispatchStoreDelivery({ ...fixture.args, fulfilmentId: 'day_1' });
  assert.equal(fixture.counts().creations, 2);
  assert.equal(first.fulfilmentOperations.day_1.providerOrder.orderId, 'provider-day_1');
  assert.equal(first.total, 100); assert.equal(first.totals.deliveryFee, 14);
  assert.equal(first.deliveryPricingSnapshot.finalDeliveryTotal, 14);
  assert.equal(first.fulfilmentOperations.day_0.dispatch.operationalQuote.fee, 40);
});

test('provider submission timeout locks outcome_unknown and never automatically resubmits', async () => {
  const fixture = dispatchFixture(); let calls = 0;
  fixture.provider.createOrder = async () => { calls++; throw new Error('response lost after provider accepted'); };
  await assert.rejects(dispatchStoreDelivery(fixture.args), /response lost/);
  assert.equal(fixture.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.dispatch.status, 'outcome_unknown');
  await dispatchStoreDelivery(fixture.args); await dispatchStoreDelivery(fixture.args);
  assert.equal(calls, 1);
});

test('provider success followed by DB failure preserves ID when possible and reconciles without another dispatch', async () => {
  const fixture = dispatchFixture(); let failed = false;
  fixture.db.failWrite = (_key, patch) => {
    if (!failed && patch['fulfilmentOperations.day_0.dispatch.status'] === 'created') { failed = true; return true; }
    return false;
  };
  await assert.rejects(dispatchStoreDelivery(fixture.args), /database/);
  assert.equal(fixture.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.dispatch.status, 'outcome_unknown');
  assert.equal(fixture.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.providerOrder.orderId, 'provider-day_0');
  await refreshStoreDelivery(fixture.args); await dispatchStoreDelivery(fixture.args);
  assert.equal(fixture.counts().creations, 1);
  assert.equal(fixture.db.documents['storeOrders/multi'].fulfilmentCompletion.day_0.completedBy, 'lalamove');
});

test('persistent DB outage retains creating lock; stale reconciliation marks unknown without resubmission', async () => {
  const fixture = dispatchFixture();
  fixture.db.failWrite = (_key, patch) => ['created', 'outcome_unknown'].includes(patch['fulfilmentOperations.day_0.dispatch.status']);
  await assert.rejects(dispatchStoreDelivery(fixture.args));
  fixture.db.failWrite = undefined;
  const operation = fixture.db.documents['storeOrders/multi'].fulfilmentOperations.day_0;
  assert.equal(operation.dispatch.status, 'creating');
  operation.dispatch.requestedAt = '2020-01-01T00:00:00Z';
  await refreshStoreDelivery(fixture.args);
  assert.equal(operation.dispatch.status, 'outcome_unknown');
  await dispatchStoreDelivery(fixture.args); assert.equal(fixture.counts().creations, 1);
});

test('failure before provider submission may safely retry; wrong tenant/environment/day/payment cannot dispatch', async () => {
  const fixture = dispatchFixture(); const original = fixture.provider.createQuote;
  fixture.provider.createQuote = async () => { throw new Error('quote unavailable'); };
  await assert.rejects(dispatchStoreDelivery(fixture.args), /quote unavailable/);
  assert.equal(fixture.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.dispatch.status, 'failed');
  fixture.provider.createQuote = original;
  await assert.rejects(dispatchStoreDelivery({ ...fixture.args, uid: 'intruder' }), /role/);
  await assert.rejects(dispatchStoreDelivery({ ...fixture.args, fulfilmentId: 'other' }), /fulfilment/);
  await assert.rejects(dispatchStoreDelivery({ ...fixture.args, provider: { ...fixture.provider, environment: 'production' } }), /environment/);
  fixture.db.documents['storeOrders/multi'].payment.status = 'pending';
  await assert.rejects(dispatchStoreDelivery(fixture.args), /paid/);
  fixture.db.documents['storeOrders/multi'].payment.status = 'paid';
  await dispatchStoreDelivery(fixture.args); assert.equal(fixture.counts().creations, 1);
  await assert.rejects(dispatchStoreDelivery({ ...fixture.args, fulfilmentId: undefined }), /fulfilment/);
});

test('duplicate and delayed provider completions do not complete parent early or overwrite terminal state', async () => {
  const fixture = dispatchFixture();
  await dispatchStoreDelivery(fixture.args);
  await Promise.all([refreshStoreDelivery(fixture.args), refreshStoreDelivery(fixture.args)]);
  let order = fixture.db.documents['storeOrders/multi'];
  assert.equal(order.fulfilmentStatus, 'New'); assert.equal(Object.keys(order.fulfilmentCompletion).length, 1);
  const completedAt = order.fulfilmentCompletion.day_0.completedAt;
  fixture.provider.retrieveOrder = async () => ({ status: 'ON_GOING' });
  await refreshStoreDelivery(fixture.args);
  assert.equal(order.fulfilmentOperations.day_0.lifecycle.state, 'completed');
  assert.equal(order.fulfilmentCompletion.day_0.completedAt, completedAt);
  await dispatchStoreDelivery({ ...fixture.args, fulfilmentId: 'day_1' });
  fixture.provider.retrieveOrder = async () => ({ status: 'COMPLETED' });
  await refreshStoreDelivery({ ...fixture.args, fulfilmentId: 'day_1' });
  assert.equal(order.fulfilmentStatus, 'Completed'); assert.equal(order.payment.amountMinor, 10000);
  assert.equal(order.total, 100); assert.equal(order.totals.deliveryFee, 14);
});

test('scheduled reconciliation resolves independent provider records and retires unknown-without-ID polling', async () => {
  const fixture = dispatchFixture();
  await dispatchStoreDelivery(fixture.args);
  await reconcileActiveDeliveries({ db: fixture.db, provider: fixture.provider });
  assert.equal(fixture.db.documents['storeOrders/multi'].fulfilmentCompletion.day_0.completedBy, 'lalamove');
  assert.equal(fixture.db.documents['storeOrders/multi'].activeFulfilmentDeliveries, false);
});

test('cancel targets only its fulfilment and never refunds or cancels the financial order', async () => {
  const fixture = dispatchFixture(); await dispatchStoreDelivery(fixture.args);
  fixture.provider.retrieveOrder = async () => ({ status: 'CANCELED' });
  let cancellationId; fixture.provider.cancelOrder = async ({ orderId }) => { cancellationId = orderId; };
  await cancelStoreDelivery(fixture.args);
  const order = fixture.db.documents['storeOrders/multi'];
  assert.equal(cancellationId, 'provider-day_0'); assert.equal(order.fulfilmentStatus, 'New');
  assert.equal(order.payment.status, 'paid'); assert.equal(order.total, 100);
  assert.equal((await dispatchStoreDelivery(fixture.args)).status, 'provider_terminal');
});

const quoteFixture = (actualFee = 7, dayCount = 5) => {
  const store = { id: 's', workspaceId: 's', slug: 'test', name: 'Kitchen', country: 'MY', currency: 'MYR',
    delivery: { enabled: true, provider: 'lalamove', environment: 'sandbox', market: 'MY', serviceType: 'MOTORCYCLE',
      pickup: multiOrder().delivery.pickup,
      fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], earliestDays: 1, maximumAdvanceDays: 14, unavailableDates: [], deliveryHours: { from: '09:00', to: '18:00' } } } } };
  const now = new Date(); const dates = Array.from({ length: dayCount }, (_, index) => new Date(now.getTime() + (index + 2) * 86400000).toISOString().slice(0, 10));
  const products = dates.map((date, index) => ({ id: `meal-${index}`, storeId: 's', available: true, price: 10, name: 'Meal', optionGroupIds: [] }));
  const db = multiDb({ 'stores/s': store, ...Object.fromEntries(products.map(product => [`storeProducts/${product.id}`, product])) });
  let quotes = 0; let firstQuote;
  const provider = { environment: 'sandbox', createQuote: async request => {
    quotes++; firstQuote = { quotationId: 'checkout-quote', expiresAt: new Date(Date.now() + 300000).toISOString(), serviceType: 'MOTORCYCLE', priceBreakdown: { total: actualFee, currency: 'MYR' }, stops: request.data.stops, scheduleAt: request.data.scheduleAt }; return firstQuote;
  }, retrieveQuote: async () => firstQuote };
  const draft = { selections: products.map(product => ({ productId: product.id, quantity: 2 })), fulfilments: dates.map((date, index) => ({ date, time: '10:00', itemIndexes: [index] })), fulfilmentMode: 'preorder', destination: { formattedAddress: 'Customer', latitude: '4.7', longitude: '101.2' } };
  return { store, db, provider, draft, dates, quoteCount: () => quotes };
};

test('five-day checkout quotes every date and persists the sum and binds all dates/address/cart', async () => {
  const fixture = quoteFixture();
  const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: { ...fixture.draft, fulfilments: [...fixture.draft.fulfilments].reverse(), fulfilmentCount: 999, deliveryFee: 0 } });
  assert.equal(fixture.quoteCount(), fixture.draft.fulfilments.length); assert.equal(result.quote.customerDeliveryFee, 35); assert.equal(result.quote.fulfilmentCount, 5);
  assert.equal(result.schedule.date, fixture.dates[0]);
  const draft = { ...fixture.draft, deliveryQuoteId: result.quote.quotationId, deliveryPricingSnapshotId: result.pricingSnapshotId };
  const snapshot = fixture.db.documents[`storeDeliveryQuoteSnapshots/${result.pricingSnapshotId}`];
  assert.equal(snapshot.firstQuote.fee, 7); assert.equal(snapshot.finalDeliveryTotal, 35);
  await revalidateDeliveryForPayment({ ...fixture, draft });
  assert.equal(fixture.quoteCount(), fixture.draft.fulfilments.length);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...draft, fulfilments: draft.fulfilments.map((entry, index) => index === 4 ? { ...entry, time: '11:00' } : entry) } }), /schedule or delivery pricing/);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...draft, selections: draft.selections.map(selection => ({ ...selection, quantity: 3 })) } }), /schedule or delivery pricing/);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...draft, destination: { ...draft.destination, formattedAddress: 'Other' } } }), /schedule or delivery pricing/);
});

for (const [dayCount, expectedTotal] of [[3, 25.2], [5, 42]]) {
  test(`${dayCount}-day checkout uses the actual RM8.40 address quote and freezes RM${expectedTotal}`, async () => {
    const fixture = quoteFixture(8.4, dayCount);
    const createQuote = fixture.provider.createQuote;
    fixture.provider.createQuote = async request => {
      assert.equal(request.data.stops[1].address, fixture.draft.destination.formattedAddress);
      return createQuote(request);
    };
    const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: fixture.draft });
    assert.equal(fixture.quoteCount(), fixture.draft.fulfilments.length);
    assert.equal(result.schedule.date, fixture.dates[0]);
    assert.equal(result.quote.customerDeliveryFee, expectedTotal);
    const snapshot = fixture.db.documents[`storeDeliveryQuoteSnapshots/${result.pricingSnapshotId}`];
    assert.equal(snapshot.firstQuote.fee, 8.4);
    assert.equal(snapshot.fulfilmentCount, dayCount);
    assert.equal(snapshot.finalDeliveryTotal, expectedTotal);
    await revalidateDeliveryForPayment({ ...fixture, draft: { ...fixture.draft, deliveryQuoteId: result.quote.quotationId, deliveryPricingSnapshotId: result.pricingSnapshotId } });
    assert.equal(fixture.quoteCount(), fixture.draft.fulfilments.length);
    assert.equal(snapshot.finalDeliveryTotal, expectedTotal);
  });
}

test('single-day delivery retains original subsidy and pricing without new schedule fields', async () => {
  const fixture = quoteFixture();
  fixture.db.documents['stores/s'].delivery.subsidy = { enabled: true, minimumMerchandiseSpend: 1, maximumCustomerDeliveryCharge: 2 };
  const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: { ...fixture.draft, fulfilments: undefined, deliveryDate: fixture.dates[0], deliveryTime: '10:00' } });
  assert.equal(fixture.quoteCount(), 1); assert.equal(result.quote.customerDeliveryFee, 2);
  assert.equal(result.quote.fulfilmentCount, undefined);
});

test('an immediate terminal provider response still records daily completion transactionally', async () => {
  const fixture = dispatchFixture();
  fixture.provider.createOrder = async () => ({ orderId: 'immediately-completed', status: 'COMPLETED' });
  await dispatchStoreDelivery(fixture.args);
  const order = fixture.db.documents['storeOrders/multi'];
  assert.equal(order.fulfilmentCompletion.day_0.completedBy, 'lalamove');
  assert.equal(order.fulfilmentStatus, 'New');
  assert.equal(order.fulfilmentOperations.day_0.dispatch.status, 'completed');
});


test('delivery scheduling enforces shared cut-off, calendar filters and fixed horizon', () => {
  const config = { fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], earliestDays: 1, maximumAdvanceDays: 7, unavailableDates: ['2026-10-14'], deliveryHours: { from: '09:00', to: '21:00' } }, instant: { enabled: true, operatingHours: { start: '09:00', end: '21:00' } } } };
  const store = { country: 'MY', orderCutoffTime: '18:00' };
  const draft = { deliveryDate: '2026-10-13', deliveryTime: '12:00' };
  const at = new Date('2026-10-12T10:00:00Z');
  const after = new Date('2026-10-12T10:00:00.001Z');
  assert.equal(validatePreOrderSchedule(store, config, draft, at).date, draft.deliveryDate);
  assert.throws(() => validatePreOrderSchedule(store, config, draft, after), /available delivery date/);
  assert.throws(() => validatePreOrderSchedule(store, config, { ...draft, deliveryDate: '2026-10-14' }, after), /available delivery date/);
  assert.equal(validatePreOrderSchedule(store, config, { ...draft, deliveryDate: '2026-10-15' }, after).date, '2026-10-15');
  assert.throws(() => validatePreOrderSchedule(store, config, { ...draft, deliveryDate: '2026-10-20' }, after), /available delivery date/);
  assert.deepEqual(validateInstantSchedule(store, config, at), { mode: 'instant' });
  assert.throws(() => validateInstantSchedule(store, config, after), /future delivery date/);
  assert.deepEqual(validateInstantSchedule({ ...store, orderCutoffTime: null }, config, after), { mode: 'instant' });
});

test('quote and submission agree on free delivery per day without changing actual Lalamove quote', async () => {
  const fixture = quoteFixture(8.4, 3);
  fixture.db.documents['stores/s'].delivery.freeDelivery = { enabled: true, distanceThresholdKm: 500, minimumSubtotalWithin: 15, minimumSubtotalBeyond: 120 };
  fixture.draft.selections.forEach((selection, index) => { selection.quantity = index === 0 ? 2 : 1; });
  const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: { ...fixture.draft, deliveryFee: 0, distanceKm: 0 } });
  assert.equal(fixture.quoteCount(), fixture.draft.fulfilments.length);
  assert.deepEqual(result.quote.days.map(day => day.customerDeliveryFee), [0,8.4,8.4]);
  assert.equal(result.quote.customerDeliveryFee, 16.8);
  const deliverySnapshot = await revalidateDeliveryForPayment({ ...fixture, draft: { ...fixture.draft, deliveryQuoteId: result.quote.quotationId, deliveryPricingSnapshotId: result.pricingSnapshotId } });
  assert.equal(deliverySnapshot.quote.fee, 8.4);
  const order = buildPendingOrder({ id: 'free-order', orderNumber: 'MC-free', store: { ...fixture.store, pickupLocations: [] }, draft: { ...fixture.draft, customerName: 'Guest', phone: '+60123456789', fulfilmentMethod: 'delivery', deliverySnapshot }, products: Object.entries(fixture.db.documents).filter(([path]) => path.startsWith('storeProducts/')).map(([, product]) => product), optionGroups: [], paymentProvider: 'stripe', paymentProviderMode: 'single_merchant' });
  assert.equal(order.totals.deliveryFee, result.quote.customerDeliveryFee);
  assert.deepEqual(order.deliveryPricingSnapshot.days.map(day => day.customerDeliveryFee), [0,8.4,8.4]);
});

test('dated full-week quote and payment revalidation use Sunday cutoff instead of earliest days', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T04:00:00Z') });
  const fixture = quoteFixture();
  const start = new Date(); start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7));
  const monday = start.toISOString().slice(0, 10);
  const dates = Array.from({ length: 5 }, (_, index) => new Date(Date.parse(`${monday}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  const days = ['mon','tue','wed','thu','fri'];
  fixture.store.orderCutoffTime = '18:00';
  fixture.store.delivery.fulfilment.preOrder.earliestDays = 1;
  const meals = days.map((day, index) => ({ id: `dated-${day}`, name: `${day} lunch`, storeId: 's', workspaceId: 's', price: 12, available: true, optionGroupIds: [], availableDay: day }));
  const plan = { id: 'healthy', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', available: true, price: 55, optionGroupIds: [], weeklyWeeks: { week1: { startMonday: monday, meals: Object.fromEntries(meals.map((meal, index) => [days[index], meal.id])) } } };
  for (const product of [...meals, plan]) fixture.db.documents[`storeProducts/${product.id}`] = product;
  const draft = { ...fixture.draft, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: dates.map(date => ({ date, time: '10:00', itemIndexes: [0] })) };
  const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft });
  assert.equal(result.quote.customerDeliveryFee, 35);
  assert.equal(result.quote.fulfilmentCount, 5);
  const paymentDraft = { ...draft, deliveryQuoteId: result.quote.quotationId, deliveryPricingSnapshotId: result.pricingSnapshotId };
  const cutoff = Date.parse(`${monday}T00:00:00+08:00`) - 6 * 3600000;
  // Keep the mocked provider quote valid at the deterministic payment test time.
  const quoteProvider = { ...fixture.provider, retrieveQuote: async () => ({ ...(await fixture.provider.retrieveQuote()), expiresAt: new Date(cutoff + 86400000).toISOString() }) };
  const options = { db: fixture.db, provider: quoteProvider, store: fixture.store, products: [...meals, plan], draft: paymentDraft };
  const atCutoff = await revalidateDeliveryForPayment({ ...options, now: cutoff });
  assert.equal(atCutoff.schedule.date, monday);
  await assert.rejects(revalidateDeliveryForPayment({ ...options, now: cutoff + 1 }), /closed/);
  assert.equal(fixture.quoteCount(), fixture.draft.fulfilments.length);
});

test('embedded full-week and single-day Lalamove quotes share menu data but keep distinct cutoff and fee rules', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T04:00:00Z') });
  const fixture = quoteFixture();
  const start = new Date(); start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7));
  const monday = start.toISOString().slice(0, 10);
  const dates = Array.from({ length: 5 }, (_, index) => new Date(Date.parse(`${monday}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  const days = ['mon','tue','wed','thu','fri'];
  const plan = { id: 'embedded-quote', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', weeklyMenuVersion: 2, available: true, price: 50, optionGroupIds: [], weeklyWeeks: { week3: { startMonday: monday, meals: Object.fromEntries(days.map((day, index) => [day, { name: `${day} direct`, photoUrl: `https://example.test/${day}.jpg`, price: 11 + index, calories: 400 }])) } } };
  fixture.store.orderCutoffTime = '18:00';
  fixture.store.delivery.freeDelivery = { enabled: true, distanceThresholdKm: 100, minimumSubtotalWithin: 13, minimumSubtotalBeyond: 30 };
  fixture.db.documents[`storeProducts/${plan.id}`] = plan;
  const fullDraft = { ...fixture.draft, selections: [{ productId: plan.id, quantity: 1 }], fulfilments: dates.map(date => ({ date, time: '10:00', itemIndexes: [0] })) };
  const full = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: fullDraft });
  assert.equal(full.merchandiseSubtotal, 50); assert.equal(full.quote.customerDeliveryFee, 35); assert.equal(full.quote.fulfilmentCount, 5);
  const singleDraft = { ...fullDraft, selections: [{ productId: plan.id, healthyLunchPlanId: plan.id, healthyLunchDate: dates[2], quantity: 1, price: 0 }], fulfilments: [{ date: dates[2], time: '10:00', itemIndexes: [0] }] };
  const single = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: singleDraft });
  assert.equal(single.merchandiseSubtotal, 13); assert.equal(single.quote.customerDeliveryFee, 0); assert.equal(single.quote.fulfilmentCount, 1);
  const mondayAfterCutoff = Date.parse(`${dates[0]}T18:00:00+08:00`) + 1;
  const provider = { ...fixture.provider, retrieveQuote: async () => ({ ...(await fixture.provider.retrieveQuote()), expiresAt: new Date(mondayAfterCutoff + 3 * 86400000).toISOString() }) };
  const options = { db: fixture.db, provider, store: fixture.store, products: [plan], draft: { ...singleDraft, deliveryQuoteId: single.quote.quotationId, deliveryPricingSnapshotId: single.pricingSnapshotId } };
  assert.equal((await revalidateDeliveryForPayment({ ...options, now: mondayAfterCutoff })).schedule.date, dates[2]);
  await assert.rejects(revalidateDeliveryForPayment({ ...options, now: mondayAfterCutoff + 86400000 }), /available/);
  assert.equal(fixture.quoteCount(), 6);
});

test('rotating Healthy Lunch delivery keeps per-day free delivery and excludes blocked dates', async () => {
  const fixture = quoteFixture();
  const start = new Date(); start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7));
  const monday = start.toISOString().slice(0, 10);
  const dates = Array.from({ length: 5 }, (_, index) => new Date(Date.parse(`${monday}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const plan = { id: 'rotation-quote', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', weeklyMenuVersion: 3,
    rotationStartMonday: monday, rotationWeeks: { week2: { meals: Object.fromEntries(days.map((day, index) => [day, { name: `${day} direct`, photoUrl: 'meal.jpg', price: 11 + index }])) } },
    healthyLunchBlockedDates: [], available: true, price: 50, optionGroupIds: [] };
  fixture.store.orderCutoffTime = '18:00';
  fixture.store.delivery.freeDelivery = { enabled: true, distanceThresholdKm: 100, minimumSubtotalWithin: 13, minimumSubtotalBeyond: 30 };
  fixture.db.documents[`storeProducts/${plan.id}`] = plan;
  const draft = { ...fixture.draft, selections: [{ productId: plan.id, healthyLunchPlanId: plan.id, healthyLunchDate: dates[2], quantity: 1 }], fulfilments: [{ date: dates[2], time: '10:00', itemIndexes: [0] }] };
  const quote = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft });
  assert.equal(quote.quote.customerDeliveryFee, 0);
  assert.equal(quote.quote.fulfilmentCount, 1);
  plan.healthyLunchBlockedDates = [dates[2]];
  await assert.rejects(createStoreDeliveryQuote({ ...fixture, slug: 'test', draft }), /Healthy Lunch|available/);
});

const legacyDispatchFixture = () => {
  const fixture = dispatchFixture();
  const order = fixture.db.documents['storeOrders/multi'];
  delete order.fulfilments;
  order.fulfilmentStatus = 'Ready';
  order.delivery.fulfilmentMode = 'preorder';
  order.delivery.schedule = { mode: 'preorder', date: new Date(Date.now() + 86400000).toISOString().slice(0,10), time: '12:00' };
  order.delivery.quote.fee = 40;
  order.delivery.quote.stops = [order.delivery.pickup, order.delivery.recipient].map((stop,index) => ({stopId:`old-${index}`,address:stop.address,coordinates:{lat:stop.latitude,lng:stop.longitude}}));
  return {...fixture,args:{db:fixture.db,provider:fixture.provider,uid:'owner',orderId:'multi'}};
};

test('legacy preorder dispatch retains UTC schedule and paid totals while refreshing its quote', async () => {
 const f=legacyDispatchFixture();const original=structuredClone(f.db.documents['storeOrders/multi']);let request;
 const quote=f.provider.createQuote;f.provider.createQuote=async input=>{request=input;return quote(input);};
 await dispatchStoreDelivery(f.args);
 assert.equal(request.data.scheduleAt,`${original.delivery.schedule.date}T04:00:00.000Z`);
 const saved=f.db.documents['storeOrders/multi'];
 assert.deepEqual(saved.payment,original.payment);assert.deepEqual(saved.totals,original.totals);assert.equal(saved.total,original.total);
 await dispatchStoreDelivery(f.args);assert.equal(f.counts().creations,1);
});

test('legacy uncertain provider submission stays locked instead of creating a duplicate booking on retry', async () => {
 const f=legacyDispatchFixture();let calls=0;
 f.provider.createOrder=async()=>{calls++;throw new Error('response lost after acceptance');};
 await assert.rejects(dispatchStoreDelivery(f.args),/response lost/);
 assert.equal(f.db.documents['storeOrders/multi'].delivery.dispatch.status,'outcome_unknown');
 assert.equal((await dispatchStoreDelivery(f.args)).status,'outcome_unknown');assert.equal(calls,1);
});

test('legacy environment mismatch fails before changing order state or calling the provider', async () => {
 const f=legacyDispatchFixture();f.provider.environment='production';const before=structuredClone(f.db.documents);
 await assert.rejects(dispatchStoreDelivery(f.args),/environment does not match/);
 assert.deepEqual(f.db.documents,before);assert.deepEqual(f.counts(),{creations:0,quotes:0});
});

test('legacy malformed requotation never submits an order and can safely retry the quotation', async () => {
 const f=legacyDispatchFixture();f.provider.createQuote=async()=>({quotationId:'bad',priceBreakdown:{total:40,currency:'MYR'},stops:[]});
 await assert.rejects(dispatchStoreDelivery(f.args),error=>error.details.fields.includes('sender.stopId') && error.message.includes('no booking has been submitted'));
 assert.equal(f.counts().creations,0);assert.equal(f.db.documents['storeOrders/multi'].delivery.dispatch.status,'failed');
});

test('independent dates quote different routes and fees; payment binds every route and charges once', async () => {
  const fixture = quoteFixture(7, 2);
  fixture.draft.fulfilments[0].destination = { ...fixture.draft.destination, formattedAddress: 'Unit 1, Home' };
  fixture.draft.fulfilments[1].destination = { formattedAddress: 'Floor 2, Office', latitude: '4.8', longitude: '101.3' };
  fixture.draft.fulfilments[1].time = '15:45';
  const quotes = new Map(); const requests = [];
  fixture.provider.createQuote = async request => {
    requests.push(request);
    const id = request.data.scheduleAt;
    const quote = { quotationId: id, expiresAt: new Date(Date.now() + 300000).toISOString(), serviceType: 'MOTORCYCLE', priceBreakdown: { total: requests.length === 1 ? 7 : 12, currency: 'MYR' }, stops: request.data.stops };
    quotes.set(id, quote); return quote;
  };
  fixture.provider.retrieveQuote = async ({quotationId}) => quotes.get(quotationId);
  const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test' });
  assert.equal(result.quote.customerDeliveryFee, 19);
  assert.deepEqual(requests.map(request => request.data.stops[1].address), ['Unit 1, Home', 'Floor 2, Office']);
  assert.ok(requests[1].data.scheduleAt.endsWith('07:45:00.000Z'));
  const paymentDraft = { ...fixture.draft, deliveryQuoteId: result.quote.quotationId, deliveryPricingSnapshotId: result.pricingSnapshotId };
  const deliverySnapshot = await revalidateDeliveryForPayment({ ...fixture, draft: paymentDraft });
  const order = buildPendingOrder({ id: 'paid-order', orderNumber: 'TEST', store: { ...fixture.store, pickupLocations: [], pickupSessions: [] }, products: fixture.db.documents ? Object.values(fixture.db.documents).filter(value => value.price === 10) : [], optionGroups: [], draft: { ...paymentDraft, customerName: 'Guest', phone: '+60123456789', fulfilmentMethod: 'delivery', deliverySnapshot }, paymentProvider: 'stripe', paymentProviderMode: 'single_merchant' });
  assert.equal(order.totals.deliveryFee, 19);
  assert.equal(order.total, 59);
  assert.equal(order.fulfilments[1].destination.formattedAddress, 'Floor 2, Office');
  assert.equal(order.deliveryPricingSnapshot.days[1].providerDeliveryFee, 12);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...paymentDraft, fulfilments: paymentDraft.fulfilments.map((day, index) => index ? { ...day, time: '16:00' } : day) } }), /schedule|pricing/i);
  quotes.get(requests[1].data.scheduleAt).priceBreakdown.total = 50;
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: paymentDraft }), /quotations/);
});

test('every destination must be inside configured distance; quotation failures create no payable snapshot', async () => {
  const fixture = quoteFixture(7, 2);
  fixture.store.delivery.fulfilment.preOrder.maximumDistanceKm = 25;
  fixture.draft.fulfilments[1].destination = { formattedAddress: 'Too far', latitude: '1', longitude: '100' };
  await assert.rejects(createStoreDeliveryQuote({ ...fixture, slug: 'test' }), /maximum delivery distance/);
  assert.equal(Object.keys(fixture.db.documents).filter(key => key.startsWith('storeDeliveryQuoteSnapshots/')).length, 0);
  delete fixture.draft.fulfilments[1].destination;
  fixture.provider.createQuote = async () => { throw new Error('API timeout'); };
  await assert.rejects(createStoreDeliveryQuote({ ...fixture, slug: 'test' }), /API timeout/);
  assert.equal(Object.keys(fixture.db.documents).filter(key => key.startsWith('storeDeliveryQuoteSnapshots/')).length, 0);
});

test('same-day delivery is rejected even when Store settings permit zero advance days', () => {
  const now = new Date('2026-10-21T02:00:00Z');
  const config = { fulfilment: { preOrder: { enabled: true, earliestDays: 0, maximumAdvanceDays: 7, orderDays: ['wednesday','thursday'], deliveryHours: {from:'00:00',to:'23:59'} } } };
  assert.throws(() => validatePreOrderSchedule({country:'MY'}, config, {deliveryDate:'2026-10-21', deliveryTime:'18:00'}, now), /one day/);
  assert.equal(validatePreOrderSchedule({country:'MY'}, config, {deliveryDate:'2026-10-22',deliveryTime:'10:00'}, now).date, '2026-10-22');
});

test('dispatch uses each saved address and refresh persists tracking without changing payment', async () => {
  const fixture = dispatchFixture();
  fixture.db.documents['storeOrders/multi'].fulfilments[0].destination = {formattedAddress:'Unit 2, Other address',latitude:'4.8',longitude:'101.3'};
  const original = fixture.provider.createQuote;
  fixture.provider.createQuote = request => { assert.equal(request.data.stops[1].address, 'Unit 2, Other address'); return original(request); };
  await dispatchStoreDelivery(fixture.args);
  fixture.provider.retrieveOrder = async () => ({status:'ON_GOING',driverId:'rider',shareLink:'https://example.com/tracking'});
  fixture.provider.retrieveDriver = async () => ({name:'Rider',phone:'+60123456789',plateNumber:'TEST'});
  await refreshStoreDelivery(fixture.args);
  const order = fixture.db.documents['storeOrders/multi'];
  assert.equal(order.fulfilmentOperations.day_0.providerOrder.shareLink,'https://example.com/tracking');
  assert.equal(order.fulfilmentOperations.day_0.providerOrder.driver.name,'Rider');
  assert.equal(order.total,100); assert.equal(order.payment.amountMinor,10000);
});

test('automatic dispatch never retries a failed day; an operator can safely retry before submission', async () => {
  const fixture = dispatchFixture();
  fixture.provider.createQuote = async () => { throw new Error('quote unavailable'); };
  await assert.rejects(dispatchStoreDelivery({...fixture.args, uid: undefined, internal: true}), /quote unavailable/);
  assert.equal((await dispatchStoreDelivery({...fixture.args, uid: undefined, internal: true})).status, 'failed');
  fixture.provider.createQuote = async request => ({quotationId:'retry',serviceType:'MOTORCYCLE',priceBreakdown:{total:7,currency:'MYR'},stops:request.data.stops.map((stop,index)=>({...stop,stopId:String(index)}))});
  assert.equal((await dispatchStoreDelivery(fixture.args)).status,'created');
  assert.equal(fixture.counts().creations,1);
});

test('automatic dispatch stays disabled for payment, Ready, unrelated updates and failures', async () => {
  const { automaticDispatchDays } = await import('./storeDelivery.js');
  const order = multiOrder();
  assert.equal(automaticDispatchDays(order, {payment:{status:'pending'}}).length,0);
  assert.equal(automaticDispatchDays(order, structuredClone(order)).length,0);
  order.fulfilmentOperations.day_0.dispatch = {status:'failed'};
  assert.deepEqual(automaticDispatchDays(order),[]);
  assert.equal(automaticDispatchDays({...order,payment:{status:'failed'}}).length,0);
  assert.equal(automaticDispatchDays({...order,manualOrder:true}).length,0);
});

test('anonymized DV47-shaped order dispatches only its paid Ready day, normalizes the saved phone, and never rewrites the original', async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-21T02:00:00Z')});
 const {deliveryOrderCase}=await import('./fixtures/deliveryOrderCase.js');
 const order=deliveryOrderCase(), original=structuredClone(order), db=multiDb({'workspaces/s':{ownerId:'owner'},'storeOrders/fixture-order':order});
 let quotes=0, bookings=0, submitted;
 const provider={environment:'sandbox',createQuote:async request=>{quotes++;assert.equal(request.data.stops[1].address,original.delivery.recipient.address);assert.equal(request.data.scheduleAt,'2026-10-22T03:30:00.000Z');return {quotationId:'new-operational-quote',serviceType:'MOTORCYCLE',priceBreakdown:{total:9,currency:'MYR'},stops:request.data.stops.map((stop,index)=>({...stop,stopId:`fresh-${index}`}))};},createOrder:async request=>{bookings++;submitted=request;return {orderId:'fake-provider-order',status:'ASSIGNING_DRIVER'};}};
 const args={db,provider,uid:'owner',orderId:'fixture-order',fulfilmentId:'day_20261022'};
 // A New paid order must not skip the kitchen workflow.
 await assert.rejects(dispatchStoreDelivery(args),/Mark this delivery day Ready/);assert.equal(quotes,0);assert.equal(bookings,0);
 order.fulfilmentOperations.day_20261022={kitchenStatus:'Ready'};
 await Promise.all([dispatchStoreDelivery(args),dispatchStoreDelivery(args)]);
 assert.equal(quotes,1);assert.equal(bookings,1);
 assert.equal(submitted.data.quotationId,'new-operational-quote');assert.equal(submitted.data.recipients[0].phone,'+60123456789');assert.equal(submitted.data.recipients[0].stopId,'fresh-1');
 assert.deepEqual(order.delivery,original.delivery);assert.deepEqual(order.fulfilments,original.fulfilments);assert.deepEqual(order.payment,original.payment);assert.deepEqual(order.totals,original.totals);assert.equal(order.phone,original.phone);
});

test('missing recipient pin is blocked before quotation, claim or booking and names the required field',async()=>{
 const fixture=dispatchFixture(),order=fixture.db.documents['storeOrders/multi'];
 order.fulfilments[0].destination={formattedAddress:'Different address without coordinates'};
 const before=structuredClone(order);
 await assert.rejects(dispatchStoreDelivery(fixture.args),error=>error.details.fields.includes('recipients[0].coordinates'));
 assert.deepEqual(fixture.counts(),{quotes:0,creations:0});assert.deepEqual(order,before);
});

const { previewMerchantDelivery, confirmMerchantDelivery, reconcileMerchantDelivery } = await import('./storeManualDelivery.js');
const manualFixture = () => {
  const fixture = dispatchFixture();
  const original = fixture.provider.createQuote;
  fixture.provider.createQuote = async request => ({...await original(request), expiresAt: new Date(Date.now()+300000).toISOString()});
  return fixture;
};

test('merchant preview displays exact route, fee and service, creates no booking, confirmation claims exactly once', async () => {
  const f=manualFixture(); const original=structuredClone(f.db.documents['storeOrders/multi']);
  await assert.rejects(confirmMerchantDelivery(f.args), /explicitly confirm/);
  const preview=await previewMerchantDelivery(f.args);
  assert.equal(preview.pickupAddress,'Kitchen'); assert.equal(preview.dropoffAddress,'Customer'); assert.equal(preview.estimatedCost,40); assert.equal(preview.serviceType,'MOTORCYCLE'); assert.ok(preview.quotationId); assert.equal(f.counts().creations,0);
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:preview.id,confirmed:false}),/explicitly confirm/);
  const confirmed={...f.args,previewId:preview.id,confirmed:true};
  await Promise.all(Array.from({length:6},()=>confirmMerchantDelivery(confirmed)));
  await confirmMerchantDelivery(confirmed);
  assert.deepEqual(f.counts(),{quotes:1,creations:1});
  const order=f.db.documents['storeOrders/multi'];
  for(const field of ['delivery','fulfilments','payment','total','totals']) assert.deepEqual(order[field],original[field]);
});

test('preview/confirmation rejects unpaid, non Ready, unauthorised, expired, stale route, wrong merchant and old clients', async () => {
  for(const change of [order=>order.payment.status='failed',order=>order.fulfilmentOperations.day_0.kitchenStatus='Preparing',order=>order.fulfilmentStatus='Cancelled']) {
    const f=manualFixture(); change(f.db.documents['storeOrders/multi']); await assert.rejects(previewMerchantDelivery(f.args)); assert.equal(f.counts().creations,0);
  }
  const f=manualFixture(); await assert.rejects(previewMerchantDelivery({...f.args,uid:'stranger'}));
  const p=await previewMerchantDelivery(f.args);
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:'forged',confirmed:true}));
  f.db.documents['storeOrders/multi'].fulfilments[0].time='12:00';
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:p.id,confirmed:true}),/expired or delivery details changed/);
  const next=await previewMerchantDelivery(f.args); f.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.bookingPreview.expiresAt='2020-01-01';
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:next.id,confirmed:true}));
  assert.equal(f.counts().creations,0);
});

test('quotation timeout cannot book; post-submission timeout locks and all replacement confirmations stay blocked', async () => {
  const f=manualFixture(); const quote=f.provider.createQuote; f.provider.createQuote=async()=>{throw Error('quote timeout');};
  await assert.rejects(previewMerchantDelivery(f.args),/quote timeout/); assert.equal(f.counts().creations,0);
  f.provider.createQuote=quote;const p=await previewMerchantDelivery(f.args);let submissions=0;
  f.provider.createOrder=async()=>{submissions++;throw Error('provider timeout');};
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:p.id,confirmed:true}),/provider timeout/);
  assert.equal(f.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.dispatch.status,'outcome_unknown');
  assert.equal((await confirmMerchantDelivery({...f.args,previewId:p.id,confirmed:true})).status,'outcome_unknown');
  await assert.rejects(previewMerchantDelivery(f.args),/locked/);await assert.rejects(reconcileMerchantDelivery(f.args),/No booking ID/);assert.equal(submissions,1);
});

test('known provider rejection is safe failure; reusing consumed quote cannot submit a second request',async()=>{
  const f=manualFixture();const p=await previewMerchantDelivery(f.args);
  f.provider.createOrder=async()=>{const e=new Error('Wallet insufficient');e.status=400;e.details={providerCode:'ERR_INSUFFICIENT_CREDIT'};e.requestId='test-request';throw e;};
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:p.id,confirmed:true}));
  assert.equal(f.db.documents['storeOrders/multi'].fulfilmentOperations.day_0.dispatch.status,'failed');
  await assert.rejects(confirmMerchantDelivery({...f.args,previewId:p.id,confirmed:true}),/expired or delivery details changed/);
});

test('DV47-shaped historical insufficient credit reconciles rejection without booking or changing paid data',async()=>{
  const f=manualFixture();const order=f.db.documents['storeOrders/multi'];const original=structuredClone(order);
  order.fulfilmentOperations.day_0.dispatch={status:'outcome_unknown',providerCode:'ERR_INSUFFICIENT_CREDIT',requestId:'original-request',operationalQuote:{quotationId:'original-quote'}};
  assert.equal((await reconcileMerchantDelivery(f.args)).status,'failed');assert.equal(f.counts().creations,0);
  assert.equal(order.fulfilmentOperations.day_0.dispatch.reconciliation.result,'confirmed_provider_rejection');
  for(const field of ['delivery','fulfilments','payment','total','totals'])assert.deepEqual(order[field],original[field]);
});

test('unknown outcome accepts only a verified existing booking for the exact submitted quote',async()=>{
  const f=manualFixture(),op=f.db.documents['storeOrders/multi'].fulfilmentOperations.day_0;
  op.dispatch={status:'outcome_unknown',operationalQuote:{quotationId:'submitted-quote'}};
  f.provider.retrieveOrder=async()=>({orderId:'known-booking',quotationId:'wrong-quote',status:'ASSIGNING_DRIVER'});
  await assert.rejects(reconcileMerchantDelivery({...f.args,providerOrderId:'known-booking'}),/does not match/);
  assert.equal(op.dispatch.status,'outcome_unknown');
  f.provider.retrieveOrder=async()=>({orderId:'known-booking',quotationId:'submitted-quote',status:'ASSIGNING_DRIVER'});
  await reconcileMerchantDelivery({...f.args,providerOrderId:'known-booking'});
  assert.equal(op.providerOrder.orderId,'known-booking'); assert.equal(op.dispatch.status,'created');assert.equal(f.counts().creations,0);
});

test('deployed trigger is inert and the sole booking callable requires manual confirmation',async()=>{
  const source=await (await import('node:fs/promises')).readFile(new URL('./index.js',import.meta.url),'utf8');
  const trigger=source.slice(source.indexOf('export const dispatchReadyStoreFulfilments'),source.indexOf('// No webhook endpoint'));
  assert.doesNotMatch(trigger,/dispatchStoreDelivery|createOrder|dispatchFulfilmentDelivery/);
  const callable=source.slice(source.indexOf('export const dispatchStoreLalamoveDelivery'),source.indexOf('export const refreshStoreLalamoveDelivery'));
  assert.match(callable,/confirmMerchantDelivery/);assert.match(callable,/confirmed: request.data/);
});
