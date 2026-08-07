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

test('cancelled is blocked until the payment refund is confirmed', () => {
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Paid',
    nextStatus: 'Cancelled',
    refundStatus: 'pending'
  }), false);
  assert.equal(canTransitionStoreFulfilment({
    currentStatus: 'Paid',
    nextStatus: 'Cancelled',
    refundStatus: 'refunded'
  }), true);
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
