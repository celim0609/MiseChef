import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  reviewManualStorePayment,
  uploadManualStorePaymentReceipt
} from './storeManualPayments.js';

const makeSnapshot = (id, value) => ({
  id,
  exists: value !== undefined,
  data: () => value
});

const createFakeDb = documents => {
  const writes = [];
  const reference = (collectionName, id) => ({
    collectionName,
    id,
    key: `${collectionName}/${id}`,
    get: () => Promise.resolve(makeSnapshot(id, documents[`${collectionName}/${id}`])),
    update: data => {
      writes.push({ operation: 'direct-update', ref: reference(collectionName, id), data });
      return Promise.resolve();
    }
  });
  return {
    writes,
    collection(collectionName) {
      return { doc: id => reference(collectionName, id) };
    },
    runTransaction: handler => handler({
      get: ref => Promise.resolve(makeSnapshot(ref.id, documents[ref.key])),
      update: (ref, data) => writes.push({ operation: 'update', ref, data }),
      create: (ref, data) => writes.push({ operation: 'create', ref, data })
    })
  };
};

const pendingOrder = {
  workspaceId: 'workspace-a',
  storeId: 'workspace-a',
  paymentMethodId: 'duitnow_qr',
  payment: { provider: 'manual', status: 'pending_verification' }
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
  assert.equal(db.writes[0].data.fulfilmentStatus, 'Paid');
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
    file: path => ({ save: (bytes, options) => {
      saved.push({ path, bytes, options });
      return Promise.resolve();
    } })
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
  assert.equal(saved[0].path, 'store-payment-receipts/workspace-a/order-a/receipt.png');
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
