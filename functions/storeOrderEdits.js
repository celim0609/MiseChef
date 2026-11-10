import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertOperator } from './externalPosOrders.js';
import { canonicalFulfilmentDestination, canonicalFulfilmentView, normalizeDeliveryPhone } from './storeFulfilmentCanonical.js';
import { assertFutureLalamoveSchedule, validatePreOrderSchedule } from './storeDelivery.js';
import { getPickupTimeSlots, getValidPickupDates } from './storePaymentsCore.js';

const fail = (message, code = 'invalid-argument') => { throw new HttpsError(code, message); };
const id = value => typeof value === 'string' && /^[\w-]{1,150}$/.test(value);
const clean = (value, maximum, label, minimum = 0) => {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) {
    fail(`Enter a valid ${label}.`);
  }
  return value.trim();
};
const assertKeys = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) fail('Unsupported order edit field.');
};
const bookingBlocksEdit = operation => Boolean(operation?.providerOrder?.orderId || operation?.providerOrder?.driverId || operation?.providerOrder?.shareLink)
  || ![undefined, '', 'not_requested'].includes(operation?.dispatch?.status)
  || ![undefined, '', 'not_started'].includes(operation?.lifecycle?.state);

function assertEditable(order) {
  if (order.deletedAt || order.cancelledAt || ['Completed', 'Cancelled'].includes(order.fulfilmentStatus)
    || order.groupOrder || order.groupDelivery || (order.manualOrder && order.payment?.status === 'pending')) {
    fail('This order cannot be edited here.', 'failed-precondition');
  }
}

function editableSlots(order) {
  if (!order.fulfilments?.length && (order.weeklyFulfilments?.length
    || order.items?.some(item => item.weeklyPlanSnapshot || item.healthyLunchSnapshot?.date))) return [];
  const bookingLocked = order.activeFulfilmentDeliveries === true || bookingBlocksEdit(order.delivery)
    || Object.values(order.fulfilmentOperations || {}).some(bookingBlocksEdit);
  return (order.fulfilments?.length ? order.fulfilments : [null]).flatMap(day => {
    const view = canonicalFulfilmentView(order, day);
    if (!view.date || (view.method === 'delivery' && order.delivery?.fulfilmentMode === 'instant')) return [];
    const slotId = day?.id || 'single';
    const blocked = Boolean(order.fulfilmentCompletion?.[slotId]) || bookingLocked;
    return [{ ...view, id: slotId, blocked }];
  });
}

function validateTime(store, slot, time, now) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Choose a valid time.');
  if (slot.method === 'delivery') {
    assertFutureLalamoveSchedule(validatePreOrderSchedule(store, store.delivery || {}, {
      deliveryDate: slot.date, deliveryTime: time
    }, now), now.getTime());
  } else if (!getValidPickupDates(store, now).includes(slot.date) || !getPickupTimeSlots(store, slot.date, now).includes(time)) {
    fail('Choose an available pickup time for the original date.');
  }
}

export async function editStoreOrder({ db, uid, input, now = new Date() }) {
  if (!uid) fail('Sign in to edit orders.', 'unauthenticated');
  assertKeys(input, ['orderId', 'revision', 'changes']);
  if (!id(input.orderId)) fail('Choose a valid order.');
  const ref = db.collection('storeOrders').doc(input.orderId);
  const privateRef = ref.collection('editPrivate').doc('notes');
  const audit = ref.collection('editAudit');
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const order = snap.data();
    if (!order) fail('Order not found.', 'not-found');
    await assertOperator({ db, uid, workspaceId: order.workspaceId, financial: true, transaction: tx });
    assertEditable(order);
    const privateNotes = (await tx.get(privateRef)).data()?.notes || '';
    const revision = snap.updateTime.valueOf();
    const slots = editableSlots(order);
    const customerRemarks = order.customerRemarks ?? (order.orderSource === 'online' && !order.manualOrder && !order.externalOrder ? order.notes || '' : '');
    if (input.changes === undefined) {
      const history = await tx.get(audit.orderBy('at', 'desc').limit(10));
      return { revision, customerName: order.customerName || '', phone: order.phone || '', customerRemarks, internalNotes: privateNotes, slots,
        audit: history.docs.map(doc => {
          const { at, ...entry } = doc.data();
          return { id: doc.id, ...entry, at: at.toDate().toISOString() };
        }) };
    }
    if (input.revision !== revision) fail('This order changed. Close and reopen the editor.', 'failed-precondition');
    const changes = input.changes;
    assertKeys(changes, ['customerName', 'phone', 'customerRemarks', 'internalNotes', 'slots']);
    const patch = {};
    const diff = [];
    function record(field, before, after) {
      if (before === after) return false;
      diff.push({ field, before, after });
      return true;
    }
    for (const [field, before, maximum] of [
      ['customerName', order.customerName || '', 120], ['phone', order.phone || '', 40],
      ['customerRemarks', customerRemarks, 500], ['internalNotes', privateNotes, 500]
    ]) {
      if (!(field in changes)) continue;
      const after = clean(changes[field], maximum, field, field === 'customerName' ? 1 : 0);
      if (!record(field, before, after)) continue;
      if (field === 'phone' && after && !normalizeDeliveryPhone(after, order.currency === 'SGD' ? 'SG' : 'MY')) fail('Enter a valid phone number.');
      patch[field] = after;
    }
    if (changes.slots !== undefined) {
      if (!Array.isArray(changes.slots) || changes.slots.length > slots.length
        || new Set(changes.slots.map(slot => slot?.id)).size !== changes.slots.length) fail('Choose valid order slots.');
      const store = (await tx.get(db.collection('stores').doc(order.storeId))).data();
      if (!store || store.workspaceId !== order.workspaceId) fail('Store settings are unavailable.', 'failed-precondition');
      for (const edit of changes.slots) {
        assertKeys(edit, ['id', 'time', 'address']);
        const slot = slots.find(slot => slot.id === edit.id);
        if (!slot || slot.blocked) fail('Coordinate with your driver before changing this delivery.', 'failed-precondition');
        const time = 'time' in edit ? clean(edit.time, 5, 'time', 5) : slot.time;
        const address = 'address' in edit ? clean(edit.address, 500, 'delivery address', 5) : slot.address;
        if ('address' in edit && slot.method !== 'delivery') fail('Only delivery orders have a delivery address.');
        const timeChanged = record(`${slot.date} ${slot.id} time`, slot.time, time);
        const addressChanged = record(`${slot.date} ${slot.id} address`, slot.address, address);
        if (timeChanged) {
          validateTime(store, slot, time, now);
          if ((patch.fulfilments || order.fulfilments || []).some(day => day.id !== slot.id
            && day.date === slot.date && day.time === time && day.method === slot.method)) {
            fail('Another fulfilment already uses this time on the original date.');
          }
        }
        if (addressChanged) {
          if (!/[\p{L}\p{N}]/u.test(address) || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(address)) {
            fail('Enter a valid delivery address.');
          }
          patch.deliveryFeeReviewRequired = true;
        }
        if (!timeChanged && !addressChanged) continue;
        if (order.fulfilments?.length) {
          patch.fulfilments = (patch.fulfilments || order.fulfilments).map(day => day.id === slot.id ? {
            ...day, ...(timeChanged ? { time } : {}),
            ...(addressChanged ? {
              ...(order.manualOrder ? { notes: address } : {}),
              destination: {
                formattedAddress: address,
                deliveryInstructions: canonicalFulfilmentDestination(order, day).instructions || ''
              }
            } : {})
          } : day);
        } else if (slot.method === 'pickup') {
          patch.pickupTime = time;
        } else {
          if (timeChanged) patch['delivery.schedule'] = { ...order.delivery?.schedule, date: slot.date, time };
          if (addressChanged) {
            const { latitude, longitude, ...recipient } = order.delivery?.recipient || {};
            patch['delivery.recipient'] = { ...recipient, address };
          }
        }
      }
    }
    if (!diff.length) return { changed: false };
    const { internalNotes, ...publicPatch } = patch;
    if (internalNotes !== undefined) tx.set(privateRef, { notes: internalNotes });
    tx.update(ref, { ...publicPatch, updatedAt: now.toISOString() });
    tx.create(audit.doc(), { actor: uid, at: FieldValue.serverTimestamp(), changes: diff });
    tx.create(db.collection('storeOrderTimeline').doc(), {
      orderId: ref.id, workspaceId: order.workspaceId, storeId: order.storeId,
      type: 'fulfilment_status', label: 'Order details edited', actingUserId: uid, createdAt: FieldValue.serverTimestamp()
    });
    return { changed: true };
  });
}
