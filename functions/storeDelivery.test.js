import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFutureLalamoveSchedule, buildLalamoveQuoteRequest, providerRoutingDestination, quoteMatchesDestination, sameDeliveryCoordinates } from './storeDelivery.js';

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
  assert.match(source, /delivery\.dispatch\?\.status === 'creating'/);
  assert.match(source, /difference > 5/);
  assert.match(source, /dispatch_blocked_requote/);
  assert.match(source, /delivery\.dispatch\.status': 'failed'/);
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

const quoteFixture = () => {
  const store = { id: 's', workspaceId: 's', slug: 'test', name: 'Kitchen', country: 'MY', currency: 'MYR',
    delivery: { enabled: true, provider: 'lalamove', environment: 'sandbox', market: 'MY', serviceType: 'MOTORCYCLE',
      pickup: multiOrder().delivery.pickup,
      fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], earliestDays: 1, maximumAdvanceDays: 14, unavailableDates: [], deliveryHours: { from: '09:00', to: '18:00' } } } } };
  const now = new Date(); const dates = Array.from({ length: 5 }, (_, index) => new Date(now.getTime() + (index + 2) * 86400000).toISOString().slice(0, 10));
  const products = dates.map((date, index) => ({ id: `meal-${index}`, storeId: 's', available: true, price: 10, name: 'Meal', optionGroupIds: [] }));
  const db = multiDb({ 'stores/s': store, ...Object.fromEntries(products.map(product => [`storeProducts/${product.id}`, product])) });
  let quotes = 0; let firstQuote;
  const provider = { environment: 'sandbox', createQuote: async request => {
    quotes++; firstQuote = { quotationId: 'checkout-quote', expiresAt: new Date(Date.now() + 300000).toISOString(), serviceType: 'MOTORCYCLE', priceBreakdown: { total: 7, currency: 'MYR' }, stops: request.data.stops, scheduleAt: request.data.scheduleAt }; return firstQuote;
  }, retrieveQuote: async () => firstQuote };
  const draft = { selections: products.map(product => ({ productId: product.id, quantity: 2 })), fulfilments: dates.map((date, index) => ({ date, time: '10:00', itemIndexes: [index] })), fulfilmentMode: 'preorder', destination: { formattedAddress: 'Customer', latitude: '4.7', longitude: '101.2' } };
  return { store, db, provider, draft, dates, quoteCount: () => quotes };
};

test('five-day checkout quotes earliest day exactly once, persists ×5 and binds all dates/address/cart', async () => {
  const fixture = quoteFixture();
  const result = await createStoreDeliveryQuote({ ...fixture, slug: 'test', draft: { ...fixture.draft, fulfilments: [...fixture.draft.fulfilments].reverse(), fulfilmentCount: 999, deliveryFee: 0 } });
  assert.equal(fixture.quoteCount(), 1); assert.equal(result.quote.customerDeliveryFee, 35); assert.equal(result.quote.fulfilmentCount, 5);
  assert.equal(result.schedule.date, fixture.dates[0]);
  const draft = { ...fixture.draft, deliveryQuoteId: result.quote.quotationId, deliveryPricingSnapshotId: result.pricingSnapshotId };
  const snapshot = fixture.db.documents[`storeDeliveryQuoteSnapshots/${result.pricingSnapshotId}`];
  assert.equal(snapshot.firstQuote.fee, 7); assert.equal(snapshot.finalDeliveryTotal, 35);
  await revalidateDeliveryForPayment({ ...fixture, draft });
  assert.equal(fixture.quoteCount(), 1);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...draft, fulfilments: draft.fulfilments.map((entry, index) => index === 4 ? { ...entry, time: '11:00' } : entry) } }), /schedule or delivery pricing/);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...draft, selections: draft.selections.map(selection => ({ ...selection, quantity: 3 })) } }), /schedule or delivery pricing/);
  await assert.rejects(revalidateDeliveryForPayment({ ...fixture, draft: { ...draft, destination: { ...draft.destination, formattedAddress: 'Other' } } }), /schedule or delivery pricing/);
});

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
