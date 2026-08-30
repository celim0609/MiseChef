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
    pickupEnabled: true, pickupSessions: ['Breakfast'],
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
    customerName: `Customer ${suffix}`, phone: '+60123456789', pickupDate: '2026-08-22',
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
