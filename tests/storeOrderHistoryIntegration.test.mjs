import { createExternalPosOrder } from '../functions/externalPosOrders.js';
import { saveManualPosOrder, confirmManualPosPayment } from '../functions/manualPosOrders.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { createManualPaymentAdapter } from '../functions/paymentProviders/manualPayment.js';
import { cleanupGroupOrder } from '../functions/groupOrders.js';
import { updateStoreOrderFulfilment } from '../functions/storeFulfilment.js';
import { reviewManualStorePayment, submitManualStorePayment } from '../functions/storeManualPayments.js';
import { createStorePayment } from '../functions/storePayments.js';
import { createHash } from 'node:crypto';

const NOW = new Date('2026-08-21T16:30:00.000Z');
const TODAY_START = Timestamp.fromDate(new Date('2026-08-21T16:00:00.000Z'));
const TODAY_END = Timestamp.fromDate(new Date('2026-08-22T16:00:00.000Z'));

test('historical Curlec attempt foundation is audit-only under concurrent deliveries and isolated across modes', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required.');
  const { handleStorePaymentWebhook, reconcileStorePayment } = await import('../functions/storePayments.js');
  const { createCurlecPaymentLinkAdapter, weeklyPosCurlecReference } = await import('../functions/paymentProviders/curlecPaymentLink.js');
  const { verifyHistoricalCurlecPayment } = await import('../functions/curlecAttemptSafety.js');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `attempt-safety-${process.pid}`);
  const db = getFirestore(app);
  try {
    for (const mode of ['test', 'live']) {
      const ref = db.collection('storeOrders').doc();
      const id = createHash('sha256').update(`phase1:${ref.id}`).digest('hex');
      const attemptRef = db.collection('storeCheckoutAttempts').doc(id);
      const key = `rzp_${mode}_Phase1Fixture`;
      const fingerprint = createHash('sha256').update(key).digest('hex');
      const oldLinkId = `plink_Phase1${ref.id}`;
      const transactionId = `pay_Phase1${ref.id}`;
      const attempt = { orderId: ref.id, storeId: 'phase1-store', provider: 'curlec', mode: 'payment_link', revision: 1,
        amountMinor: 1290, currency: 'MYR', expiresAt: 1795002226, merchantFingerprint: fingerprint,
        providerPaymentId: oldLinkId, ...(mode === 'test' ? { curlecEnvironment: mode } : {}) };
      const current = { id: ref.id, storeId: 'phase1-store', workspaceId: 'phase1-workspace', weeklyDayPos: true,
        manualOrder: { revision: 2 }, weeklyPosLink: { attemptId: 'b'.repeat(64), expiresAt: 1795010000 },
        payment: { provider: 'curlec', providerMode: 'payment_link', providerPaymentId: `plink_New${ref.id}`,
          status: 'pending', amountMinor: 1500, ...(mode === 'test' ? { curlecEnvironment: mode } : {}) },
        currency: 'MYR', fulfilmentStatus: 'New', notes: 'Private notes must not appear in audit' };
      const link = { id: oldLinkId, amount: 1290, amount_paid: 1290, currency: 'MYR', status: 'paid',
        reference_id: weeklyPosCurlecReference(id), expire_by: attempt.expiresAt, accept_partial: false,
        customer: { email: 'private@example.test' }, short_url: 'https://rzp.io/private',
        notes: { misechefOrderId: ref.id, misechefWeeklyPosAttemptId: id, misechefOrderRevision: '1' },
        payments: [{ payment_id: transactionId, amount: 1290, status: 'captured' }] };
      const capture = { id: transactionId, amount: 1290, currency: 'MYR', captured: true, status: 'captured', method: 'fpx' };
      let requests = 0;
      const adapter = { ...createCurlecPaymentLinkAdapter(key, 'fake-secret', { fetchImpl: async (url, options) => {
        assert.ok(!options.method || options.method === 'GET'); requests++;
        if (url.endsWith(`/payment_links/${oldLinkId}`)) return new Response(JSON.stringify(link));
        if (url.endsWith(`/payments/${transactionId}`)) return new Response(JSON.stringify(capture));
        throw new Error('Unexpected provider operation');
      } }), curlecEnvironment: mode };
      const event = { event: 'payment_link.paid', type: 'payment_link.paid',
        payload: { payment_link: { entity: link }, payment: { entity: capture } } };
      await Promise.all([ref.create(current), attemptRef.create(attempt)]);
      const beforeOrder = (await ref.get()).data(); const beforeAttempt = (await attemptRef.get()).data();
      await Promise.all(Array.from({ length: 6 }, (_, i) => handleStorePaymentWebhook({ db, adapter,
        event: { ...event, id: `phase1-${ref.id}-${i % 2}` } })));
      const audits = await db.collection('storePaymentAttemptVerifications').where('orderId', '==', ref.id).get();
      assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().financialEffect, 'none');
      assert.equal(audits.docs[0].data().mode, mode);
      assert.doesNotMatch(JSON.stringify(audits.docs[0].data()), /private@example|Private notes|https:|fake-secret/);
      assert.deepEqual((await ref.get()).data(), beforeOrder); assert.deepEqual((await attemptRef.get()).data(), beforeAttempt);
      assert.equal((await db.collection('storeOrderTimeline').where('orderId', '==', ref.id).get()).size, 0);
      assert.equal((await db.collection('storeNotifications').where('orderId', '==', ref.id).get()).size, 0);
      const baselineRequests = requests;
      await assert.rejects(handleStorePaymentWebhook({ db, adapter: { ...adapter, curlecEnvironment: mode === 'test' ? 'live' : 'test' },
        event: { ...event, id: `phase1-cross-mode-${ref.id}` } }), /saved attempt/);
      assert.equal(requests, baselineRequests);
      const normalized = adapter.readWebhookUpdate(event).payment;
      await assert.rejects(reconcileStorePayment({ db, payment: { ...normalized, curlecEnvironment: mode } }), /no server verification/);
      const verified = await verifyHistoricalCurlecPayment({ db, adapter, order: current, payment: normalized });
      await attemptRef.update({ expiresAt: attempt.expiresAt + 1 });
      await assert.rejects(reconcileStorePayment({ db, payment: verified }), /saved attempt/);
      assert.deepEqual((await ref.get()).data(), beforeOrder);
    }
  } finally { await deleteApp(app); }
});

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
      pickupDate: '2026-08-23',
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
    customerName: `Customer ${suffix}`, phone: '+60123456789', pickupDate: '2026-08-23', pickupTime: '10:00',
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
    for (const nextStatus of ['Preparing', 'Ready']) await updateStoreOrderFulfilment({db, uid: ownerId, orderId: ref.id, nextStatus, fulfilmentId: order.fulfilments[0].id});
    await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Completed', fulfilmentId: order.fulfilments[0].id });
    assert.equal((await ref.get()).data().fulfilmentStatus, 'New');
    for (const nextStatus of ['Preparing', 'Ready']) await updateStoreOrderFulfilment({db, uid: ownerId, orderId: ref.id, nextStatus, fulfilmentId: order.fulfilments[1].id});
    await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Completed', fulfilmentId: order.fulfilments[1].id });
    const completed = (await ref.get()).data();
    assert.equal(completed.fulfilmentStatus, 'Completed'); assert.deepEqual(completed.fulfilments, order.fulfilments); assert.equal(completed.total, 50);
    const completion = completed.fulfilmentCompletion;
    await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Completed', fulfilmentId: order.fulfilments[0].id });
    assert.deepEqual((await ref.get()).data().fulfilmentCompletion, completion);
  } finally { await deleteApp(app); }
});

test('Weekly delivery persists one payment, five fulfilments and immutable per-day quote sum through dispatch completion', async () => {
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
  let quoteCount = 0; let dispatchCount = 0; let firstQuote; const checkoutQuotes = new Map();
  const provider = { environment: 'sandbox', createQuote: async request => {
    quoteCount++;
    const quote = { quotationId: `quote-${quoteCount}`, expiresAt: new Date(Date.now()+300000).toISOString(), serviceType: 'MOTORCYCLE', priceBreakdown: { total: quoteCount <= 5 ? 8.9 : 11, currency: 'MYR' }, stops: request.data.stops.map((stop,index) => ({ ...stop, stopId: `stop-${index}` })) };
    firstQuote ||= quote; checkoutQuotes.set(quote.quotationId, quote); return quote;
  }, retrieveQuote: async ({ quotationId }) => checkoutQuotes.get(quotationId),
    createOrder: async request => { dispatchCount++; return { orderId: `provider-${request.data.metadata.misechefFulfilmentId}`, status: 'ASSIGNING_DRIVER' }; },
    retrieveOrder: async ({ orderId }) => ({ orderId, status: 'COMPLETED', priceBreakdown: { total: 39, currency: 'MYR' } }) };
  const draft = { checkoutAttemptId: '53b3c233-9fe4-4f03-9677-2774106b5202', paymentMethodId: paymentMethod.id, customerName: 'Guest', phone: '+60123456789', pickupLocationId: 'counter', fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder',
    selections: [{ productId: planId, quantity: 2, selectedOptions: [] }], fulfilments: dates.map(date => ({ date, time: '13:30', itemIndexes: [0] })),
    destination: { formattedAddress: 'Customer address', latitude: '4.7', longitude: '101.2' } };
  const adapter = createManualPaymentAdapter(paymentMethod); const originalCreate = adapter.createPayment; let paymentCount = 0;
  adapter.createPayment = async (...args) => { paymentCount++; return originalCreate(...args); };
  try {
    const quote = await createStoreDeliveryQuote({ db, provider, slug: workspaceId, draft });
    assert.equal(quoteCount, 5); assert.equal(quote.quote.customerDeliveryFee, 44.5);
    const checkoutDraft = { ...draft, deliveryQuoteId: quote.quote.quotationId, deliveryPricingSnapshotId: quote.pricingSnapshotId };
    const result = await createStorePayment({ db, adapter, deliveryProvider: provider, slug: workspaceId, draft: checkoutDraft, now });
    const retry = await createStorePayment({ db, adapter, deliveryProvider: provider, slug: workspaceId, draft: checkoutDraft, now });
    assert.equal(result.orderNumber, retry.orderNumber); assert.equal(paymentCount, 1); assert.equal(quoteCount, 5);
    const orders = await db.collection('storeOrders').where('storeId', '==', workspaceId).get(); assert.equal(orders.size, 1);
    const ref = orders.docs[0].ref; const initial = orders.docs[0].data();
    assert.equal(initial.items.length, 1); assert.equal(initial.fulfilments.length, 5); assert.equal(initial.total, 134.5);
    assert.ok(initial.fulfilments.every(entry => entry.time === '13:30'));
    assert.equal(initial.items[0].weeklyPlanSnapshot.meals[3].productId, `${workspaceId}-thu`);
    assert.equal(initial.deliveryPricingSnapshot.fulfilmentCount, 5); assert.equal(initial.deliveryPricingSnapshot.finalDeliveryTotal, 44.5);
    await ref.update({ 'payment.status': 'paid', status: 'Paid' });
    for (const [index, day] of initial.fulfilments.entries()) {
      await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Preparing', fulfilmentId: day.id });
      await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: ref.id, nextStatus: 'Ready', fulfilmentId: day.id });
      await Promise.all([dispatchStoreDelivery({ db, provider, uid: ownerId, orderId: ref.id, fulfilmentId: day.id }), dispatchStoreDelivery({ db, provider, uid: ownerId, orderId: ref.id, fulfilmentId: day.id })]);
      await refreshStoreDelivery({ db, provider, uid: ownerId, orderId: ref.id, fulfilmentId: day.id });
      const order = (await ref.get()).data();
      assert.equal(order.fulfilmentStatus, index === 4 ? 'Completed' : 'New');
      assert.equal(order.total, initial.total); assert.deepEqual(order.totals, initial.totals); assert.deepEqual(order.deliveryPricingSnapshot, initial.deliveryPricingSnapshot);
      assert.equal(order.payment.amountMinor, initial.payment.amountMinor);
    }
    assert.equal(dispatchCount, 5); assert.equal(paymentCount, 1); assert.equal(quoteCount, 10); // Five checkout quotes plus five operational dispatch quotes.
  } finally { await deleteApp(app); }
});

test('manual multi-day order transactions serialize duplicate saves, edits, payment confirmations and daily Prepare', async () => {
  const app = initializeApp({projectId:'demo-misechef-store-payment-rules'},`manual-pos-${process.pid}`); const db=getFirestore(app);
  const workspaceId=`manual-pos-${process.pid}`, uid=`${workspaceId}-owner`, now=new Date('2026-10-18T04:00:00Z');
  const store={id:workspaceId,workspaceId,name:'GG Grab&Go',currency:'MYR',country:'MY',orderDays:['monday','tuesday','wednesday','thursday','friday'],maximumAdvanceDays:30,earliestPickupDays:0,pickupOperatingHours:{start:'09:00',end:'18:00'}};
  const products=[{id:'prawn',storeId:workspaceId,workspaceId,name:'Vietnam Prawn Noodle Salad',price:15,available:true,optionGroupIds:[]},{id:'burrito',storeId:workspaceId,workspaceId,name:'Chicken Burrito Bowl',price:18,available:true,optionGroupIds:[]}];
  const input={workspaceId,storeId:workspaceId,slug:'qa',requestId:'integration-request-123456',source:'phone',customerName:'Py',phone:'0164209116',lines:[
    {selection:{productId:'prawn',selectedOptions:[]},quantity:1,date:'2026-10-19',time:'12:00',method:'pickup'},
    {selection:{productId:'burrito',selectedOptions:[]},quantity:2,date:'2026-10-20',time:'12:00',method:'pickup'},
    {custom:{name:'Off-menu soup',unitPrice:5,savePrivate:true},quantity:1,date:'2026-10-20',time:'12:00',method:'pickup',notes:'No salt'}]};
  await db.collection('workspaces').doc(workspaceId).set({ownerId:uid,subscriptionPlan:'professional',subscriptionStatus:'active'});
  try {
    const args={db,uid,input,now,loadCheckout:async()=>({store,products,optionGroups:[],sets:[]})};
    const results=await Promise.all([saveManualPosOrder(args),saveManualPosOrder(args)]);
    assert.equal(results[0].orderId,results[1].orderId);
    const ref=db.collection('storeOrders').doc(results[0].orderId), before=(await ref.get()).data();
    assert.equal((await db.collection('storeOrders').where('storeId','==',workspaceId).get()).size,1);
    assert.equal(before.total,56);assert.equal(before.payment.status,'pending');assert.equal(before.fulfilments.length,2);
    await assert.rejects(updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus:'Preparing',fulfilmentId:before.fulfilments[0].id}));
    const confirmation={orderId:ref.id,expectedRevision:1,amountMinor:5600,method:'cash',reference:'QA cash received',received:true};
    const payments=await Promise.all([confirmManualPosPayment({db,uid,input:confirmation,now}),confirmManualPosPayment({db,uid,input:confirmation,now})]);
    assert.equal(payments.filter(r=>r.duplicate).length,1);
    assert.equal((await db.collection('storeOrderTimeline').where('orderId','==',ref.id).where('type','==','payment_received').get()).size,1);
    const first=before.fulfilments[0].id,second=before.fulfilments[1].id;
    await assert.rejects(updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus:'Completed',fulfilmentId:first}));
    await Promise.all([updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus:'Preparing',fulfilmentId:first}),updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus:'Preparing',fulfilmentId:first})]);
    for(const nextStatus of ['Ready','Completed']) await updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus,fulfilmentId:first});
    const after=(await ref.get()).data();
    assert.equal(after.fulfilmentStatus,'New');assert.equal(after.fulfilmentOperations[second],undefined);assert.equal(after.fulfilmentCompletion[second],undefined);
    assert.deepEqual(after.items,before.items);assert.deepEqual(after.totals,before.totals);assert.equal(after.payment.amountMinor,5600);
    await assert.rejects(updateStoreOrderFulfilment({db,uid:'foreign',orderId:ref.id,nextStatus:'Ready',fulfilmentId:second}));
    await Promise.all([1,2].map(()=>updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus:'Ready',fulfilmentId:second})));
    const directReady=(await ref.get()).data();
    assert.equal(directReady.fulfilmentOperations[second].kitchenStatus,'Ready');
    assert.deepEqual(directReady.fulfilmentOperations[first],after.fulfilmentOperations[first]);
    assert.deepEqual(directReady.fulfilmentCompletion,after.fulfilmentCompletion);
    assert.deepEqual(directReady.payment,after.payment);assert.deepEqual(directReady.items,after.items);assert.deepEqual(directReady.totals,after.totals);
    await assert.rejects(saveManualPosOrder({...args,input:{...input,orderId:ref.id,expectedRevision:1,requestId:'edit-after-paid-123456'}}));
    assert.equal((await db.collection('storePrivatePosItems').where('workspaceId','==',workspaceId).get()).size,1);
    assert.equal((await db.collection('storeProducts').where('workspaceId','==',workspaceId).get()).size,0);
  } finally {await deleteApp(app);}
});

test('ShopeeFood platform-paid and immediate Walk-in remain server-priced and operational',async()=>{
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`external-pos-${process.pid}`),db=getFirestore(app);
 const workspaceId=`external-pos-${process.pid}`,uid=`${workspaceId}-owner`,slug=workspaceId;
 try {
 await db.collection('workspaces').doc(workspaceId).set({ownerId:uid,subscriptionPlan:'professional',subscriptionStatus:'active'});
 await db.collection('stores').doc(workspaceId).set({workspaceId,slug,name:'GG Grab&Go',currency:'MYR'});
 await db.collection('storeProducts').doc(`${workspaceId}-rice`).set({workspaceId,storeId:workspaceId,name:'Rice',price:10,available:true,optionGroupIds:[]});
 for(const [source,paymentLabel] of [['shopeefood','shopeefood_platform_paid'],['walk_in','walk_in_paid'],['other','other_paid'],['whatsapp','other_paid']]) {
  const input={workspaceId,storeId:workspaceId,slug,source,paymentLabel,externalOrderNumber:`${source}-QA`,customerName:'',phone:'',selections:[{productId:`${workspaceId}-rice`,quantity:2,selectedOptions:[],unitPrice:1}]};
  const result=await createExternalPosOrder({db,uid,input});const duplicate=await createExternalPosOrder({db,uid,input});assert.equal(result.orderId,duplicate.orderId);
  const ref=db.collection('storeOrders').doc(result.orderId),order=(await ref.get()).data();assert.equal(order.payment.status,'paid');assert.equal(order.phone,'');assert.equal(order.externalOrder.externalOrderNumber,`${source}-QA`);assert.equal(order.paymentMethodId,paymentLabel);assert.equal(order.total,20);assert.equal(order.fulfilments,undefined);
  await updateStoreOrderFulfilment({db,uid,orderId:ref.id,nextStatus:'Preparing'});assert.equal((await ref.get()).data().fulfilmentStatus,'Preparing');
 }
 } finally {await deleteApp(app);}
});

test('external orders without a platform reference deduplicate concurrent retries and reject changed payload reuse',async()=>{
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`external-retry-${process.pid}`),db=getFirestore(app);
 const workspaceId=`external-retry-${process.pid}`,uid=`${workspaceId}-owner`,slug=workspaceId;
 try {
  await db.collection('workspaces').doc(workspaceId).set({ownerId:uid,subscriptionPlan:'professional',subscriptionStatus:'active'});
  await db.collection('stores').doc(workspaceId).set({workspaceId,slug,name:'QA Store',currency:'MYR'});
  await db.collection('storeProducts').doc(`${workspaceId}-rice`).set({workspaceId,storeId:workspaceId,name:'Rice',price:11,available:true,optionGroupIds:[]});
  const input={workspaceId,storeId:workspaceId,slug,source:'shopeefood',paymentLabel:'shopeefood_platform_paid',requestId:'external-retry-request-12345',customerName:'',phone:'',selections:[{productId:`${workspaceId}-rice`,quantity:2,selectedOptions:[]}]};
  const results=await Promise.all([1,2,3].map(()=>createExternalPosOrder({db,uid,input})));
  assert.equal(new Set(results.map(result=>result.orderId)).size,1);
  const orders=await db.collection('storeOrders').where('workspaceId','==',workspaceId).get();assert.equal(orders.size,1);
  const order=orders.docs[0].data();assert.equal(order.total,22);assert.equal(order.payment.status,'paid');assert.equal(order.phone,'');
  await assert.rejects(createExternalPosOrder({db,uid,input:{...input,selections:[{...input.selections[0],quantity:3}]}}),/different order details/);
  await assert.rejects(createExternalPosOrder({db,uid:'unauthorized-operator',input}),/role cannot/);
 } finally {await deleteApp(app);}
});

test('legacy delivery compatibility preserves a DV47-shaped paid order through Ready and one concurrent booking',async()=>{
 const {deliveryOrderCase}=await import('../functions/fixtures/deliveryOrderCase.js');
 const {previewMerchantDelivery,confirmMerchantDelivery}=await import('../functions/storeManualDelivery.js');
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`delivery-compat-${process.pid}`),db=getFirestore(app);
 const workspaceId=`delivery-compat-${process.pid}`,ownerId=`${workspaceId}-owner`,orderId=`${workspaceId}-order`;
 const order={...deliveryOrderCase(),id:orderId,workspaceId,storeId:workspaceId};
 try {
  await db.collection('workspaces').doc(workspaceId).set({ownerId,subscriptionPlan:'professional',subscriptionStatus:'active'});
  const ref=db.collection('storeOrders').doc(orderId);await ref.set(order);
  let quotes = 0;
  let bookings = 0;
  let reviewedQuote;
  const provider = {
    environment: 'sandbox',
    createQuote: async request => {
      quotes++;
      assert.equal(request.data.stops[1].address, order.delivery.recipient.address);
      reviewedQuote = {
        quotationId: 'fake-fresh-quote', expiresAt: new Date(Date.now() + 300000).toISOString(),
        serviceType: 'MOTORCYCLE', priceBreakdown: { total: 9, currency: 'MYR' },
        stops: request.data.stops.map((stop, index) => ({ ...stop, stopId: `fake-${index}` })),
      };
      return reviewedQuote;
    },
    retrieveQuote: async ({ quotationId }) => {
      assert.equal(quotationId, reviewedQuote.quotationId);
      return reviewedQuote;
    },
    createOrder: async request => {
      bookings++;
      assert.equal(request.data.quotationId, reviewedQuote.quotationId);
      assert.equal(request.data.recipients[0].phone, '+60123456789');
      return { orderId: 'fake-booking', status: 'ASSIGNING_DRIVER' };
    },
  };
  const args={db,provider,uid:ownerId,orderId,fulfilmentId:'day_20261022'};
  await assert.rejects(previewMerchantDelivery(args),/Ready/);assert.equal(quotes,0);
  await assert.rejects(updateStoreOrderFulfilment({db,uid:ownerId,orderId,nextStatus:'Ready',fulfilmentId:'day_20261022'}),/Preparing before Ready/);
  await updateStoreOrderFulfilment({db,uid:ownerId,orderId,nextStatus:'Preparing',fulfilmentId:'day_20261022'});
  await updateStoreOrderFulfilment({db,uid:ownerId,orderId,nextStatus:'Ready',fulfilmentId:'day_20261022'});
  const preview=await previewMerchantDelivery(args);assert.equal(bookings,0);
  await Promise.all([confirmMerchantDelivery({...args,previewId:preview.id,confirmed:true}),confirmMerchantDelivery({...args,previewId:preview.id,confirmed:true})]);
  assert.equal(quotes,1);assert.equal(bookings,1);
  const saved=(await ref.get()).data();
  for(const key of ['phone','customerName','fulfilments','payment','delivery','totals','total'])assert.deepEqual(saved[key],order[key]);
  assert.equal(saved.fulfilmentOperations.day_20261022.providerOrder.orderId,'fake-booking');
 } finally {await deleteApp(app);}
});

import "./memberPromotionCodes.integration.mjs";


test('external delivery confirmation is concurrent-idempotent, optional-contact and never calls Lalamove',async()=>{
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`external-delivery-${process.pid}`),db=getFirestore(app);
 const workspaceId=`external-delivery-${process.pid}`,uid=`${workspaceId}-owner`,slug=workspaceId;
 let providerCalls=0;
 const deliveryProvider=new Proxy({}, {get:()=>()=>{providerCalls++;throw new Error('Must never call Lalamove');}});
 try {
  await db.collection('workspaces').doc(workspaceId).set({ownerId:uid,subscriptionPlan:'professional',subscriptionStatus:'active'});
  await db.collection('stores').doc(workspaceId).set({workspaceId,slug,name:'QA External Delivery',currency:'MYR',orderDays:['monday','tuesday','wednesday','thursday','friday'],earliestPickupDays:0,maximumAdvanceDays:30,unavailableDates:[]});
  await db.collection('storeProducts').doc(`${workspaceId}-rice`).set({workspaceId,storeId:workspaceId,name:'Rice',price:11,available:true,optionGroupIds:[]});
  const now=new Date('2026-10-18T04:00:00Z');
  for(const source of ['shopeefood','whatsapp','walk_in','other']) {
   const input={workspaceId,storeId:workspaceId,slug,source,paymentLabel:source==='shopeefood'?'shopeefood_platform_paid':source==='walk_in'?'walk_in_paid':'other_paid',requestId:`external-delivery-${source}-123456`,customerName:'',phone:'',fulfilmentMethod:'delivery',deliveryAddress:'Unit 12, Full delivery address',deliveryFeeOverride:{amount:0,reason:'Historical external platform delivery included; provider quotation unavailable'},fulfilmentDate:'2026-10-20',fulfilmentTime:'13:17',selections:[{productId:`${workspaceId}-rice`,quantity:2,selectedOptions:[]},{productId:`${workspaceId}-rice`,quantity:1,selectedOptions:[]}],lineSchedules:[{date:'2026-10-19',time:'12:13'},{date:'',time:''}]};
   const results=await Promise.all([1,2].map(()=>createExternalPosOrder({db,uid,input,deliveryProvider,now})));
   assert.equal(new Set(results.map(result=>result.orderId)).size,1);
   const order=(await db.collection('storeOrders').doc(results[0].orderId).get()).data();
   assert.equal(order.fulfilmentMethod,'delivery');assert.equal(order.phone,'');assert.equal(order.total,33);assert.equal(order.payment.status,'paid');assert.equal(order.totals.discountTotal,0);
   assert.deepEqual(order.fulfilments.map(day=>[day.date,day.time,day.method]),[['2026-10-19','12:13','delivery'],['2026-10-20','13:17','delivery']]);
   assert.equal(order.delivery.recipient.address,input.deliveryAddress);assert.equal(order.delivery.providerOrder,undefined);
   for(const day of order.fulfilments) for(const nextStatus of ['Preparing','Ready','Completed']) await updateStoreOrderFulfilment({db,uid,orderId:order.id,fulfilmentId:day.id,nextStatus});
   const completed=(await db.collection('storeOrders').doc(order.id).get()).data();
   assert.equal(completed.fulfilmentStatus,'Completed');assert.deepEqual(completed.payment,order.payment);assert.deepEqual(completed.totals,order.totals);assert.deepEqual(completed.items,order.items);
   await assert.rejects(createExternalPosOrder({db,uid,input:{...input,deliveryAddress:'Changed address'},now}),/different order details/);
   await assert.rejects(createExternalPosOrder({db,uid,input:{...input,fulfilmentMethod:'pickup'},now}),/different order details/);
  }
  assert.equal(providerCalls,0);
  assert.equal((await db.collection('storeOrders').where('workspaceId','==',workspaceId).get()).size,4);
 } finally {await deleteApp(app);}
});

test('POS delivery checkout uses stored quote totals, rejects stale/forged fees, and audits historical Manager overrides',async()=>{
 const {createPosDeliveryQuote}=await import('../functions/posDeliveryQuotes.js');
 const {loadStoreCheckoutData}=await import('../functions/storePayments.js');
 const {assertOperator}=await import('../functions/externalPosOrders.js');
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`pos-delivery-quote-${process.pid}`),db=getFirestore(app);
 const workspaceId=`pos-delivery-quote-${process.pid}`,uid=`${workspaceId}-owner`,manager=`${workspaceId}-manager`,chef=`${workspaceId}-chef`;
 try{
  await db.collection('workspaces').doc(workspaceId).set({ownerId:uid,subscriptionPlan:'professional',subscriptionStatus:'active'});
  for(const [userId,role]of[[manager,'Manager'],[chef,'Chef']])await db.collection('workspaceMembers').doc(`${workspaceId}_${userId}`).set({workspaceId,userId,status:'Active',role});
  await db.collection('stores').doc(workspaceId).set({workspaceId,slug:workspaceId,name:'Disposable delivery Store',currency:'MYR',pickupLocations:[{id:'counter',name:'Counter',address:'QA pickup'}],delivery:{enabled:true,provider:'lalamove',environment:'sandbox',market:'MY',serviceType:'MOTORCYCLE',pickup:{address:'QA pickup',latitude:'4.6',longitude:'101.1'},freeDelivery:{enabled:false}}});
  await db.collection('storeProducts').doc(`${workspaceId}-meal`).set({workspaceId,storeId:workspaceId,name:'QA meal',price:12,available:true,optionGroupIds:[]});
  const input={workspaceId,storeId:workspaceId,slug:workspaceId,source:'whatsapp',paymentLabel:'other_paid',requestId:'pos-quoted-request-12345',fulfilmentMethod:'delivery',fulfilmentDate:'2099-01-01',fulfilmentTime:'00:01',deliveryAddress:'Corrected QA address',destination:{placeId:'qa-place',formattedAddress:'Corrected QA address',latitude:'0',longitude:'0'},selections:[{productId:`${workspaceId}-meal`,quantity:2,selectedOptions:[]}],total:1,deliveryFee:0};
  let bookings=0;
  const provider={environment:'sandbox',createQuote:async()=>({quotationId:'qa-quote',expiresAt:new Date(Date.now()+300000).toISOString(),serviceType:'MOTORCYCLE',priceBreakdown:{total:9.5,currency:'MYR'},stops:[]}),createOrder:()=>{bookings++;}};
  const quote=await createPosDeliveryQuote({db,uid:manager,input,provider,authorize:assertOperator,loadCheckout:loadStoreCheckoutData,resolvePlace:async()=>({latitude:4.61,longitude:101.11})});
  const args={db,uid:manager,input:{...input,posDeliveryQuoteId:quote.id}};
  const result=await createExternalPosOrder(args);
  const saved=(await db.collection('storeOrders').doc(result.orderId).get()).data();
  assert.equal(saved.total,33.5);assert.equal(saved.payment.amountMinor,3350);assert.equal(saved.payment.status,'paid');assert.equal(saved.totals.deliveryFee,9.5);assert.equal(saved.posDeliveryPricing.providerDeliveryFee,9.5);assert.equal(saved.delivery.arrangedExternally,true);assert.equal(saved.fulfilments[0].destination.latitude,'4.61');assert.equal(bookings,0);
  assert.equal((await createExternalPosOrder(args)).orderId,result.orderId);
  await assert.rejects(createExternalPosOrder({...args,input:{...args.input,requestId:'pos-changed-request-12345',fulfilmentTime:'00:02'}}),/changed/);
  await db.collection('storePosDeliveryQuotes').doc(quote.id).update({expiresAt:new Date(Date.now()-1).toISOString()});
  await assert.rejects(createExternalPosOrder({...args,input:{...args.input,requestId:'pos-expired-request-12345'}}),/expired/);
  const historical={...input,paymentLabel:undefined,historicalReason:'Historical delivery record',expectedSubtotalMinor:2400,requestId:'pos-manual-request-12345',fulfilmentDate:'2020-01-01',deliveryFeeOverride:{amount:5,reason:'Historical record; provider quotation unavailable'}};
  await assert.rejects(createExternalPosOrder({db,uid:chef,input:historical}));
  const manual=await createExternalPosOrder({db,uid:manager,input:historical});
  const order=(await db.collection('storeHistoricalWeeklyOrders').doc(manual.orderId).get()).data();
  assert.equal(manual.historical,true);assert.equal(order.totals.grandTotal,29);assert.equal(order.payment,undefined);assert.equal(order.fulfilmentStatus,undefined);assert.equal(order.fulfilments[0].date,'2020-01-01');assert.equal(order.totals.deliveryFee,5);assert.equal(order.deliveryFeeAudit.providerDeliveryFee,null);assert.equal(order.deliveryFeeAudit.authorizedBy,manager);assert.equal(bookings,0);
  assert.equal((await db.collection('storeOrders').doc(manual.orderId).get()).exists,false);
 }finally{await deleteApp(app);}
});

test('manual store delivery saves a server quotation into pending totals and confirms the same amount once',async()=>{
 const {createPosDeliveryQuote}=await import('../functions/posDeliveryQuotes.js');
 const {buildManualOrder,manualDeliveryInput}=await import('../functions/manualPosOrders.js');
 const {loadStoreCheckoutData}=await import('../functions/storePayments.js');
 const {assertOperator}=await import('../functions/externalPosOrders.js');
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`manual-delivery-${process.pid}`),db=getFirestore(app);
 const workspaceId=`manual-delivery-${process.pid}`,uid=`${workspaceId}-owner`;
 try {
  await db.collection('workspaces').doc(workspaceId).set({ownerId:uid,subscriptionPlan:'professional',subscriptionStatus:'active'});
  await db.collection('stores').doc(workspaceId).set({workspaceId,slug:workspaceId,name:'Disposable manual delivery Store',currency:'MYR',pickupLocations:[{id:'counter',name:'Counter',address:'QA pickup'}],delivery:{enabled:true,provider:'lalamove',environment:'sandbox',market:'MY',serviceType:'MOTORCYCLE',pickup:{address:'QA pickup',latitude:'4.6',longitude:'101.1'},freeDelivery:{enabled:false}}});
  const input={workspaceId,storeId:workspaceId,slug:workspaceId,source:'whatsapp',customerName:'Disposable QA',phone:'',notes:'',requestId:'manual-quoted-request-12345',manualPos:true,lines:[{custom:{name:'QA custom meal',unitPrice:12},quantity:2,date:'2099-01-01',time:'00:01',method:'delivery',deliveryArrangement:'store',deliveryAddress:'QA unit 2',destination:{placeId:'qa-place',formattedAddress:'QA unit 2',latitude:'0',longitude:'0'},notes:''}]};
  let bookings=0;
  const provider={environment:'sandbox',createQuote:async()=>({quotationId:'qa-quote',expiresAt:new Date(Date.now()+300000).toISOString(),serviceType:'MOTORCYCLE',priceBreakdown:{total:9.5,currency:'MYR'},stops:[]}),createOrder:()=>{bookings++;}};
  const quote=await createPosDeliveryQuote({db,uid,input,provider,authorize:assertOperator,loadCheckout:loadStoreCheckoutData,buildItems:buildManualOrder,normalizeInput:manualDeliveryInput,resolvePlace:async()=>({latitude:4.61,longitude:101.11})});
  const args={db,uid,input:{...input,posDeliveryQuoteId:quote.id,payment:{status:'paid'},total:1}};
  const saved=await saveManualPosOrder(args);
  let order=(await db.collection('storeOrders').doc(saved.orderId).get()).data();
  assert.equal(order.total,33.5);assert.equal(order.payment.status,'pending');assert.equal(order.payment.amountMinor,3350);assert.equal(order.totals.deliveryFee,9.5);assert.equal(order.fulfilments[0].destination.latitude,'4.61');assert.equal(bookings,0);
  assert.equal((await saveManualPosOrder(args)).duplicate,true);
  await assert.rejects(saveManualPosOrder({...args,input:{...args.input,requestId:'manual-changed-request-12345',lines:input.lines.map(line=>({...line,time:'00:02'}))}}),/changed/);
  await confirmManualPosPayment({db,uid,input:{orderId:saved.orderId,expectedRevision:1,amountMinor:3350,received:true,method:'bank_transfer',reference:'QA only'}});
  order=(await db.collection('storeOrders').doc(saved.orderId).get()).data();
  assert.equal(order.payment.status,'paid');assert.equal(order.payment.amountMinor,3350);assert.equal(bookings,0);
 }finally{await deleteApp(app);}
});

test('POS cancel and soft-delete enforce roles, preserve financial/provider records, reject stale actions and expose deleted list only to Owner',async()=>{
 const {managePosOrder,listDeletedPosOrders}=await import('../functions/posOrderManagement.js');
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`pos-management-${process.pid}`),db=getFirestore(app);
 const workspaceId=`pos-management-${process.pid}`,owner=`${workspaceId}-owner`,manager=`${workspaceId}-manager`,chef=`${workspaceId}-chef`;
 const store={id:workspaceId,workspaceId,name:'Disposable POS Store',currency:'MYR',pickupLocations:[{id:'counter',name:'Counter',address:'QA'}]};
 try{
  await db.collection('workspaces').doc(workspaceId).set({ownerId:owner,subscriptionPlan:'professional',subscriptionStatus:'active'});
  await db.collection('stores').doc(workspaceId).set(store);
  for(const [userId,role]of[[manager,'Manager'],[chef,'Chef']])await db.collection('workspaceMembers').doc(`${workspaceId}_${userId}`).set({workspaceId,userId,status:'Active',role});
  const create=async suffix=>saveManualPosOrder({db,uid:owner,loadCheckout:async()=>({store,products:[],sets:[],optionGroups:[]}),input:{workspaceId,storeId:workspaceId,slug:workspaceId,source:'whatsapp',customerName:'Disposable QA',requestId:`pos-management-${suffix}-123456`,lines:[{custom:{name:'QA meal',unitPrice:12},quantity:2,date:'2020-01-01',time:'00:01',method:'pickup',notes:''}]}});
  const paid=await create('paid'),unpaid=await create('unpaid'),cancelled=await create('cancelled');
  await confirmManualPosPayment({db,uid:owner,input:{orderId:paid.orderId,received:true,expectedRevision:1,amountMinor:2400,method:'cash',reference:'Disposable synthetic QA'}});
  const paidRef=db.collection('storeOrders').doc(paid.orderId),before=(await paidRef.get()).data();
  await paidRef.update({delivery:{providerOrder:{orderId:'existing-QA-provider-reference'},dispatch:{status:'created'}}});
  const input={action:'delete',reason:'Disposable QA completed',orderId:paid.orderId};
  await assert.rejects(managePosOrder({db,uid:manager,input}),e=>e.code==='permission-denied');
  await assert.rejects(managePosOrder({db,uid:chef,input:{...input,orderId:unpaid.orderId}}),e=>e.code==='permission-denied');
  await assert.rejects(managePosOrder({db,uid:'foreign',input}),e=>e.code==='permission-denied');
  await managePosOrder({db,uid:owner,input});
  assert.equal((await managePosOrder({db,uid:owner,input})).duplicate,true);
  const after=(await paidRef.get()).data();assert.ok(after.deletedAt);assert.equal(after.fulfilmentStatus,before.fulfilmentStatus);assert.deepEqual(after.payment,before.payment);assert.deepEqual(after.totals,before.totals);assert.deepEqual(after.items,before.items);assert.equal(after.delivery.providerOrder.orderId,'existing-QA-provider-reference');assert.equal(after.delivery.dispatch.status,'created');
  assert.equal((await db.collection('storeOrderTimeline').where('orderId','==',paid.orderId).where('type','==','order_deleted').get()).size,1);
  await assert.rejects(updateStoreOrderFulfilment({db,uid:owner,orderId:paid.orderId,nextStatus:'Ready'}),/deleted/);
  await managePosOrder({db,uid:manager,input:{...input,orderId:unpaid.orderId}});
  await assert.rejects(confirmManualPosPayment({db,uid:owner,input:{orderId:unpaid.orderId,received:true,expectedRevision:1,amountMinor:2400,method:'cash',reference:'QA'}}),/deleted/);
  await managePosOrder({db,uid:manager,input:{action:'cancel',orderId:cancelled.orderId,reason:'Customer request'}});
  const cancel=(await db.collection('storeOrders').doc(cancelled.orderId).get()).data();assert.equal(cancel.fulfilmentStatus,'Cancelled');assert.equal(cancel.deletedAt,undefined);assert.equal(cancel.payment.status,'pending');
  const args={db,input:{workspaceId,storeId:workspaceId}};
  await assert.rejects(listDeletedPosOrders({...args,uid:manager}),e=>e.code==='permission-denied');await assert.rejects(listDeletedPosOrders({...args,uid:chef}),e=>e.code==='permission-denied');
  const list=await listDeletedPosOrders({...args,uid:owner});assert.equal(list.orders.length,2);assert.equal(list.cursor,null);
 }finally{await deleteApp(app);}
});

test('Phase 1 edits preserve paid multi-day snapshots and keep the audit private', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required.');
  const { editStoreOrder } = await import('../functions/storeOrderEdits.js');
  const { initializeTestEnvironment, assertFails } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const projectId = 'demo-misechef-store-payment-rules';
  const app = initializeApp({ projectId }, 'store-edit-phase-1');
  const env = await initializeTestEnvironment({ projectId });
  const db = getFirestore(app);
  const workspaceId = 'qa-phase-one-workspace';
  const ownerId = 'qa-phase-one-owner';
  const managerId = 'qa-phase-one-manager';
  const chefId = 'qa-phase-one-chef';
  const ref = db.collection('storeOrders').doc('qa-phase-one-order');
  const dates = ['2026-08-24', '2026-08-25'];
  const now = new Date('2026-08-22T02:00:00Z');
  const original = {
    workspaceId, storeId: workspaceId, orderSource: 'online', fulfilmentMethod: 'delivery',
    fulfilmentStatus: 'New', customerName: 'Original name', phone: '0123456789', notes: 'Original request',
    total: 44, totals: { merchandiseSubtotal: 30, deliveryFee: 14, grandTotal: 44 },
    payment: { status: 'paid', amountMinor: 4400, providerTransactionId: 'synthetic-payment', refundStatus: 'partial' },
    items: [{ productName: 'Lunch', quantity: 2, lineTotal: 30 }],
    deliveryPricingSnapshot: { days: dates.map(date => ({ date, customerDeliveryFee: 7 })) },
    posDeliveryPricing: { days: dates.map(date => ({ date, time: '12:00', customerDeliveryFee: 7 })) },
    fulfilments: dates.map((date, i) => ({
      id: `slot-${i}`, date, time: '12:00', method: 'delivery', allocations: [{ itemIndex: 0, quantity: 1 }],
      destination: { formattedAddress: 'Original synthetic address', latitude: '4.5', longitude: '101.1', deliveryInstructions: 'Ring bell' }
    }))
  };
  const edit = (uid, input = {}) => editStoreOrder({ db, uid, now, input: { orderId: ref.id, ...input } });
  try {
    await db.collection('workspaces').doc(workspaceId).set({ ownerId, subscriptionPlan: 'professional', subscriptionStatus: 'active' });
    await db.collection('stores').doc(workspaceId).set({ workspaceId, country: 'MY' });
    for (const [uid, role] of [[managerId, 'Manager'], [chefId, 'Chef']]) {
      await db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`).set({ userId: uid, workspaceId, role, status: 'Active' });
    }
    await ref.set(original);
    await assert.rejects(edit(''), { code: 'unauthenticated' });
    await assert.rejects(edit(chefId), { code: 'permission-denied' });
    await assert.rejects(edit('unrelated-user'), { code: 'permission-denied' });
    const { revision } = await edit(ownerId);
    await assert.rejects(edit(managerId, { revision, changes: { total: 0 } }), { code: 'invalid-argument' });
    await assert.rejects(edit(managerId, { revision, changes: { slots: [{ id: 'slot-0', date: '2026-08-26' }] } }), { code: 'invalid-argument' });
    await assert.rejects(edit(managerId, { revision, changes: { slots: [{ id: 'slot-0', time: '99:99' }] } }), { code: 'invalid-argument' });
    await edit(managerId, { revision, changes: {
      customerName: 'Updated name', phone: '0191234567', customerRemarks: 'Pack separately', internalNotes: 'Staff only',
      slots: [{ id: 'slot-0', time: '13:30', address: 'Updated synthetic address' }]
    } });
    await assert.rejects(edit(ownerId, { revision, changes: { customerName: 'Stale write' } }), { code: 'failed-precondition' });
    const saved = (await ref.get()).data();
    for (const field of ['items', 'total', 'totals', 'payment', 'deliveryPricingSnapshot', 'posDeliveryPricing']) {
      assert.deepEqual(saved[field], original[field]);
    }
    assert.deepEqual(saved.fulfilments.map(day => day.date), dates);
    assert.deepEqual(saved.fulfilments.map(day => day.allocations), original.fulfilments.map(day => day.allocations));
    assert.equal(saved.fulfilments[0].time, '13:30');
    assert.equal(saved.fulfilments[0].destination.formattedAddress, 'Updated synthetic address');
    assert.equal(saved.fulfilments[0].destination.deliveryInstructions, 'Ring bell');
    assert.equal(saved.fulfilments[0].destination.latitude, undefined);
    assert.deepEqual(saved.fulfilments[1], original.fulfilments[1]);
    assert.equal(saved.deliveryFeeReviewRequired, true);
    assert.equal(saved.internalNotes, undefined);
    const current = await edit(ownerId);
    assert.equal(current.internalNotes, 'Staff only');
    assert.equal(current.audit.length, 1);
    assert.equal(current.audit[0].actor, managerId);
    assert.deepEqual(current.audit[0].changes[0], { field: 'customerName', before: 'Original name', after: 'Updated name' });
    const auditRef = (await ref.collection('editAudit').get()).docs[0].ref;
    const clientDb = env.authenticatedContext(ownerId).firestore();
    await assertFails(getDoc(doc(clientDb, auditRef.path)));
    await assertFails(getDoc(doc(clientDb, ref.collection('editPrivate').doc('notes').path)));
    await assertFails(setDoc(doc(clientDb, auditRef.path), { actor: ownerId }));
    for (const status of ['creating', 'created', 'outcome_unknown', 'cancel_requested']) {
      await ref.update({ fulfilmentOperations: { 'slot-1': { dispatch: { status } } } });
      const locked = await edit(ownerId);
      assert.ok(locked.slots.every(slot => slot.blocked));
      await assert.rejects(edit(ownerId, { revision: locked.revision,
        changes: { slots: [{ id: 'slot-0', address: 'Another synthetic address' }] } }), { code: 'failed-precondition' });
      await assert.rejects(edit(ownerId, { revision: locked.revision,
        changes: { slots: [{ id: 'slot-0', time: '14:00' }] } }), { code: 'failed-precondition' });
    }
    for (const state of [
      { fulfilmentStatus: 'Completed' }, { fulfilmentStatus: 'Cancelled' }, { deletedAt: now.toISOString() },
      { groupDelivery: {} }, { groupOrder: {} }, { manualOrder: { revision: 1 }, payment: { status: 'pending' } }
    ]) {
      await ref.set({ ...original, ...state });
      await assert.rejects(edit(ownerId), { code: 'failed-precondition' });
    }
    const { fulfilments, ...base } = original;
    await ref.set({ ...base, orderSource: 'pos', fulfilmentMethod: 'pickup', pickupDate: '2026-08-22', pickupTime: '12:00' });
    const pickup = await edit(managerId);
    await assert.rejects(edit(managerId, { revision: pickup.revision,
      changes: { slots: [{ id: 'single', time: '09:00' }] } }), { code: 'invalid-argument' });
    await edit(managerId, { revision: pickup.revision, changes: { slots: [{ id: 'single', time: '11:30' }] } });
    const updatedPickup = (await ref.get()).data();
    assert.equal(updatedPickup.pickupDate, '2026-08-22');
    assert.equal(updatedPickup.pickupTime, '11:30');
    assert.deepEqual(updatedPickup.payment, original.payment);
  } finally {
    await env.cleanup();
    await deleteApp(app);
  }
});

test('historical Weekly Order by Day is an authorized audit record with dated pricing and zero operational side effects', async () => {
  const { createPosDeliveryQuote } = await import('../functions/posDeliveryQuotes.js');
  const { loadStoreCheckoutData } = await import('../functions/storePayments.js');
  const { assertOperator } = await import('../functions/externalPosOrders.js');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `weekly-audit-${process.pid}`);
  const db = getFirestore(app);
  const workspaceId = `weekly-audit-${process.pid}`;
  const [owner, manager, chef, customer] = ['owner', 'manager', 'chef', 'customer'].map(role => `${workspaceId}-${role}`);
  const productId = `${workspaceId}-plan`;
  const now = new Date('2026-11-16T16:00:00Z');
  const makeWeek = (startMonday, price) => ({
    startMonday,
    meals: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map(day => [day, {
      name: `${startMonday} ${day}`, photoUrl: 'meal.jpg', price,
      optionGroups: [{ id: 'side', name: 'Side', type: 'exchange', required: true, selection: 'single',
        options: [{ id: 'salad', name: 'Salad', priceAdjustmentMinor: 200 }] }],
    }])),
  });
  try {
    await Promise.all([
      db.collection('workspaces').doc(workspaceId).set({ ownerId: owner, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
      db.collection('workspaceMembers').doc(`${workspaceId}_${manager}`).set({ userId: manager, workspaceId, role: 'Manager', status: 'Active' }),
      db.collection('workspaceMembers').doc(`${workspaceId}_${chef}`).set({ userId: chef, workspaceId, role: 'Chef', status: 'Active' }),
      db.collection('stores').doc(workspaceId).set({
        workspaceId, slug: workspaceId, country: 'MY', currency: 'MYR', orderCutoffTime: '17:00', orderDays: ['tuesday'],
        earliestPickupDays: 1, maximumAdvanceDays: 7, pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Counter' }],
      }),
      db.collection('storeProducts').doc(productId).set({
        workspaceId, storeId: workspaceId, name: 'Weekly Menu', available: true, price: 99,
        productType: 'weekly_meal_plan', weeklyMenuVersion: 2, optionGroupIds: [],
        weeklyWeeks: { week1: makeWeek('2026-11-09', 10), week2: makeWeek('2026-11-16', 20), week3: makeWeek('2026-12-07', 30) },
      }),
    ]);
    const selection = date => ({ productId, healthyLunchPlanId: productId, healthyLunchDate: date, quantity: 3,
      selectedOptions: [], selectedMealOptions: [{ serviceDate: date, optionGroupId: 'side', optionId: 'salad' }] });
    const makeInput = date => ({
      workspaceId, storeId: workspaceId, slug: workspaceId, source: 'whatsapp', fulfilmentMethod: 'pickup',
      requestId: `weekly-audit-${date}`, selections: [selection(date)], lineSchedules: [{ date, time: '09:15' }],
    });
    const save = (uid, input) => createExternalPosOrder({ db, uid, input, now });
    const past = makeInput('2026-11-10');
    const historical = { ...past, historicalReason: 'Transcribed from original order slip', expectedSubtotalMinor: 3600 };
    await assert.rejects(save(owner, { ...past, paymentLabel: 'other_paid' }), /Record Historical Order/);
    await assert.rejects(save(customer, historical), /role cannot/);
    await assert.rejects(save(chef, historical), /Only Owner or Manager/);
    await assert.rejects(save(manager, { ...historical, paymentLabel: 'other_paid' }), /without a payment label/);
    await assert.rejects(save(manager, { ...historical, expectedSubtotalMinor: 6600 }), /pricing changed/);
    await assert.rejects(save(manager, { ...historical, selections: [selection('2026-11-17')] }), /pricing changed/);
    await assert.rejects(save(manager, { ...makeInput('2026-11-03'), historicalReason: 'Audit', expectedSubtotalMinor: 3600 }), /No dated historical menu/);

    let providerCalls = 0;
    const delivery = { ...historical, fulfilmentMethod: 'delivery', deliveryAddress: 'Recorded address',
      deliveryFeeOverride: { amount: 5, reason: 'Receipt fee' } };
    const provider = { createQuote: () => { providerCalls++; }, createOrder: () => { providerCalls++; } };
    await assert.rejects(createPosDeliveryQuote({ db, uid: manager, input: delivery, provider, authorize: assertOperator,
      loadCheckout: loadStoreCheckoutData, now }), /cannot request a delivery estimate/);
    const saved = await save(manager, delivery);
    assert.equal(saved.historical, true);
    assert.equal((await save(manager, delivery)).orderId, saved.orderId);
    await assert.rejects(save(manager, { ...delivery, historicalReason: 'Different reason' }), /different historical order details/);

    const record = (await db.collection('storeHistoricalWeeklyOrders').doc(saved.orderId).get()).data();
    assert.equal(record.actingUserId, manager);
    assert.equal(record.reason, historical.historicalReason);
    assert.equal(record.items[0].productName, '2026-11-09 tue');
    assert.equal(record.items[0].lineTotal, 36);
    assert.equal(record.fulfilments[0].date, '2026-11-10');
    assert.equal(record.totals.grandTotal, 41);
    assert.equal(record.deliveryFeeAudit.authorizedBy, manager);
    assert.equal(record.payment, undefined);
    assert.equal(record.fulfilmentStatus, undefined);
    assert.equal(providerCalls, 0);
    assert.equal((await db.collection('storeOrders').where('workspaceId', '==', workspaceId).get()).size, 0);
    assert.equal((await db.collection('storeOrderTimeline').where('workspaceId', '==', workspaceId).get()).size, 0);

    const ownerArchive = await save(owner, { ...historical, requestId: 'owner-archive-request',
      lineSchedules: [{ date: '2026-11-15', time: '09:15' }] });
    assert.equal(ownerArchive.historical, true);
    const sundayArchive = (await db.collection('storeHistoricalWeeklyOrders').doc(ownerArchive.orderId).get()).data();
    assert.equal(sundayArchive.fulfilments[0].date, '2026-11-15');
    assert.equal(sundayArchive.items[0].healthyLunchSnapshot.date, '2026-11-10');
    for (const [uid, date, total] of [[owner, '2026-11-17', 66], [manager, '2026-12-08', 96]]) {
      const input = { ...makeInput(date), paymentLabel: 'other_paid' };
      await assert.rejects(save(chef, input), /available fulfilment date/);
      const { orderId } = await save(uid, input);
      const order = (await db.collection('storeOrders').doc(orderId).get()).data();
      assert.equal(order.total, total);
      assert.equal(order.payment.status, 'paid');
      assert.equal(order.fulfilments[0].date, date);
    }
  } finally {
    await deleteApp(app);
  }
});

test('Weekly POS custom fulfilment and Stripe lifecycle retain one immutable pending order', async () => {
  const { manageWeeklyPosPaymentLink } = await import('../functions/weeklyPosPaymentLink.js');
  const { getStorePaymentResult, handleStorePaymentWebhook, cancelStorePayment } = await import('../functions/storePayments.js');
  const { managePosOrder } = await import('../functions/posOrderManagement.js');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `weekly-stripe-${process.pid}`);
  const db = getFirestore(app);
  const workspaceId = `weekly-stripe-${process.pid}`;
  const [owner, manager, chef] = ['owner', 'manager', 'chef'].map(role => `${workspaceId}-${role}`);
  const productId = `${workspaceId}-plan`;
  const now = new Date('2026-11-17T04:00:00Z');
  const menuDate = '2026-11-17';
  const serviceDate = '2026-11-21';
  const selection = { productId, healthyLunchPlanId: productId, healthyLunchDate: menuDate, selectedOptions: [],
    selectedMealOptions: [{ serviceDate: menuDate, optionGroupId: 'side', optionId: 'salad' }] };
  const sessions = new Map();
  let loseResponse = true;
  let captureDuringCancel = false;
  const adapter = {
    provider: 'stripe', mode: 'single_merchant', requiresSellingWorkspace: true,
    async createPayment({ order, weeklyPosSession, checkoutAccessToken }) {
      assert.equal(order.payment.amountMinor, 4400);
      const session = sessions.get(weeklyPosSession.id) || { orderId: order.id, amountMinor: 4400, currency: 'MYR',
        providerPaymentId: `cs_test_${sessions.size + 1}`, status: 'pending', checkoutAccessToken };
      sessions.set(weeklyPosSession.id, session);
      if (loseResponse) { loseResponse = false; throw new Error('Simulated provider response loss'); }
      return { providerPaymentId: session.providerPaymentId,
        checkout: { type: 'provider_redirect', redirectUrl: `https://checkout.stripe.com/${session.providerPaymentId}` } };
    },
    async retrievePayment(id) {
      const session = [...sessions.values()].find(value => value.providerPaymentId === id);
      assert.ok(session);
      return { ...session };
    },
    async cancelPayment(id) {
      const session = [...sessions.values()].find(value => value.providerPaymentId === id);
      if (captureDuringCancel) {
        Object.assign(session, { status: 'paid', paymentMethod: 'card', providerTransactionId: 'pi_weekly_capture' });
        throw new Error('Checkout completed before expiry');
      }
      Object.assign(session, { status: 'cancelled', promotionTerminal: true });
      return { ...session };
    },
    async readWebhookUpdate(event) { return { kind: 'payment', payment: event.payment }; },
  };
  try {
    const meal = { name: 'Tuesday lunch', photoUrl: 'meal.jpg', price: 20, optionGroups: [
      { id: 'side', name: 'Side', type: 'exchange', required: true, selection: 'single',
        options: [{ id: 'salad', name: 'Salad', priceAdjustmentMinor: 200 }] },
    ] };
    await Promise.all([
      db.collection('workspaces').doc(workspaceId).set({ ownerId: owner, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
      db.collection('workspaceMembers').doc(`${workspaceId}_${manager}`).set({ userId: manager, workspaceId, role: 'Manager', status: 'Active' }),
      db.collection('workspaceMembers').doc(`${workspaceId}_${chef}`).set({ userId: chef, workspaceId, role: 'Chef', status: 'Active' }),
      db.collection('stores').doc(workspaceId).set({ workspaceId, slug: workspaceId, name: 'Weekly Stripe QA',
        country: 'MY', currency: 'MYR', paymentMethods: [{ id: 'stripe', enabled: true }],
        earliestPickupDays: 1, orderDays: ['tuesday'], pickupLocations: [{ id: 'counter', name: 'Counter' }] }),
      db.collection('storeProducts').doc(productId).set({ workspaceId, storeId: workspaceId, name: 'Weekly Menu',
        productType: 'weekly_meal_plan', price: 100, available: true, weeklyMenuVersion: 2,
        weeklyWeeks: { week1: { startMonday: '2026-11-16', meals: Object.fromEntries(['mon','tue','wed','thu','fri'].map(day => [day, meal])) } } }),
    ]);
    const input = { workspaceId, storeId: workspaceId, slug: workspaceId, source: 'walk_in', weeklyDayPos: true,
      requestId: 'weekly-stripe-order-123', customerName: 'Test Customer', expectedSubtotalMinor: 4400,
      lines: [{ selection, quantity: 2, date: serviceDate, time: '12:30', method: 'pickup' }] };
    const save = (uid, order = input) => saveManualPosOrder({ db, uid, input: order, now });
    await assert.rejects(save(chef), /Only Owner or Manager/);
    await assert.rejects(save(owner, { ...input, lines: [{ ...input.lines[0], date: '2026-11-14' }] }), /Historical Order/);
    await assert.rejects(save(owner, { ...input, weeklyDayPos: false }), /valid Healthy Lunch date/);
    const { orderId } = await save(owner);
    assert.equal((await save(owner)).orderId, orderId);
    const ref = db.collection('storeOrders').doc(orderId);
    const original = (await ref.get()).data();
    assert.equal(original.payment.status, 'pending');
    assert.equal(original.payment.provider, 'manual_pos');
    assert.equal(original.items[0].healthyLunchSnapshot.date, menuDate);
    assert.equal(original.fulfilments[0].date, serviceDate);
    assert.equal(original.total, 44);

    const manage = (uid, action, settings = {}) => manageWeeklyPosPaymentLink({
      db, uid, input: { orderId, action, provider: 'stripe', expectedRevision: 1, returnUrl: `https://misechef.ai/store/${workspaceId}` },
      adapter, sellingWorkspaceId: workspaceId, now, ...settings,
    });
    const manual = (received = true, amountMinor = 4400) => confirmManualPosPayment({ db, uid: manager, now,
      input: { orderId, expectedRevision: 1, received, amountMinor, method: 'cash', reference: 'QA cash receipt' } });
    await assert.rejects(manage(chef, 'generate'), /role cannot/);
    await assert.rejects(manage('customer', 'generate'), /role cannot/);
    await assert.rejects(manage(undefined, 'generate'), /Sign in/);
    await assert.rejects(manage(owner, 'generate', { sellingWorkspaceId: 'different-store' }), /unavailable/);
    await assert.rejects(manage(owner, 'generate', { now: new Date('2026-11-21T04:10:00Z') }), /31 minutes/);
    await assert.rejects(manual(false), /Verify the received payment/);
    await assert.rejects(manage(manager, 'generate'), /response loss/);
    await assert.rejects(manual(), /Verify the received payment/);
    await assert.rejects(managePosOrder({ db, uid: owner, input: { orderId, action: 'cancel', reason: 'Test' }, now }), /Cancel the payment link/);
    await assert.rejects(save(owner, { ...input, weeklyDayPos: false, orderId, requestId: 'weekly-stripe-edit-123' }));
    const first = await manage(owner, 'generate');
    assert.equal(first.status, 'active');
    assert.equal((await manage(manager, 'generate')).url, first.url);
    assert.equal(sessions.size, 1);

    const [session] = sessions.values();
    const guestArgs = { db, adapter, sellingWorkspaceId: workspaceId, slug: workspaceId, providerPaymentId: session.providerPaymentId };
    await assert.rejects(getStorePaymentResult({ ...guestArgs, checkoutAccessToken: 'wrong' }), /token is invalid/);
    const guest = await getStorePaymentResult({ ...guestArgs, checkoutAccessToken: session.checkoutAccessToken });
    assert.equal(guest.paymentStatus, 'pending');
    assert.equal(guest.total, 44);
    for (const privateKey of ['workspaceId', 'manualOrder', 'phone', 'payment', 'notes']) assert.equal(guest[privateKey], undefined);
    await cancelStorePayment({ ...guestArgs, checkoutAccessToken: session.checkoutAccessToken });
    assert.equal(session.status, 'pending');
    assert.equal((await manage(owner, 'cancel')).status, 'cancelled');
    assert.equal((await manage(owner, 'cancel')).status, 'cancelled');
    assert.equal((await ref.get()).data().payment.provider, 'manual_pos');
    assert.equal((await ref.get()).data().payment.status, 'pending');
    const [second, secondRetry] = await Promise.all([manage(manager, 'generate'), manage(owner, 'generate')]);
    assert.notEqual(second.url, first.url);
    assert.equal(second.url, secondRetry.url);
    assert.equal(sessions.size, 2);
    captureDuringCancel = true;
    assert.equal((await manage(owner, 'cancel')).status, 'paid');

    const captured = [...sessions.values()][1];
    const event = { id: `weekly-payment-${process.pid}`, type: 'checkout.session.completed', payment: captured };
    await handleStorePaymentWebhook({ db, adapter, event });
    assert.equal((await handleStorePaymentWebhook({ db, adapter, event })).duplicate, true);
    const paid = (await ref.get()).data();
    assert.equal(paid.payment.status, 'paid');
    assert.deepEqual(paid.totals, original.totals);
    assert.deepEqual(paid.items, original.items);
    assert.deepEqual(paid.fulfilments, original.fulfilments);
    assert.equal((await db.collection('storeOrders').where('workspaceId', '==', workspaceId).get()).size, 1);
    assert.equal((await db.collection('storeOrderTimeline').where('orderId', '==', orderId).where('type', '==', 'payment_received').get()).size, 1);

    const manualInput = { ...input, requestId: 'weekly-manual-order-123', lines: [{ ...input.lines[0], date: '2026-11-22' }] };
    const pendingManual = await save(manager, manualInput);
    await confirmManualPosPayment({ db, uid: owner, now, input: { orderId: pendingManual.orderId,
      expectedRevision: 1, received: true, amountMinor: 4400, method: 'cash', reference: 'Sunday cash receipt' } });
    const manualOrder = (await db.collection('storeOrders').doc(pendingManual.orderId).get()).data();
    assert.equal(manualOrder.payment.status, 'paid');
    assert.equal(manualOrder.fulfilments[0].date, '2026-11-22');
  } finally {
    await deleteApp(app);
  }
});

test('Curlec Weekly POS recovers one link, verifies paid events, closes unpaid links and protects guests', async () => {
  const { createHmac } = await import('node:crypto');
  const { createCurlecPaymentLinkAdapter } = await import('../functions/paymentProviders/curlecPaymentLink.js');
  // Import the deployed handler without the demo emulator's project identity.
  // All handler reads/writes below still use the explicitly injected demo DB.
  const projectVariables = ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_CONFIG'];
  const emulatorSettings = projectVariables.map(key => process.env[key]);
  let createCurlecStorePaymentWebhookHandler;
  try {
    for (const key of projectVariables) delete process.env[key];
    ({ createCurlecStorePaymentWebhookHandler } = await import('../functions/index.js'));
  } finally {
    projectVariables.forEach((key, index) => {
      if (emulatorSettings[index] !== undefined) process.env[key] = emulatorSettings[index];
    });
  }
  const { manageWeeklyPosPaymentLink } = await import('../functions/weeklyPosPaymentLink.js');
  const { getStorePaymentResult } = await import('../functions/storePayments.js');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `weekly-curlec-${process.pid}`);
  const db = getFirestore(app);
  const workspaceId = `weekly-curlec-${process.pid}`;
  const [owner, manager, chef] = ['owner', 'manager', 'chef'].map(role => `${workspaceId}-${role}`);
  const now = new Date('2026-11-17T04:00:00Z');
  const secret = 'disposable-local-webhook-secret';
  const email = 'curlec-customer@example.test';
  const links = new Map();
  let loseResponse = true;
  let hideOnce = false;
  let captureDuringCancel = false;
  let postCount = 0;
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const capture = link => {
    const payment = { id: `pay_test${links.size}`, amount: link.amount, currency: link.currency,
      status: 'captured', captured: true, method: 'fpx', created_at: Math.floor(now.getTime() / 1000) };
    Object.assign(link, { status: 'paid', amount_paid: link.amount, payments: [{ ...payment, payment_id: payment.id }] });
    return payment;
  };
  const adapter = createCurlecPaymentLinkAdapter('rzp_test_fake', 'fake-secret', {
    fetchImpl: async (target, options) => {
      const requestUrl = new URL(target);
      assert.equal(requestUrl.origin, 'https://api.razorpay.com');
      if (requestUrl.pathname === '/v1/payment_links' && options.method === 'POST') {
        postCount++;
        const draft = JSON.parse(options.body);
        assert.equal(draft.customer.email, email);
        assert.equal(draft.customer.contact, undefined);
        assert.equal(draft.amount, 4400);
        assert.equal(draft.currency, 'MYR');
        assert.equal(draft.accept_partial, false);
        assert.equal(draft.reference_id.length, 36);
        assert.equal(draft.expire_by, Math.floor(now.getTime() / 1000) + 7200);
        assert.equal(draft.notes.misechefOrderRevision, '1');
        if (links.has(draft.reference_id))
          return response({ error: { description: 'payment link creation with reference ID already attempted' } }, 400);
        const id = `plink_test${links.size + 1}`;
        const link = { ...draft, id, short_url: `https://rzp.io/i/${id}`, status: 'created', amount_paid: 0 };
        links.set(draft.reference_id, link);
        if (loseResponse) {
          loseResponse = false;
          hideOnce = true;
          throw new Error('Connection ended after Curlec accepted the request');
        }
        return response(link);
      }
      if (requestUrl.pathname === '/v1/payment_links') {
        if (hideOnce) { hideOnce = false; return response({ payment_links: [] }); }
        const match = links.get(requestUrl.searchParams.get('reference_id'));
        return response({ payment_links: match ? [match] : [] });
      }
      const [, id, operation] = requestUrl.pathname.match(/^\/v1\/payment_links\/([^/]+)(?:\/(cancel))?$/);
      const link = [...links.values()].find(row => row.id === id);
      if (!link) return response({}, 404);
      if (operation === 'cancel') {
        if (captureDuringCancel) { capture(link); return response({}, 400); }
        link.status = 'cancelled';
      }
      return response(link);
    },
  });
  const testAdapter = { ...adapter, curlecEnvironment: 'test' };
  const handler = createCurlecStorePaymentWebhookHandler({
    webhookDb: db, createAdapter: () => adapter, curlecEnvironment: 'test', getCurlecKeyId: () => 'rzp_test_fake',
    getCurlecKeySecret: () => 'fake-secret', getWebhookSecret: () => secret,
  });
  const webhook = async (link, payment, eventId, signature) => {
    const body = { event: 'payment_link.paid', payload: { payment_link: { entity: link }, payment: { entity: payment } } };
    const rawBody = Buffer.from(JSON.stringify(body));
    let output;
    await handler({
      method: 'POST', body, rawBody, get: name => name.toLowerCase() === 'x-razorpay-signature'
        ? signature ?? createHmac('sha256', secret).update(rawBody).digest('hex')
        : name.toLowerCase() === 'x-razorpay-event-id' ? eventId : undefined,
    }, { status: code => ({ json: value => { output = { code, value }; }, send: value => { output = { code, value }; } }) });
    return output;
  };
  try {
    await Promise.all([
      db.collection('workspaces').doc(workspaceId).set({ ownerId: owner, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
      db.collection('workspaceMembers').doc(`${workspaceId}_${manager}`).set({ userId: manager, workspaceId, role: 'Manager', status: 'Active' }),
      db.collection('workspaceMembers').doc(`${workspaceId}_${chef}`).set({ userId: chef, workspaceId, role: 'Chef', status: 'Active' }),
      db.collection('stores').doc(workspaceId).set({ workspaceId, slug: workspaceId, country: 'MY', currency: 'MYR',
        paymentMethods: [{ id: 'curlec', enabled: true }, { id: 'stripe', enabled: false }] }),
    ]);
    const createOrder = async () => {
      const ref = db.collection('storeOrders').doc();
      await ref.create({
        id: ref.id, storeId: workspaceId, workspaceId, weeklyDayPos: true, fulfilmentStatus: 'New', manualOrder: { revision: 1 },
        orderNumber: 'QA-ORDER', currency: 'MYR', storeName: 'Curlec QA', customerName: 'Customer', phone: '',
        fulfilments: [{ date: '2026-11-21', time: '12:30', method: 'pickup', allocations: [] }],
        payment: { provider: 'manual_pos', providerMode: 'manual', status: 'pending', amountMinor: 4400 }, total: 44,
        notes: 'Private POS note',
      });
      return ref;
    };
    const order = await createOrder();
    const manage = (ref, uid, action, settings = {}) => manageWeeklyPosPaymentLink({
      db, uid, adapter: testAdapter, newCurlecEnvironment: 'test', sellingWorkspaceId: workspaceId, now, ...settings,
      input: { orderId: ref.id, action, provider: 'curlec', expectedRevision: 1, customerEmail: email,
        returnUrl: `https://misechef-beta-fa4bf.web.app/store/${workspaceId}`, ...settings.input },
    });
    const availability = (uid, configuredProviders) => manageWeeklyPosPaymentLink({
      db, uid, adapter: testAdapter, sellingWorkspaceId: workspaceId, configuredProviders, input: { action: 'availability', storeId: workspaceId },
    });
    assert.deepEqual(await availability(manager, ['curlec','stripe']), { providers: ['curlec'] });
    assert.deepEqual(await availability(owner, ['stripe']), { providers: [] });
    await assert.rejects(availability(chef, ['curlec']), /role cannot/);
    await assert.rejects(manage(order, chef, 'generate'), /role cannot/);
    await assert.rejects(manage(order, owner, 'generate', { input: { expectedRevision: 2 } }), /revision changed/);
    await assert.rejects(manage(order, owner, 'generate', { input: { customerEmail: '' } }), /customer’s email/);
    await assert.rejects(manage(order, owner, 'generate', { input: { provider: 'stripe' } }), /unavailable/);
    const diagnosticRecords = [];
    const { getCurlecLinkFailures } = await import('../functions/curlecLinkDiagnostics.js');
    await assert.rejects(manage(order, manager, 'generate', { onDiagnostic: record => diagnosticRecords.push(record) }), error => {
      assert.match(error.message, /creation is unresolved/);
      const original = getCurlecLinkFailures(error).originalError;
      assert.equal(original.name, 'CurlecOrderCreationError');
      assert.match(getCurlecLinkFailures(original).originalError.message, /Connection ended after Curlec accepted/);
      return true;
    });
    assert.deepEqual(diagnosticRecords.map(record => [record.operation, record.outcome]),
      [['create', 'failed'], ['recovery_lookup', 'not_found']]);
    assert.equal(diagnosticRecords[0].category, 'transport_failure');
    assert.equal(diagnosticRecords[0].correlationId, diagnosticRecords[1].correlationId);
    assert.doesNotMatch(JSON.stringify(diagnosticRecords), /curlec-customer|Customer|Private POS|rzp_test|fake-secret|https:/);
    assert.equal(postCount, 1);
    await assert.rejects(manage(order, owner, 'generate', { merchantIdentity: () => 'different-account' }), /original merchant/);
    await assert.rejects(confirmManualPosPayment({ db, uid: owner, now, input: {
      orderId: order.id, expectedRevision: 1, amountMinor: 4400, received: true, reference: 'Cash', method: 'cash',
    } }), /sandbox order cannot record a manual payment/);

    const [first, retry] = await Promise.all([manage(order, owner, 'generate'), manage(order, manager, 'generate')]);
    assert.equal(first.status, 'active');
    assert.equal(first.url, retry.url);
    assert.equal(postCount, 1);
    assert.equal((await order.get()).data().payment.curlecEnvironment, 'test');
    assert.equal((await manage(order, owner, 'generate', { configuredProviders: [] })).url, first.url);
    const rollbackDraft = await createOrder();
    await assert.rejects(manage(rollbackDraft, owner, 'generate', { configuredProviders: [] }), /unavailable/);
    assert.equal((await rollbackDraft.get()).data().payment.provider, 'manual_pos');
    await rollbackDraft.delete();
    await order.update({ 'payment.amountMinor': 4401 });
    await assert.rejects(manage(order, owner, 'generate'), /requires reconciliation/);
    await order.update({ 'payment.amountMinor': 4400, currency: 'SGD' });
    await assert.rejects(manage(order, owner, 'generate'), /requires reconciliation/);
    await order.update({ currency: 'MYR' });
    const live = [...links.values()][0];
    const guest = { db, adapter: testAdapter, sellingWorkspaceId: workspaceId, slug: workspaceId, providerPaymentId: live.id,
      checkoutAccessToken: new URL(live.callback_url).searchParams.get('payment_access_token') };
    assert.equal((await getStorePaymentResult(guest)).paymentStatus, 'pending');
    await assert.rejects(getStorePaymentResult({ ...guest, checkoutAccessToken: 'wrong' }), /token is invalid/);
    const payment = capture(live);
    assert.equal((await webhook(live, payment, 'invalidSig', 'invalid')).code, 400);
    assert.equal((await webhook({ ...live, amount_paid: 1 }, payment, 'partial')).code, 400);
    assert.equal((await webhook({ ...live, notes: { ...live.notes, misechefOrderRevision: '2' } }, payment, 'revision')).code, 400);
    assert.equal((await order.get()).data().payment.status, 'pending');
    assert.equal((await webhook(live, payment, 'curlec-paid')).code, 200);
    assert.equal((await webhook(live, payment, 'curlec-paid')).value.duplicate, true);
    const paidGuest = await getStorePaymentResult(guest);
    assert.equal(paidGuest.paymentStatus, 'paid');
    assert.equal(paidGuest.testPayment, true);
    assert.equal((await db.collection('storeNotifications').doc(`new-paid-order_${order.id}`).get()).exists, false);
    for (const key of ['customerEmail','workspaceId','manualOrder','notes','payment']) assert.equal(paidGuest[key], undefined);
    assert.equal((await db.collection('storeOrderTimeline').where('orderId', '==', order.id).where('type', '==', 'payment_received').get()).size, 1);

    const cancellation = await createOrder();
    await Promise.all([manage(cancellation, owner, 'generate'), manage(cancellation, manager, 'generate')]);
    assert.equal(links.size, 2);
    assert.equal((await manage(cancellation, manager, 'cancel', { configuredProviders: [] })).status, 'cancelled');
    assert.equal((await cancellation.get()).data().payment.provider, 'manual_pos');
    await manage(cancellation, manager, 'generate');
    const expiring = [...links.values()].at(-1);
    const closed = [...links.values()][1];
    const impossibleCapture = { ...closed, status: 'paid', amount_paid: closed.amount };
    assert.equal((await webhook(impossibleCapture, { ...payment, id: 'pay_closedReplay' }, 'old-link-replay')).code, 400);
    assert.equal((await cancellation.get()).data().payment.status, 'pending');
    expiring.status = 'expired';
    assert.equal((await manage(cancellation, owner, 'generate')).status, 'cancelled');
    await manage(cancellation, owner, 'generate');
    captureDuringCancel = true;
    assert.equal((await manage(cancellation, owner, 'cancel')).status, 'paid');
    assert.equal((await cancellation.get()).data().payment.status, 'paid');
    assert.equal((await db.collection('storeOrders').where('workspaceId', '==', workspaceId).get()).size, 2);
  } finally {
    await deleteApp(app);
  }
});

test('public Curlec cutover keeps legacy checkout retries on live and pauses new test creation on rollback', async () => {
  const { getStorePaymentResult } = await import('../functions/storePayments.js');
  const { createModeBoundCurlecAdapter, storedCurlecEnvironment } = await import('../functions/curlecEnvironment.js');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `curlec-cutover-${process.pid}`);
  const db = getFirestore(app);
  const workspaceId = `curlec-cutover-${process.pid}`;
  const prod = `${workspaceId}-meal`;
  const checkout = { paymentMethodId: 'curlec', customerName: 'Guest', phone: '+60123456789', pickupDate: '2026-08-24',
    pickupTime: '10:00', pickupLocationId: 'counter', pickupSession: 'Breakfast', notes: '',
    selections: [{ productId: prod, quantity: 1, selectedOptions: [] }] };
  const oldDraft = { ...checkout, checkoutAttemptId: '95b3c233-9fe4-4f03-9677-2774106b5201' };
  const testDraft = { ...checkout, checkoutAttemptId: 'a5b3c233-9fe4-4f03-9677-2774106b5201' };
  const paidDraft = { ...checkout, checkoutAttemptId: 'b5b3c233-9fe4-4f03-9677-2774106b5201' };
  const creations = [];
  const captures = [];
  const makeAdapter = mode => createModeBoundCurlecAdapter(() => ({
    provider: 'curlec', mode: 'standard_checkout', requiresSellingWorkspace: true,
    async createPayment({ order }) {
      creations.push({ mode, id: order.id });
      const id = `order_${mode}${creations.length}`;
      return { providerPaymentId: id, checkout: { type: 'curlec_standard_checkout', orderId: id } };
    },
    async retrievePayment(id) {
      const hit = (await db.collection('storeOrders').where('payment.providerPaymentId', '==', id).limit(1).get()).docs[0];
      return { orderId: hit.id, providerPaymentId: id, status: hit.data().payment.status };
    },
    async retrieveVerifiedCapturedPayment({ order }) {
      assert.equal(storedCurlecEnvironment(order), mode);
      captures.push(mode);
      return { orderId: order.id, providerPaymentId: order.payment.providerPaymentId, providerTransactionId: `pay_${mode}capture`,
        amountMinor: 1200, currency: 'MYR', status: 'paid', providerStatus: 'captured' };
    },
  }), mode, { curlecKeyId: `rzp_${mode}_Fixture`, curlecKeySecret: 'not-real' });
  let testOn = false;
  const request = (draft, mode = 'test') => createStorePayment({
    db, slug: workspaceId, sellingWorkspaceId: workspaceId, now: NOW, draft,
    adapter: mode === 'pre-isolation' ? { ...makeAdapter('live'), curlecEnvironment: undefined } : makeAdapter(mode),
    resolveExistingAdapter: order => makeAdapter(storedCurlecEnvironment(order)),
    ...(mode === 'pre-isolation' ? {} : { assertNewCheckoutAllowed: () => {
      if (!testOn) throw Error('Test Mode disabled');
    } }),
  });
  try {
    await db.collection('stores').doc(workspaceId).set({
      workspaceId, slug: workspaceId, name: 'Cutover QA', country: 'MY', currency: 'MYR', pickupEnabled: true,
      pickupOperatingHours: { start: '09:00', end: '18:00' }, pickupSessions: ['Breakfast'],
      pickupLocations: [{ id: 'counter', name: 'Counter', address: '' }], orderDays: ['monday'],
      earliestPickupDays: 0, maximumAdvanceDays: 14, unavailableDates: [], paymentMethods: [{ id: 'curlec', enabled: true }],
    });
    await db.collection('storeProducts').doc(prod).set({ storeId: workspaceId, workspaceId, name: 'QA meal', available: true, price: 12 });
    const live = await request(oldDraft, 'pre-isolation');
    assert.equal((await request(oldDraft)).paymentSessionId, live.paymentSessionId);
    await assert.rejects(request(testDraft), /Test Mode disabled/);
    assert.equal(creations.length, 1);
    testOn = true;
    const sandbox = await request(testDraft);
    assert.equal(creations.length, 2);
    const rows = await db.collection('storeOrders').where('workspaceId', '==', workspaceId).get();
    assert.deepEqual(new Set(rows.docs.map(snapshot => snapshot.data().payment.curlecEnvironment)), new Set([undefined, 'test']));
    testOn = false;
    assert.equal((await request(testDraft)).paymentSessionId, sandbox.paymentSessionId);
    await assert.rejects(request(paidDraft), /Test Mode disabled/);
    const result = (session, mode) => getStorePaymentResult({ db, adapter: makeAdapter(mode),
      sellingWorkspaceId: workspaceId, slug: workspaceId, providerPaymentId: session.paymentSessionId,
      checkoutAccessToken: session.checkoutAccessToken });
    await assert.rejects(result(live, 'test'), /environment does not match/);
    await assert.rejects(result(sandbox, 'live'), /environment does not match/);
    assert.equal((await result(live, 'live')).paymentStatus, 'paid');
    const sandboxResult = await result(sandbox, 'test');
    assert.equal(sandboxResult.paymentStatus, 'paid');
    assert.equal(sandboxResult.testPayment, true);
    assert.deepEqual(captures, ['live', 'test']);
    assert.equal((await db.collection('storeOrders').where('workspaceId', '==', workspaceId).get()).size, 2);
  } finally {
    await deleteApp(app);
  }
});

test('Add Order ordinary and mixed carts preserve snapshots with historical isolation and concurrent manual confirmation', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required.');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `add-order-${process.pid}`);
  const db = getFirestore(app), workspaceId = `add-order-${process.pid}`;
  const owner = `${workspaceId}-owner`, manager = `${workspaceId}-manager`, staff = `${workspaceId}-staff`;
  const planId = `${workspaceId}-menu`, burgerId = `${workspaceId}-burger`;
  const now = new Date('2026-11-19T04:00:00Z');
  try {
    await Promise.all([
      db.collection('workspaces').doc(workspaceId).set({ ownerId: owner, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
      ...[[manager, 'Manager'], [staff, 'Chef']].map(([userId, role]) => db.collection('workspaceMembers').doc(`${workspaceId}_${userId}`).set({ userId, workspaceId, status: 'Active', role })),
      db.collection('stores').doc(workspaceId).set({ workspaceId, slug: workspaceId, name: 'QA Store', country: 'MY', currency: 'MYR',
        pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Counter' }] }),
      db.collection('storeProducts').doc(burgerId).set({ workspaceId, storeId: workspaceId, name: 'Burger', price: 18, available: true, optionGroupIds: [] }),
      db.collection('storeProducts').doc(planId).set({ workspaceId, storeId: workspaceId, name: 'Expired menu', price: 999,
        available: false, productType: 'weekly_meal_plan', weeklyMenuVersion: 2, optionGroupIds: [],
        weeklyWeeks: { archived: { startMonday: '2026-11-09', meals: { tue: { name: 'Archived Tuesday', photoUrl: 'original.jpg', price: 12.9 } } } } }),
    ]);
    const base = { workspaceId, storeId: workspaceId, slug: workspaceId, source: 'whatsapp', customerName: 'QA customer', fulfilmentMethod: 'pickup' };
    const weekly = { productId: planId, healthyLunchPlanId: planId, healthyLunchDate: '2026-11-10', quantity: 2, selectedOptions: [] };
    const burger = { productId: burgerId, quantity: 2, selectedOptions: [] };
    const past = { ...base, requestId: 'ordinary-past-request-1234', selections: [burger], fulfilmentDate: '2026-11-18', fulfilmentTime: '12:00' };
    await assert.rejects(createExternalPosOrder({ db, uid: owner, input: { ...past, paymentLabel: 'other_paid' }, now }), /Record Historical Order/);
    const archive = { ...base, requestId: 'mixed-archive-request-1234', historicalReason: 'Recorded customer order',
      selections: [weekly, burger], lineSchedules: [{ date: '2026-11-14', time: '12:00' }, { date: '2026-11-18', time: '13:00' }], expectedSubtotalMinor: 6180 };
    await assert.rejects(createExternalPosOrder({ db, uid: staff, input: archive, now }), /Only Owner or Manager/);
    const archived = await Promise.all([1, 2].map(() => createExternalPosOrder({ db, uid: manager, input: archive, now })));
    assert.equal(archived[0].orderId, archived[1].orderId);
    const record = (await db.collection('storeHistoricalWeeklyOrders').doc(archived[0].orderId).get()).data();
    assert.equal(record.recordType, 'pos_historical_audit'); assert.equal(record.payment, undefined);
    assert.equal(record.fulfilmentStatus, undefined); assert.equal(record.totals.grandTotal, 61.8);
    assert.equal(record.items[0].healthyLunchSnapshot.date, '2026-11-10');
    assert.deepEqual(record.fulfilments.map(day => day.date), ['2026-11-14', '2026-11-18']);
    for (const collection of ['storeOrders', 'storeNotifications', 'storeOrderTimeline'])
      assert.equal((await db.collection(collection).where('workspaceId', '==', workspaceId).get()).size, 0);
    const ordinaryArchive = await createExternalPosOrder({ db, uid: owner, now,
      input: { ...past, historicalReason: 'Ordinary historical product', expectedSubtotalMinor: 3600 } });
    assert.equal(ordinaryArchive.historical, true);
    assert.equal((await db.collection('storeProducts').doc(planId).get()).data().available, false);
    const pending = { ...base, posAddOrder: true, requestId: 'ordinary-pending-request-1234', expectedSubtotalMinor: 3600,
      lines: [{ selection: burger, quantity: 2, date: '2026-11-21', time: '12:00', method: 'pickup', notes: '' }] };
    await assert.rejects(saveManualPosOrder({ db, uid: staff, input: pending, now }), /Only Owner or Manager/);
    const results = await Promise.all([1, 2].map(() => saveManualPosOrder({ db, uid: manager, input: pending, now })));
    assert.equal(results[0].orderId, results[1].orderId);
    const ref = db.collection('storeOrders').doc(results[0].orderId);
    assert.equal((await ref.get()).data().payment.status, 'pending');
    const confirmation = { orderId: ref.id, expectedRevision: 1, amountMinor: 3600, received: true, method: 'cash', reference: 'QA-cash-receipt' };
    const confirmations = await Promise.all([owner, manager].map(uid => confirmManualPosPayment({ db, uid, input: confirmation, now })));
    assert.equal(confirmations.filter(result => !result.duplicate).length, 1);
    const paid = (await ref.get()).data();
    assert.equal(paid.payment.status, 'paid'); assert.deepEqual(paid.fulfilmentCompletion, {});
    assert.equal(paid.fulfilmentStatus, 'New'); assert.equal(paid.total, 36);
    assert.equal((await db.collection('storeOrderTimeline').where('orderId', '==', ref.id).where('type', '==', 'payment_received').get()).size, 1);
    assert.equal((await db.collection('storeNotifications').where('workspaceId', '==', workspaceId).get()).size, 0);
  } finally { await deleteApp(app); }
});

test('indexed search reaches orders beyond the creation-history page and paginates equal-date ties without gaps', async () => {
 const {syncPosHistoryIndex}=await import('../functions/posHistoryIndex.js');
 const app=initializeApp({projectId:'demo-misechef-store-payment-rules'},`history-search-${process.pid}`);
 const db=getFirestore(app); const prefix=`search-${process.pid}`;
 try {
  for(let i=0;i<57;i++) {
   const ref=db.collection('storeOrders').doc(`${prefix}-${String(i).padStart(3,'0')}`);
   await ref.set({storeId:prefix,workspaceId:prefix,orderNumber:`MC-${i}`,customerName:i===0?'Historical Needle':'Shared Customer',pickupDate:'2026-11-23',items:[],createdAt:`2020-01-${String(i%28+1).padStart(2,'0')}`,fulfilmentStatus:'Completed'});
   await syncPosHistoryIndex(db,ref.id);
  }
  const root=db.collection('storeOrderHistoryIndex').where('storeId','==',prefix).where('workspaceId','==',prefix);
  const needle=await root.where('searchTerms','array-contains','nee').orderBy('date','desc').limit(51).get();
  assert.equal(needle.size,1); assert.equal(needle.docs[0].data().orderId,`${prefix}-000`);
  const sorted=root.where('date','>=','2026-11-23').where('date','<','2026-11-24').orderBy('date','desc');
  const first=await sorted.limit(51).get(); const second=await sorted.startAfter(first.docs[49]).limit(51).get();
  assert.equal(first.size,51);assert.equal(second.size,7);
  assert.equal(new Set([...first.docs.slice(0,50),...second.docs].map(doc=>doc.id)).size,57);
  const ref=db.collection('storeOrders').doc(`${prefix}-000`);
  await ref.update({pickupDate:'2026-12-01',customerName:'Renamed'}); await syncPosHistoryIndex(db,ref.id);
  assert.equal((await root.where('searchTerms','array-contains','nee').get()).size,0);
  await ref.update({deletedAt:'now'});await syncPosHistoryIndex(db,ref.id);
  assert.equal((await root.where('orderId','==',ref.id).get()).size,0);
 } finally {await deleteApp(app);}
});
