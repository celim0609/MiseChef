import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_STORE_GROUP_BATCH_ORDERS,
  canTransitionStoreFulfilment,
  updateStoreGroupOrderFulfilment,
  updateStoreOrderFulfilment
} from './storeFulfilment.js';

const snapshot = value => ({
  exists: value !== undefined,
  data: () => value
});

const activeBusinessWorkspace = workspace => ({
  subscriptionPlan: 'professional',
  subscriptionStatus: 'active',
  ...workspace
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
      return {
        doc: id => reference(collectionName, id),
        where: (field, operator, value) => ({ collectionName, field, operator, value, query: true })
      };
    },
    runTransaction: handler => handler({
      get: ref => {
        if (!ref.query) {
          const value = documents[ref.key];
          return Promise.resolve(snapshot(
            ref.collectionName === 'workspaces' && value !== undefined
              ? activeBusinessWorkspace(value)
              : value
          ));
        }
        const fieldValue = (data, field) => field.split('.').reduce((value, key) => value?.[key], data);
        return Promise.resolve({
          docs: Object.entries(documents)
            .filter(([key, data]) => key.startsWith(`${ref.collectionName}/`)
              && ref.operator === '=='
              && fieldValue(data, ref.field) === ref.value)
            .map(([key, data]) => {
              const id = key.slice(key.indexOf('/') + 1);
              return { id, ref: reference(ref.collectionName, id), data: () => data };
            })
        });
      },
      update: (ref, data) => writes.push({ operation: 'update', ref, data }),
      create: (ref, data) => writes.push({ operation: 'create', ref, data })
    })
  };
};

const paidOrder = {
  id: 'order-a',
  customerUid: 'customer-a',
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

test('Store fulfilment fails closed without an active Business entitlement', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': paidOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a', subscriptionPlan: 'free', subscriptionStatus: 'active' }
  });
  await assert.rejects(
    updateStoreOrderFulfilment({
      db,
      uid: 'owner-a',
      orderId: 'order-a',
      nextStatus: 'Preparing'
    }),
    error => error?.code === 'permission-denied' && /Business subscription/.test(error.message)
  );
  assert.equal(db.writes.length, 0);
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
  assert.equal('customerUid' in update, false);
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

const groupOrder = (id, overrides = {}) => ({
  orderNumber: `MC-${id}`,
  workspaceId: 'workspace-a',
  storeId: 'store-a',
  groupOrder: { id: 'group-a' },
  fulfilmentStatus: 'New',
  payment: { status: 'paid', refundStatus: 'none' },
  ...overrides
});

const groupDocuments = orders => ({
  'groupOrders/group-a': { workspaceId: 'workspace-a', storeId: 'store-a', hostUid: 'host-a' },
  'workspaces/workspace-a': { ownerId: 'owner-a' },
  ...Object.fromEntries(orders.map(([id, data]) => [`storeOrders/${id}`, data]))
});

test('Group batch start advances only exact paid New members and preserves every other order', async () => {
  const db = createFakeDb({
    ...groupDocuments([
      ['eligible', groupOrder('eligible')],
      ['preparing', groupOrder('preparing', { fulfilmentStatus: 'Preparing' })],
      ['ready', groupOrder('ready', { fulfilmentStatus: 'Ready' })],
      ['pending', groupOrder('pending', { payment: { status: 'pending_verification', refundStatus: 'none' } })],
      ['cancelled', groupOrder('cancelled', { fulfilmentStatus: 'Cancelled' })],
      ['completed', groupOrder('completed', { fulfilmentStatus: 'Completed' })]
    ]),
    'storeOrders/other-group': groupOrder('other-group', { groupOrder: { id: 'group-b' } })
  });

  const result = await updateStoreGroupOrderFulfilment({
    db,
    uid: 'owner-a',
    groupId: 'group-a',
    action: 'start_preparing'
  });

  assert.equal(result.matchedOrderCount, 6);
  assert.equal(result.transitionedOrderCount, 1);
  const updates = db.writes.filter(write => write.operation === 'update');
  assert.deepEqual(updates.map(write => write.ref.key), ['storeOrders/eligible']);
  assert.equal(updates[0].data.fulfilmentStatus, 'Preparing');
  assert.equal('payment' in updates[0].data, false);
  assert.equal('groupOrder' in updates[0].data, false);
  assert.equal(db.writes[1].ref.key, 'storeOrderTimeline/eligible_preparing');
});

test('Group batch Ready advances only paid Preparing members and preserves Ready notifications', async () => {
  const db = createFakeDb(groupDocuments([
    ['new', groupOrder('new')],
    ['preparing-a', groupOrder('preparing-a', { fulfilmentStatus: 'Preparing' })],
    ['preparing-b', groupOrder('preparing-b', { fulfilmentStatus: 'Preparing' })],
    ['ready', groupOrder('ready', { fulfilmentStatus: 'Ready' })]
  ]));

  const result = await updateStoreGroupOrderFulfilment({
    db,
    uid: 'owner-a',
    groupId: 'group-a',
    action: 'mark_ready'
  });

  assert.equal(result.transitionedOrderCount, 2);
  assert.deepEqual(
    db.writes.filter(write => write.operation === 'update').map(write => write.ref.key),
    ['storeOrders/preparing-a', 'storeOrders/preparing-b']
  );
  assert.deepEqual(
    db.writes.filter(write => write.ref.collectionName === 'storeNotifications').map(write => write.ref.key),
    ['storeNotifications/order-ready_preparing-a', 'storeNotifications/order-ready_preparing-b']
  );
});

test('Group batch completion advances only paid Ready members and is an idempotent no-op afterward', async () => {
  const documents = groupDocuments([
    ['ready', groupOrder('ready', { fulfilmentStatus: 'Ready' })],
    ['completed', groupOrder('completed', { fulfilmentStatus: 'Completed' })]
  ]);
  const db = createFakeDb(documents);
  const result = await updateStoreGroupOrderFulfilment({
    db,
    uid: 'owner-a',
    groupId: 'group-a',
    action: 'complete'
  });
  assert.equal(result.transitionedOrderCount, 1);
  assert.equal(db.writes[0].data.fulfilmentStatus, 'Completed');
  assert.ok(db.writes[0].data.completedAt);

  const noOpDb = createFakeDb(groupDocuments([
    ['completed', groupOrder('completed', { fulfilmentStatus: 'Completed' })]
  ]));
  const noOp = await updateStoreGroupOrderFulfilment({
    db: noOpDb,
    uid: 'owner-a',
    groupId: 'group-a',
    action: 'complete'
  });
  assert.equal(noOp.transitionedOrderCount, 0);
  assert.equal(noOpDb.writes.length, 0);
});

test('Group Host ownership alone never grants Kitchen batch authority', async () => {
  const db = createFakeDb({
    ...groupDocuments([['eligible', groupOrder('eligible')]]),
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });
  await assert.rejects(updateStoreGroupOrderFulfilment({
    db,
    uid: 'host-a',
    groupId: 'group-a',
    action: 'start_preparing'
  }), error => error.code === 'permission-denied');
  assert.equal(db.writes.length, 0);
});

test('an active Kitchen operator can run a Group batch through the existing Store role boundary', async () => {
  const db = createFakeDb({
    ...groupDocuments([['eligible', groupOrder('eligible')]]),
    'workspaceMembers/workspace-a_chef-a': {
      userId: 'chef-a',
      workspaceId: 'workspace-a',
      role: 'Chef',
      status: 'Active'
    }
  });
  const result = await updateStoreGroupOrderFulfilment({
    db,
    uid: 'chef-a',
    groupId: 'group-a',
    action: 'start_preparing'
  });
  assert.equal(result.transitionedOrderCount, 1);
  assert.equal(db.writes[0].data.fulfilmentUpdatedBy, 'chef-a');
});

test('Group batch fails closed on canonical Store identity mismatch before any write', async () => {
  const db = createFakeDb(groupDocuments([
    ['eligible', groupOrder('eligible')],
    ['wrong-store', groupOrder('wrong-store', { storeId: 'store-b' })]
  ]));
  await assert.rejects(updateStoreGroupOrderFulfilment({
    db,
    uid: 'owner-a',
    groupId: 'group-a',
    action: 'start_preparing'
  }), error => error.code === 'failed-precondition');
  assert.equal(db.writes.length, 0);
});

test('Group batch enforces its atomic write ceiling before any write', async () => {
  const orders = Array.from({ length: MAX_STORE_GROUP_BATCH_ORDERS + 1 }, (_, index) => {
    const id = `order-${index}`;
    return [id, groupOrder(id)];
  });
  const db = createFakeDb(groupDocuments(orders));
  await assert.rejects(updateStoreGroupOrderFulfilment({
    db,
    uid: 'owner-a',
    groupId: 'group-a',
    action: 'start_preparing'
  }), error => error.code === 'resource-exhausted');
  assert.equal(db.writes.length, 0);
});
