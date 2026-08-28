import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  reviewManualStorePayment,
  submitManualStorePayment,
  uploadManualStorePaymentReceipt
} from './storeManualPayments.js';
import { projectGroupReward } from './groupOrders.js';

const makeSnapshot = (id, value) => ({
  id,
  exists: value !== undefined,
  data: () => value
});

const createFakeDb = documents => {
  documents = structuredClone(documents);
  const writes = [];
  let transactionQueue = Promise.resolve();
  const applyUpdate = (ref, data) => {
    const target = documents[ref.key] || {};
    Object.entries(data).forEach(([key, value]) => {
      const parts = key.split('.');
      let cursor = target;
      parts.slice(0, -1).forEach(part => {
        cursor[part] = cursor[part] || {};
        cursor = cursor[part];
      });
      cursor[parts.at(-1)] = value;
    });
    documents[ref.key] = target;
  };
  const reference = (collectionName, id) => ({
    collectionName,
    id,
    key: `${collectionName}/${id}`,
    get: () => Promise.resolve(makeSnapshot(id, documents[`${collectionName}/${id}`])),
    update: data => {
      writes.push({ operation: 'direct-update', ref: reference(collectionName, id), data });
      applyUpdate(reference(collectionName, id), data);
      return Promise.resolve();
    }
  });
  return {
    documents,
    writes,
    collection(collectionName) {
      return { doc: id => reference(collectionName, id) };
    },
    runTransaction(handler) {
      const run = transactionQueue.then(() => handler({
        get: ref => Promise.resolve(makeSnapshot(ref.id, documents[ref.key])),
        update: (ref, data) => {
          writes.push({ operation: 'update', ref, data });
          applyUpdate(ref, data);
        },
        create: (ref, data) => {
          if (documents[ref.key] !== undefined) throw new Error('Document already exists.');
          writes.push({ operation: 'create', ref, data });
          documents[ref.key] = data;
        },
        set: (ref, data, options) => {
          writes.push({ operation: 'set', ref, data });
          documents[ref.key] = options?.merge
            ? { ...(documents[ref.key] || {}), ...data }
            : data;
        }
      }));
      transactionQueue = run.catch(() => undefined);
      return run;
    }
  };
};

const RECEIPT_PATH = 'store-payment-receipts/workspace-a/order-a/receipt-existing.png';
const pendingOrder = {
  workspaceId: 'workspace-a',
  storeId: 'workspace-a',
  fulfilmentStatus: 'New',
  paymentMethodId: 'duitnow_qr',
  payment: {
    provider: 'manual',
    status: 'pending_verification',
    receiptPath: RECEIPT_PATH,
    receiptFileName: 'receipt.png'
  }
};

test('Store Owner can approve a manual payment and the decision is audited', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': pendingOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });
  const result = await reviewManualStorePayment({
    db, uid: 'owner-a', orderId: 'order-a', decision: 'approve'
  });
  assert.equal(result.paymentStatus, 'paid');
  assert.equal(db.writes[0].data['payment.status'], 'paid');
  assert.equal(db.writes[0].data.fulfilmentStatus, undefined);
  assert.equal(db.documents['storeOrders/order-a'].fulfilmentStatus, 'New');
  assert.equal(db.writes[0].data['payment.reviewedBy'], 'owner-a');
  assert.equal(db.writes[1].data.label, 'Payment Approved');
  assert.equal(db.writes[1].data.actingUserId, 'owner-a');
  assert.equal(db.writes[2].ref.key, 'storeNotifications/payment-approved_order-a');
  assert.equal(db.writes[2].data.type, 'payment_approved');
});

test('a user outside the Workspace cannot approve or reject payment', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': pendingOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'workspaceMembers/workspace-a_other-a': { role: 'Member', status: 'Active' }
  });
  await assert.rejects(
    reviewManualStorePayment({ db, uid: 'other-a', orderId: 'order-a', decision: 'reject' }),
    /Only the Store Owner or Manager/
  );
  assert.equal(db.writes.length, 0);
});

test('active Manager can reject only an order in their own Workspace', async () => {
  const managerDb = createFakeDb({
    'storeOrders/order-a': pendingOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'workspaceMembers/workspace-a_manager-a': {
      userId: 'manager-a', workspaceId: 'workspace-a', role: 'Manager', status: 'Active'
    }
  });
  await assert.doesNotReject(reviewManualStorePayment({
    db: managerDb, uid: 'manager-a', orderId: 'order-a', decision: 'reject'
  }));
  assert.equal(managerDb.writes[0].data['payment.status'], 'rejected');
  assert.equal(managerDb.writes[2].ref.key, 'storeNotifications/payment-rejected_order-a');
  assert.equal(managerDb.writes[2].data.type, 'payment_rejected');

  const otherOwnerDb = createFakeDb({
    'storeOrders/order-a': pendingOrder,
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'workspaces/workspace-b': { ownerId: 'owner-b' }
  });
  await assert.rejects(reviewManualStorePayment({
    db: otherOwnerDb, uid: 'owner-b', orderId: 'order-a', decision: 'approve'
  }), /Only the Store Owner or Manager/);
  assert.equal(otherOwnerDb.writes.length, 0);
});

test('receipt upload succeeds only through the token-bound server flow and writes the private path', async () => {
  const accessToken = 'guest-checkout-token';
  const tokenHash = createHash('sha256').update(accessToken).digest('hex');
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...pendingOrder,
      id: 'order-a',
      payment: {
        ...pendingOrder.payment,
        status: 'pending',
        checkoutAccessTokenHash: tokenHash
      }
    },
    'stores/workspace-a': { slug: 'store-a' }
  });
  const saved = [];
  const bucket = {
    file: path => ({
      save: (bytes, options) => {
        saved.push({ path, bytes, options });
        return Promise.resolve();
      },
      delete: () => Promise.resolve()
    })
  };
  await uploadManualStorePaymentReceipt({
    db,
    bucket,
    slug: 'store-a',
    orderId: 'order-a',
    checkoutAccessToken: accessToken,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    fileName: 'receipt.png'
  });
  assert.match(saved[0].path, /^store-payment-receipts\/workspace-a\/order-a\/receipt-[a-f0-9]{16}\.png$/);
  assert.equal(saved[0].options.metadata.cacheControl, 'private,no-store');
  assert.equal(db.writes[0].data['payment.receiptPath'], saved[0].path);

  await assert.rejects(uploadManualStorePaymentReceipt({
    db,
    bucket,
    slug: 'store-a',
    orderId: 'order-a',
    checkoutAccessToken: 'wrong-token',
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    fileName: 'receipt.png'
  }), /checkout access token is invalid/);
});

test('receipt-based manual payments cannot be submitted without valid proof', async () => {
  const accessToken = 'guest-checkout-token';
  const db = createFakeDb({
    'storeOrders/order-a': {
      id: 'order-a',
      workspaceId: 'workspace-a',
      storeId: 'workspace-a',
      orderNumber: 'MC-001',
      paymentMethodId: 'touch_n_go_qr',
      payment: {
        provider: 'manual',
        status: 'pending',
        checkoutAccessTokenHash: createHash('sha256').update(accessToken).digest('hex'),
        receiptPath: '',
        receiptFileName: ''
      }
    },
    'stores/workspace-a': { slug: 'store-a' }
  });

  await assert.rejects(submitManualStorePayment({
    db, slug: 'store-a', orderId: 'order-a', checkoutAccessToken: accessToken
  }), /Upload payment proof/);
  assert.equal(db.writes.length, 0);
});

test('payment proof submission and approval preserve the New fulfilment state', async () => {
  const accessToken = 'guest-checkout-token';
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...pendingOrder,
      id: 'order-a',
      orderNumber: 'MC-0822-A7K2',
      paymentMethodId: 'touch_n_go_qr',
      payment: {
        ...pendingOrder.payment,
        status: 'pending',
        checkoutAccessTokenHash: createHash('sha256').update(accessToken).digest('hex')
      }
    },
    'stores/workspace-a': { slug: 'store-a' },
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  await submitManualStorePayment({
    db, slug: 'store-a', orderId: 'order-a', checkoutAccessToken: accessToken
  });
  assert.equal(db.documents['storeOrders/order-a'].fulfilmentStatus, 'New');
  assert.equal(db.documents['storeOrders/order-a'].payment.status, 'pending_verification');
  assert.equal(db.writes[0].data.fulfilmentStatus, undefined);

  await reviewManualStorePayment({
    db, uid: 'owner-a', orderId: 'order-a', decision: 'approve'
  });
  assert.equal(db.documents['storeOrders/order-a'].fulfilmentStatus, 'New');
  assert.equal(db.documents['storeOrders/order-a'].payment.status, 'paid');
});

test('payment confirmation atomically projects Group Sales and remains idempotent', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...pendingOrder,
      id: 'order-a',
      orderNumber: 'MC-0822-GRP1',
      orderSource: 'online',
      total: 100,
      groupOrder: { id: 'group-a', rewardPercent: 5 }
    },
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'groupOrders/group-a': {
      hostId: 'host-a', workspaceId: 'workspace-a', storeId: 'workspace-a',
      rewardPercent: 5, minimumQualifyingSales: 0,
      orderCount: 0, eligibleSales: 0, estimatedReward: 0
    }
  });

  const first = await reviewManualStorePayment({
    db, uid: 'owner-a', orderId: 'order-a', decision: 'approve'
  });
  const repeated = await reviewManualStorePayment({
    db, uid: 'owner-a', orderId: 'order-a', decision: 'approve'
  });
  await projectGroupReward({
    db,
    orderId: 'order-a'
  });

  assert.equal(first.alreadyConfirmed, false);
  assert.equal(repeated.alreadyConfirmed, true);
  assert.equal(db.documents['storeOrders/order-a'].payment.status, 'paid');
  assert.equal(db.documents['groupOrders/group-a'].orderCount, 1);
  assert.equal(db.documents['groupOrders/group-a'].eligibleSales, 100);
  assert.equal(db.documents['groupOrders/group-a'].estimatedReward, 5);
  assert.equal(db.documents['hostRewardLedger/order-a'].eligibleSales, 100);
  assert.equal(db.writes.filter(write => write.ref.key === 'storeOrders/order-a').length, 1);
});

test('concurrent payment confirmations both succeed but write one decision and one reward contribution', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...pendingOrder,
      id: 'order-a',
      orderNumber: 'MC-0822-GRP2',
      orderSource: 'online',
      total: 80,
      groupOrder: { id: 'group-a', rewardPercent: 5 }
    },
    'workspaces/workspace-a': { ownerId: 'owner-a' },
    'groupOrders/group-a': {
      hostId: 'host-a', workspaceId: 'workspace-a', storeId: 'workspace-a',
      rewardPercent: 5, minimumQualifyingSales: 0,
      orderCount: 0, eligibleSales: 0, estimatedReward: 0
    }
  });

  const results = await Promise.all([
    reviewManualStorePayment({ db, uid: 'owner-a', orderId: 'order-a', decision: 'approve' }),
    reviewManualStorePayment({ db, uid: 'owner-a', orderId: 'order-a', decision: 'approve' })
  ]);

  assert.deepEqual(results.map(result => result.paymentStatus), ['paid', 'paid']);
  assert.equal(results.filter(result => result.alreadyConfirmed).length, 1);
  assert.equal(db.documents['groupOrders/group-a'].orderCount, 1);
  assert.equal(db.documents['groupOrders/group-a'].eligibleSales, 80);
  assert.equal(db.writes.filter(write => write.ref.key === 'storeOrders/order-a').length, 1);
  assert.equal(db.writes.filter(write => write.ref.collectionName === 'storeOrderTimeline').length, 1);
});

test('a submitted receipt is immutable even with the matching checkout token', async () => {
  const accessToken = 'guest-checkout-token';
  const db = createFakeDb({
    'storeOrders/order-a': {
      ...pendingOrder,
      id: 'order-a',
      payment: {
        ...pendingOrder.payment,
        checkoutAccessTokenHash: createHash('sha256').update(accessToken).digest('hex')
      }
    },
    'stores/workspace-a': { slug: 'store-a' }
  });
  const saved = [];
  const bucket = {
    file: path => ({
      save: () => { saved.push(path); return Promise.resolve(); },
      delete: () => Promise.resolve()
    })
  };

  await assert.rejects(uploadManualStorePaymentReceipt({
    db,
    bucket,
    slug: 'store-a',
    orderId: 'order-a',
    checkoutAccessToken: accessToken,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    fileName: 'replacement.png'
  }), /can no longer accept a receipt/);
  assert.equal(saved.length, 0);
  assert.equal(db.writes.length, 0);
});

test('concurrent Approve and Reject attempts produce exactly one final review', async () => {
  const db = createFakeDb({
    'storeOrders/order-a': structuredClone(pendingOrder),
    'workspaces/workspace-a': { ownerId: 'owner-a' }
  });

  const results = await Promise.allSettled([
    reviewManualStorePayment({ db, uid: 'owner-a', orderId: 'order-a', decision: 'approve' }),
    reviewManualStorePayment({ db, uid: 'owner-a', orderId: 'order-a', decision: 'reject' })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(db.writes.filter(write => write.ref.key === 'storeOrders/order-a').length, 1);
  assert.equal(db.writes.filter(write => write.ref.collectionName === 'storeOrderTimeline').length, 1);
  assert.equal(db.writes.filter(write => write.ref.collectionName === 'storeNotifications').length, 1);
});
