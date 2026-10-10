import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { createManualPaymentAdapter } from '../functions/paymentProviders/manualPayment.js';
import { cleanupGroupOrder } from '../functions/groupOrders.js';
import { updateStoreOrderFulfilment } from '../functions/storeFulfilment.js';
import { reviewManualStorePayment, submitManualStorePayment } from '../functions/storeManualPayments.js';
import { createStorePayment } from '../functions/storePayments.js';

const NOW = new Date('2026-08-21T16:30:00.000Z');
const TODAY_START = Timestamp.fromDate(new Date('2026-08-21T16:00:00.000Z'));
const TODAY_END = Timestamp.fromDate(new Date('2026-08-22T16:00:00.000Z'));

test('actual new-order writes remain queryable after Completed and Cancelled transitions', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required.');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `order-history-${process.pid}`);
  const db = getFirestore(app);
  const workspaceId = `order-history-${process.pid}`;
  const groupId = `${workspaceId}-group`;
  const slug = `${workspaceId}-store`;
  const ownerId = `${workspaceId}-owner`;
  const paymentMethod = {
    id: 'touch_n_go_qr', enabled: true, qrCodeUrl: 'data:image/png;base64,aA==',
    instructions: 'Upload proof.', name: 'Touch ’n Go eWallet', receiptAllowed: true
  };
  const store = {
    workspaceId, slug, name: 'Order History Integration Store', country: 'MY', currency: 'MYR',
    pickupEnabled: true, pickupOperatingHours: { start: '09:00', end: '18:00' }, pickupSessions: ['Breakfast'],
    pickupLocations: [{ id: 'counter', name: 'Main Counter', address: '', notes: '' }],
    orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    earliestPickupDays: 0, maximumAdvanceDays: 14, unavailableDates: [],
    paymentMethods: [paymentMethod],
    hostProgram: { enabled: true, rewardPercent: 5, minimumQualifyingSales: 0 }
  };
  const product = {
    storeId: workspaceId, workspaceId, name: 'Breakfast Set', photoUrl: '',
    price: 5.9, available: true, optionGroupIds: []
  };
  await Promise.all([
    db.collection('workspaces').doc(workspaceId).set({ ownerId, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
    db.collection('stores').doc(workspaceId).set(store),
    db.collection('storeProducts').doc(`${workspaceId}-product`).set(product),
    db.collection('groupOrders').doc(groupId).set({
      id: groupId,
      shareCode: `${workspaceId}-share`,
      workspaceId,
      storeId: workspaceId,
      storeSlug: slug,
      storeName: store.name,
      hostId: `${workspaceId}-host`,
      hostName: 'Test Host',
      name: 'Regression Group',
      pickupDate: '2026-08-22',
      pickupSession: 'Breakfast',
      pickupLocationId: 'counter',
      pickupLocationName: 'Main Counter',
      pickupLocationAddress: '',
      closesAt: Timestamp.fromDate(new Date('2026-08-22T10:00:00.000Z')),
      status: 'open',
      rewardPercent: 5,
      minimumQualifyingSales: 0,
      lifetimeOrderCount: 0,
      archived: false,
      orderCount: 0,
      eligibleSales: 0,
      estimatedReward: 0
    })
  ]);
  const adapter = createManualPaymentAdapter(paymentMethod);
  const draft = suffix => ({
    customerName: `Customer ${suffix}`, phone: '+60123456789', pickupDate: '2026-08-22', pickupTime: '10:00',
    pickupSession: 'Breakfast', pickupLocationId: 'counter', notes: '',
    paymentMethodId: paymentMethod.id,
    selections: [{ productId: `${workspaceId}-product`, quantity: 1, selectedOptions: [] }]
  });

  try {
    const completedResult = await createStorePayment({
      db,
      adapter,
      slug,
      draft: { ...draft('completed'), groupShareCode: `${workspaceId}-share` },
      now: NOW
    });
    const cancelledResult = await createStorePayment({ db, adapter, slug, draft: draft('cancelled'), now: NOW });
    const loadByNumber = async orderNumber => (await db.collection('storeOrders')
      .where('storeId', '==', workspaceId).where('orderNumber', '==', orderNumber).limit(1).get()).docs[0];
    const completedDocument = await loadByNumber(completedResult.orderNumber);
    const cancelledDocument = await loadByNumber(cancelledResult.orderNumber);

    assert.ok(completedDocument.data().createdAt instanceof Timestamp);
    assert.ok(cancelledDocument.data().createdAt instanceof Timestamp);
    assert.equal(completedDocument.data().fulfilmentStatus, 'New');
    assert.equal(cancelledDocument.data().fulfilmentStatus, 'New');
    assert.equal(cancelledDocument.data().pickupTime, '10:00');

    await completedDocument.ref.update({
      'payment.receiptPath': `store-payment-receipts/${workspaceId}/${completedDocument.id}/receipt-test.png`,
      'payment.receiptFileName': 'receipt-test.png'
    });
    await submitManualStorePayment({
      db,
      slug,
      orderId: completedDocument.id,
      checkoutAccessToken: completedResult.checkoutAccessToken
    });
    const groupBeforeConfirmation = (await db.collection('groupOrders').doc(groupId).get()).data();
    assert.equal(groupBeforeConfirmation.lifetimeOrderCount, 1);
    assert.equal(groupBeforeConfirmation.orderCount, 0);
    assert.equal(groupBeforeConfirmation.eligibleSales, 0);
    await reviewManualStorePayment({ db, uid: ownerId, orderId: completedDocument.id, decision: 'approve' });
    const repeatedConfirmation = await reviewManualStorePayment({
      db, uid: ownerId, orderId: completedDocument.id, decision: 'approve'
    });
    assert.equal(repeatedConfirmation.alreadyConfirmed, true);
    const paidDocument = await completedDocument.ref.get();
    assert.equal(paidDocument.data().status, 'Paid');
    assert.equal(paidDocument.data().payment.status, 'paid');
    const groupAfterConfirmation = (await db.collection('groupOrders').doc(groupId).get()).data();
    assert.equal(groupAfterConfirmation.orderCount, 1);
    assert.equal(groupAfterConfirmation.eligibleSales, 5.9);
    assert.equal(groupAfterConfirmation.estimatedReward, 0.3);
    const rewardLedger = (await db.collection('hostRewardLedger').doc(completedDocument.id).get()).data();
    assert.equal(rewardLedger.eligibleSales, 5.9);

    for (const nextStatus of ['Preparing', 'Ready', 'Completed']) {
      await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: completedDocument.id, nextStatus });
    }
    await updateStoreOrderFulfilment({
      db, uid: ownerId, orderId: cancelledDocument.id, nextStatus: 'Cancelled',
      cancellationReason: 'Customer requested cancellation'
    });

    const persistedCompleted = (await completedDocument.ref.get()).data();
    assert.equal(persistedCompleted.fulfilmentStatus, 'Completed');
    assert.equal(persistedCompleted.status, 'Paid');
    assert.equal(persistedCompleted.payment.status, 'paid');
    assert.ok(persistedCompleted.createdAt instanceof Timestamp);
    assert.ok(persistedCompleted.completedAt instanceof Timestamp);
    assert.equal(persistedCompleted.workspaceId, workspaceId);
    assert.equal(persistedCompleted.storeId, workspaceId);

    const completedOrders = await db.collection('storeOrders')
      .where('storeId', '==', workspaceId)
      .where('workspaceId', '==', workspaceId)
      .where('fulfilmentStatus', '==', 'Completed')
      .get();
    assert.ok(completedOrders.docs.some(document => document.id === completedDocument.id));

    const legacyReference = db.collection('storeOrders').doc(`${workspaceId}-legacy-created-at`);
    await legacyReference.set({
      ...persistedCompleted,
      id: legacyReference.id,
      orderNumber: 'MC-LEGACY-CREATED-AT',
      createdAt: NOW.toISOString()
    });

    const canonicalToday = await db.collection('storeOrders')
      .where('storeId', '==', workspaceId)
      .where('workspaceId', '==', workspaceId)
      .where('createdAt', '>=', TODAY_START)
      .where('createdAt', '<', TODAY_END)
      .orderBy('createdAt', 'desc')
      .get();
    const legacyToday = await db.collection('storeOrders')
      .where('storeId', '==', workspaceId)
      .where('workspaceId', '==', workspaceId)
      .where('createdAt', '>=', TODAY_START.toDate().toISOString())
      .where('createdAt', '<', TODAY_END.toDate().toISOString())
      .orderBy('createdAt', 'desc')
      .get();
    const states = new Map(
      [...canonicalToday.docs, ...legacyToday.docs]
        .map(document => [document.id, document.data().fulfilmentStatus])
    );
    assert.equal(states.get(completedDocument.id), 'Completed');
    assert.equal(states.get(cancelledDocument.id), 'Cancelled');
    assert.equal(states.get(legacyReference.id), 'Completed');

    const raceGroupId = `${workspaceId}-race-group`;
    const raceShareCode = `${workspaceId}-race-share`;
    await db.collection('groupOrders').doc(raceGroupId).set({
      ...(await db.collection('groupOrders').doc(groupId).get()).data(),
      id: raceGroupId,
      shareCode: raceShareCode,
      hostId: `${workspaceId}-host`,
      name: 'Checkout Delete Race',
      status: 'open',
      lifetimeOrderCount: 0,
      orderCount: 0,
      eligibleSales: 0,
      estimatedReward: 0
    });
    const raceResults = await Promise.allSettled([
      createStorePayment({
        db,
        adapter,
        slug,
        draft: { ...draft('race'), groupShareCode: raceShareCode },
        now: NOW
      }),
      cleanupGroupOrder({
        db,
        uid: `${workspaceId}-host`,
        groupId: raceGroupId,
        action: 'delete',
        now: NOW
      })
    ]);
    assert.equal(raceResults.filter(result => result.status === 'fulfilled').length, 1);
    const [raceGroupSnapshot, raceOrdersSnapshot] = await Promise.all([
      db.collection('groupOrders').doc(raceGroupId).get(),
      db.collection('storeOrders').where('groupOrder.id', '==', raceGroupId).get()
    ]);
    assert.equal(raceOrdersSnapshot.empty || raceGroupSnapshot.exists, true);
    if (raceGroupSnapshot.exists) {
      assert.equal(raceGroupSnapshot.data().lifetimeOrderCount, raceOrdersSnapshot.size);
    }
  } finally {
    await deleteApp(app);
  }
});

test('multi-day pickup creates one financial order/payment and checkout retries reuse it', async () => {
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `multi-order-${process.pid}`);
  const db = getFirestore(app); const workspaceId = `multi-order-${process.pid}`; const ownerId = `${workspaceId}-owner`;
  const paymentMethod = { id: 'touch_n_go_qr', enabled: true, qrCodeUrl: 'data:image/png;base64,aA==', instructions: 'Upload proof.', name: 'Touch ’n Go eWallet', receiptAllowed: true };
  const store = { workspaceId, slug: workspaceId, name: 'Multi Kitchen', country: 'MY', currency: 'MYR', pickupEnabled: true,
    pickupOperatingHours: { start: '09:00', end: '18:00' }, pickupSessions: ['Breakfast'], pickupLocations: [{ id: 'counter', name: 'Counter', address: '', notes: '' }],
    orderDays: ['monday','tuesday','wednesday','thursday','friday'], earliestPickupDays: 0, maximumAdvanceDays: 14, unavailableDates: [], paymentMethods: [paymentMethod] };
  await db.collection('stores').doc(workspaceId).set(store);
  await db.collection('workspaces').doc(workspaceId).set({ ownerId, subscriptionPlan: 'professional', subscriptionStatus: 'active' });
  for (const day of ['mon','fri']) await db.collection('storeProducts').doc(`${workspaceId}-${day}`).set({ storeId: workspaceId, workspaceId, name: `${day} meal`, available: true, availableDay: day === 'thu' ? 'tue' : day, price: 10, optionGroupIds: [] });
  const adapter = createManualPaymentAdapter(paymentMethod); const originalCreate = adapter.createPayment; let paymentsCreated = 0;
  adapter.createPayment = async (...args) => { paymentsCreated++; return originalCreate(...args); };
  const draft = { checkoutAttemptId: '95b3c233-9fe4-4f03-9677-2774106b5201', paymentMethodId: paymentMethod.id, customerName: 'Guest', phone: '+60123456789', pickupDate: '2026-08-24', pickupTime: '10:00', pickupLocationId: 'counter', pickupSession: 'Breakfast', notes: '',
    selections: [{ productId: `${workspaceId}-mon`, quantity: 2, selectedOptions: [] }, { productId: `${workspaceId}-fri`, quantity: 3, selectedOptions: [] }],
    fulfilments: [{ date: '2026-08-24', time: '10:00', itemIndexes: [0] }, { date: '2026-08-28', time: '11:00', itemIndexes: [1] }] };
  try {
    const result = await createStorePayment({ db, adapter, slug: workspaceId, draft, now: NOW });
    const replay = await createStorePayment({ db, adapter, slug: workspaceId, draft, now: NOW });
    assert.equal(result.orderNumber, replay.orderNumber); assert.equal(paymentsCreated, 1);
    const orders = await db.collection('storeOrders').where('storeId', '==', workspaceId).get();
    assert.equal(orders.size, 1); const ref = orders.docs[0].ref; const order = orders.docs[0].data();
    assert.equal(order.total, 50); assert.equal(order.items.length, 2); assert.equal(order.fulfilments.length, 2);
    await ref.update({ 'payment.status': 'paid', status: 'Paid' });
    await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Completed', fulfilmentId: order.fulfilments[0].id });
    assert.equal((await ref.get()).data().fulfilmentStatus, 'New');
    await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Completed', fulfilmentId: order.fulfilments[1].id });
    const completed = (await ref.get()).data();
    assert.equal(completed.fulfilmentStatus, 'Completed'); assert.deepEqual(completed.fulfilments, order.fulfilments); assert.equal(completed.total, 50);
    const completion = completed.fulfilmentCompletion;
    await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Completed', fulfilmentId: order.fulfilments[0].id });
    assert.deepEqual((await ref.get()).data().fulfilmentCompletion, completion);
  } finally { await deleteApp(app); }
});

test('Weekly delivery persists one payment, five fulfilments and immutable first quote ×5 through dispatch completion', async () => {
  const { createStoreDeliveryQuote, dispatchStoreDelivery, refreshStoreDelivery } = await import('../functions/storeDelivery.js');
  // The unchanged payment boundary uses the Functions default Firestore app.
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' });
  const db = getFirestore(app); const workspaceId = `weekly-delivery-${process.pid}`; const ownerId = `${workspaceId}-owner`;
  const now = new Date(); const monday = new Date(now.getTime() + 86400000);
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
  const dates = Array.from({ length: 5 }, (_, index) => new Date(monday.getTime() + index * 86400000).toISOString().slice(0,10));
  const days = ['mon','tue','wed','thu','fri'];
  const paymentMethod = { id: 'touch_n_go_qr', enabled: true, qrCodeUrl: 'data:image/png;base64,aA==', instructions: 'Upload proof.', name: 'Touch ’n Go eWallet', receiptAllowed: true };
  const pickup = { name: 'Kitchen', address: 'Kitchen address', latitude: '4.6', longitude: '101.1', contactName: 'Chef', contactPhoneE164: '+60123456789' };
  const store = { workspaceId, slug: workspaceId, name: 'Weekly delivery kitchen', country: 'MY', currency: 'MYR', pickupEnabled: true,
    pickupOperatingHours: { start: '09:00', end: '18:00' }, pickupLocations: [{ id: 'counter', name: 'Counter' }],
    orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 14, paymentMethods: [paymentMethod],
    delivery: { enabled: true, provider: 'lalamove', environment: 'sandbox', market: 'MY', serviceType: 'MOTORCYCLE', pickup,
      fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 14, earliestDays: 0, unavailableDates: [], deliveryHours: { from: '09:00', to: '18:00' } } } } };
  await db.collection('stores').doc(workspaceId).set(store);
  await db.collection('workspaces').doc(workspaceId).set({ ownerId, subscriptionPlan: 'professional', subscriptionStatus: 'active' });
  for (const day of days) await db.collection('storeProducts').doc(`${workspaceId}-${day}`).set({ storeId: workspaceId, workspaceId, name: `${day} meal`, available: true, availableDay: day === 'thu' ? 'tue' : day, price: 10, optionGroupIds: [] });
  const planId = `${workspaceId}-plan`;
  await db.collection('storeProducts').doc(planId).set({ storeId: workspaceId, workspaceId, name: 'Weekly Plan', productType: 'weekly_meal_plan', weeklyMeals: Object.fromEntries(days.map(day => [day, `${workspaceId}-${day}`])), available: true, price: 45, optionGroupIds: [] });
  let quoteCount = 0; let dispatchCount = 0; let firstQuote;
  const provider = { environment: 'sandbox', createQuote: async request => {
    quoteCount++;
    const quote = { quotationId: `quote-${quoteCount}`, expiresAt: new Date(Date.now()+300000).toISOString(), serviceType: 'MOTORCYCLE', priceBreakdown: { total: quoteCount === 1 ? 8.9 : 35, currency: 'MYR' }, stops: request.data.stops.map((stop,index) => ({ ...stop, stopId: `stop-${index}` })) };
    firstQuote ||= quote; return quote;
  }, retrieveQuote: async () => firstQuote,
    createOrder: async request => { dispatchCount++; return { orderId: `provider-${request.data.metadata.misechefFulfilmentId}`, status: 'ASSIGNING_DRIVER' }; },
    retrieveOrder: async ({ orderId }) => ({ orderId, status: 'COMPLETED', priceBreakdown: { total: 39, currency: 'MYR' } }) };
  const draft = { checkoutAttemptId: '53b3c233-9fe4-4f03-9677-2774106b5202', paymentMethodId: paymentMethod.id, customerName: 'Guest', phone: '+60123456789', pickupLocationId: 'counter', fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder',
    selections: [{ productId: planId, quantity: 2, selectedOptions: [] }], fulfilments: dates.map(date => ({ date, time: '13:30', itemIndexes: [0] })),
    destination: { formattedAddress: 'Customer address', latitude: '4.7', longitude: '101.2' } };
  const adapter = createManualPaymentAdapter(paymentMethod); const originalCreate = adapter.createPayment; let paymentCount = 0;
  adapter.createPayment = async (...args) => { paymentCount++; return originalCreate(...args); };
  try {
    const quote = await createStoreDeliveryQuote({ db, provider, slug: workspaceId, draft });
    assert.equal(quoteCount, 1); assert.equal(quote.quote.customerDeliveryFee, 44.5);
    const checkoutDraft = { ...draft, deliveryQuoteId: quote.quote.quotationId, deliveryPricingSnapshotId: quote.pricingSnapshotId };
    const result = await createStorePayment({ db, adapter, deliveryProvider: provider, slug: workspaceId, draft: checkoutDraft, now });
    const retry = await createStorePayment({ db, adapter, deliveryProvider: provider, slug: workspaceId, draft: checkoutDraft, now });
    assert.equal(result.orderNumber, retry.orderNumber); assert.equal(paymentCount, 1); assert.equal(quoteCount, 1);
    const orders = await db.collection('storeOrders').where('storeId', '==', workspaceId).get(); assert.equal(orders.size, 1);
    const ref = orders.docs[0].ref; const initial = orders.docs[0].data();
    assert.equal(initial.items.length, 1); assert.equal(initial.fulfilments.length, 5); assert.equal(initial.total, 134.5);
    assert.ok(initial.fulfilments.every(entry => entry.time === '13:30'));
    assert.equal(initial.items[0].weeklyPlanSnapshot.meals[3].productId, `${workspaceId}-thu`);
    assert.equal(initial.deliveryPricingSnapshot.fulfilmentCount, 5); assert.equal(initial.deliveryPricingSnapshot.finalDeliveryTotal, 44.5);
    await ref.update({ 'payment.status': 'paid', status: 'Paid' });
    for (const [index, day] of initial.fulfilments.entries()) {
      await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Ready', fulfilmentId: day.id });
      await Promise.all([dispatchStoreDelivery({ db, provider, uid: ownerId, orderId: ref.id, fulfilmentId: day.id }), dispatchStoreDelivery({ db, provider, uid: ownerId, orderId: ref.id, fulfilmentId: day.id })]);
      await refreshStoreDelivery({ db, provider, uid: ownerId, orderId: ref.id, fulfilmentId: day.id });
      const order = (await ref.get()).data();
      assert.equal(order.fulfilmentStatus, index === 4 ? 'Completed' : 'New');
      assert.equal(order.total, initial.total); assert.deepEqual(order.totals, initial.totals); assert.deepEqual(order.deliveryPricingSnapshot, initial.deliveryPricingSnapshot);
      assert.equal(order.payment.amountMinor, initial.payment.amountMinor);
    }
    assert.equal(dispatchCount, 5); assert.equal(paymentCount, 1); assert.equal(quoteCount, 6); // One checkout quote plus five operational dispatch quotes.
  } finally { await deleteApp(app); }
});
