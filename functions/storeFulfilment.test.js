import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionStoreFulfilment,
  updateStoreOrderFulfilment
} from './storeFulfilment.js';

const snapshot = value => ({
  exists: value !== undefined,
  data: () => value
});

const createFakeDb = documents => {
  const writes = [];
  const reference = (collectionName, id) => ({
    collectionName,
    id,
    key: `${collectionName}/${id}`
  });
  return {
    writes,
    collection(collectionName) {
      return { doc: id => reference(collectionName, id) };
    },
    runTransaction: handler => handler({
      get: ref => Promise.resolve(snapshot(documents[ref.key])),
      update: (ref, data) => writes.push({ operation: 'update', ref, data }),
      create: (ref, data) => writes.push({ operation: 'create', ref, data })
    })
  };
};

const paidOrder = {
  id: 'order-a',
  orderNumber: 'MC-001',
  workspaceId: 'workspace-a',
  storeId: 'workspace-a',
  fulfilmentStatus: 'Paid',
  payment: { refundStatus: 'none' }
};

test('fulfilment follows Paid → Preparing → Ready → Completed and never skips', () => {
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'New',
    nextStatus: 'Preparing',
    refundStatus: 'none'
  }), true);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'New',
    nextStatus: 'Ready',
    refundStatus: 'none'
  }), false);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Paid',
    nextStatus: 'Preparing',
    refundStatus: 'none'
  }), true);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Preparing',
    nextStatus: 'Ready',
    refundStatus: 'none'
  }), true);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Ready',
    nextStatus: 'Completed',
    refundStatus: 'none'
  }), true);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Paid',
    nextStatus: 'Ready',
    refundStatus: 'none'
  }), false);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Completed',
    nextStatus: 'Preparing',
    refundStatus: 'none'
  }), false);
});

test('New, Paid, Preparing, and Ready can cancel while Completed cannot', () => {
  for (const currentStatus of ['New', 'Paid', 'Preparing', 'Ready']) {
    assert.equal(canTransitionStoreFulfilment({ currentStatus, nextStatus: 'Cancelled' }), true);
  }
  assert.equal(canTransitionStoreFulfilment({ currentStatus: 'Completed', nextStatus: 'Cancelled' }), false);
  assert.equal(canTransitionStoreFulfilment({ currentStatus: 'Cancelled', nextStatus: 'Preparing' }), false);
});

test('cancellation preserves payment data and writes the required audit fields', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': paidOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  const result = await updateStoreOrderFulfilment({
    db,
    uid: 'owner-a',
    orderId: 'order-a',
    nextStatus: 'Cancelled',
    cancellationReason: 'Customer requested cancellation'
  });

  const update = db.writes[0].data;
  assert.equal(update.fulfilmentStatus, 'Cancelled');
  assert.equal(update.cancelledBy, 'owner-a');
  assert.equal(update.cancellationReason, 'Customer requested cancellation');
  assert.ok(update.cancelledAt);
  assert.equal('payment' in update, false);
  assert.equal('status' in update, false);
  assert.equal(result.cancellationReason, 'Customer requested cancellation');
  assert.equal(db.writes[1].data.cancellationReason, 'Customer requested cancellation');
});

test('cancellation requires a server-validated reason before any write', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': paidOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });
  await assert.rejects(updateStoreOrderFulfilment({
    db,
    uid: 'owner-a',
    orderId: 'order-a',
    nextStatus: 'Cancelled',
    cancellationReason: ''
  }), error => error.code === 'invalid-argument');
  assert.equal(db.writes.length, 0);
});

test('Workspace Owner can update fulfilment and a permanent server timeline event is created', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': paidOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  const result = await updateStoreOrderFulfilment({
    db,
    uid: 'owner-a',
    orderId: 'order-a',
    nextStatus: 'Preparing'
  });

  assert.equal(result.previousStatus, 'Paid');
  assert.equal(result.fulfilmentStatus, 'Preparing');
  assert.equal(db.writes[0].operation, 'update');
  assert.equal(db.writes[0].data.fulfilmentStatus, 'Preparing');
  assert.equal(db.writes[0].data.fulfilmentUpdatedBy, 'owner-a');
  assert.equal(db.writes[1].operation, 'create');
  assert.equal(db.writes[1].ref.key, 'storeOrderTimeline/order-a_preparing');
  assert.equal(db.writes[1].data.previousStatus, 'Paid');
  assert.equal(db.writes[1].data.newStatus, 'Preparing');
  assert.equal(db.writes[1].data.actingUserId, 'owner-a');
});

test('an online manual order cannot enter operations until payment is confirmed', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...paidOrder,
      fulfilmentStatus: 'New',
      orderSource: 'online',
      paymentMethodId: 'duitnow_qr',
      payment: { status: 'pending_verification', refundStatus: 'none' }
    },
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  await assert.rejects(updateStoreOrderFulfilment({
    db,
    uid: 'owner-a',
    orderId: 'order-a',
    nextStatus: 'Preparing'
  }), error => error.code === 'failed-precondition' && /Confirm payment/.test(error.message));
  assert.equal(db.writes.length, 0);
});

test('completion writes a canonical completion clock without changing payment or creation fields', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...paidOrder,
      fulfilmentStatus: 'Ready',
      status: 'Paid',
      createdAt: 'original-created-at',
      payment: { status: 'paid', refundStatus: 'none' }
    },
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  await updateStoreOrderFulfilment({
    db,
    uid: 'owner-a',
    orderId: 'order-a',
    nextStatus: 'Completed'
  });

  const update = db.writes[0].data;
  assert.equal(update.fulfilmentStatus, 'Completed');
  assert.ok(update.completedAt);
  assert.equal('createdAt' in update, false);
  assert.equal('status' in update, false);
  assert.equal('payment' in update, false);
});

test('active Manager can update fulfilment but another Workspace user is denied', async () => {
  const managerDb = createFakeDb({
    'storeOrders/order-a': paidOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'workspaceMembers/workspace-a_manager-a': {
      userId: 'manager-a',
      workspaceId: 'workspace-a',
      role: 'Manager',
      status: 'Active'
    }
  });
  await assert.doesNotReject(updateStoreOrderFulfilment({
    db: managerDb,
    uid: 'manager-a',
    orderId: 'order-a',
    nextStatus: 'Preparing'
  }));

  const otherUserDb = createFakeDb({
    'storeOrders/order-a': paidOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'workspaceMembers/workspace-a_other-a': {
      userId: 'other-a',
      workspaceId: 'workspace-a',
      role: 'Member',
      status: 'Active'
    }
  });
  await assert.rejects(updateStoreOrderFulfilment({
    db: otherUserDb,
    uid: 'other-a',
    orderId: 'order-a',
    nextStatus: 'Preparing'
  }), error => error.code === 'permission-denied');
  assert.equal(otherUserDb.writes.length, 0);
});

test('active kitchen operators can process orders without Store settings authority', async () => {
  for (const role of ['Head Chef', 'Sous Chef', 'Chef']) {
    const uid = role.toLowerCase().replace(' ', '-');
    const db = createFakeDb({
      'storeOrders/order-a': paidOrder,
      'workspaces/workspace-a': { ownerId: 'owner-a' },
      [`workspaceMembers/workspace-a_${uid}`]: {
        userId: uid,
        workspaceId: 'workspace-a',
        role,
        status: 'Active'
      }
    });
    await assert.doesNotReject(updateStoreOrderFulfilment({
      db,
      uid,
      orderId: 'order-a',
      nextStatus: 'Preparing'
    }));
  }
});

test('marking an order Ready creates one deterministic persistent notification', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': { ...paidOrder, fulfilmentStatus: 'Preparing' },
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  await updateStoreOrderFulfilment({
    db,
    uid: 'owner-a',
    orderId: 'order-a',
    nextStatus: 'Ready'
  });

  assert.equal(db.writes[2].operation, 'create');
  assert.equal(db.writes[2].ref.key, 'storeNotifications/order-ready_order-a');
  assert.equal(db.writes[2].data.type, 'order_ready');
  assert.equal(db.writes[2].data.orderId, 'order-a');
  assert.equal(db.writes[2].data.readAt, null);
});
