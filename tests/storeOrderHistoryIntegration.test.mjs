import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { createManualPaymentAdapter } from '../functions/paymentProviders/manualPayment.js';
import { updateStoreOrderFulfilment } from '../functions/storeFulfilment.js';
import { createStorePayment } from '../functions/storePayments.js';

const NOW = new Date('2026-08-21T16:30:00.000Z');
const TODAY_START = Timestamp.fromDate(new Date('2026-08-21T16:00:00.000Z'));
const TODAY_END = Timestamp.fromDate(new Date('2026-08-22T16:00:00.000Z'));

test('actual new-order writes remain queryable after Completed and Cancelled transitions', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required.');
  const app = initializeApp({ projectId: 'demo-misechef-store-payment-rules' }, `order-history-${process.pid}`);
  const db = getFirestore(app);
  const workspaceId = `order-history-${process.pid}`;
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
    paymentMethods: [paymentMethod]
  };
  const product = {
    storeId: workspaceId, workspaceId, name: 'Breakfast Set', photoUrl: '',
    price: 5.9, available: true, optionGroupIds: []
  };
  await Promise.all([
    db.collection('workspaces').doc(workspaceId).set({ ownerId }),
    db.collection('stores').doc(workspaceId).set(store),
    db.collection('storeProducts').doc(`${workspaceId}-product`).set(product)
  ]);
  const adapter = createManualPaymentAdapter(paymentMethod);
  const draft = suffix => ({
    customerName: `Customer ${suffix}`, phone: '+60123456789', pickupDate: '2026-08-22',
    pickupSession: 'Breakfast', pickupLocationId: 'counter', notes: '',
    paymentMethodId: paymentMethod.id,
    selections: [{ productId: `${workspaceId}-product`, quantity: 1, selectedOptions: [] }]
  });

  try {
    const completedResult = await createStorePayment({ db, adapter, slug, draft: draft('completed'), now: NOW });
    const cancelledResult = await createStorePayment({ db, adapter, slug, draft: draft('cancelled'), now: NOW });
    const loadByNumber = async orderNumber => (await db.collection('storeOrders')
      .where('storeId', '==', workspaceId).where('orderNumber', '==', orderNumber).limit(1).get()).docs[0];
    const completedDocument = await loadByNumber(completedResult.orderNumber);
    const cancelledDocument = await loadByNumber(cancelledResult.orderNumber);

    assert.ok(completedDocument.data().createdAt instanceof Timestamp);
    assert.ok(cancelledDocument.data().createdAt instanceof Timestamp);
    assert.equal(completedDocument.data().fulfilmentStatus, 'New');
    assert.equal(cancelledDocument.data().fulfilmentStatus, 'New');

    for (const nextStatus of ['Preparing', 'Ready', 'Completed']) {
      await updateStoreOrderFulfilment({ db, uid: ownerId, orderId: completedDocument.id, nextStatus });
    }
    await updateStoreOrderFulfilment({
      db, uid: ownerId, orderId: cancelledDocument.id, nextStatus: 'Cancelled',
      cancellationReason: 'Customer requested cancellation'
    });

    const today = await db.collection('storeOrders')
      .where('storeId', '==', workspaceId)
      .where('workspaceId', '==', workspaceId)
      .where('createdAt', '>=', TODAY_START)
      .where('createdAt', '<', TODAY_END)
      .orderBy('createdAt', 'desc')
      .get();
    const states = new Map(today.docs.map(document => [document.id, document.data().fulfilmentStatus]));
    assert.equal(states.get(completedDocument.id), 'Completed');
    assert.equal(states.get(cancelledDocument.id), 'Cancelled');
  } finally {
    await deleteApp(app);
  }
});
