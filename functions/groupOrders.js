import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getValidPickupDates, readString } from './storePaymentsCore.js';

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const publicCode = () => randomBytes(18).toString('base64url');
const toIso = value => value?.toDate ? value.toDate().toISOString() : readString(value);
const groupStatus = (data, now = new Date()) => {
  if (data?.status === 'cancelled') return 'cancelled';
  if (data?.status === 'closed') return 'closed';
  const closesAt = new Date(toIso(data?.closesAt));
  return !Number.isNaN(closesAt.getTime()) && closesAt <= now ? 'closed' : 'open';
};

const loadEnabledStore = async (db, slug) => {
  const snapshot = await db.collection('stores')
    .where('slug', '==', readString(slug).toLowerCase())
    .limit(1)
    .get();
  const document = snapshot.docs[0];
  if (!document) throw new HttpsError('not-found', 'This Store is no longer available.');
  const store = { id: document.id, ...document.data() };
  if (store.hostProgram?.enabled !== true) {
    throw new HttpsError('failed-precondition', 'The Host Program is not available for this Store.');
  }
  return store;
};

export const activateHostProfile = async ({ db, uid, email, displayName }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to become a Host.');
  const reference = db.collection('hostProfiles').doc(uid);
  await reference.set({
    userId: uid,
    status: 'active',
    displayName: readString(displayName) || readString(email).split('@')[0] || 'MiseChef Host',
    email: readString(email),
    activatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { active: true };
};

const validateCreateInput = ({ store, input, now }) => {
  const name = readString(input?.name);
  if (!name || name.length > 120) throw new HttpsError('invalid-argument', 'Group name must be between 1 and 120 characters.');
  const pickupDate = readString(input?.pickupDate);
  if (!getValidPickupDates(store, now).includes(pickupDate)) {
    throw new HttpsError('failed-precondition', 'Choose an available pickup date.');
  }
  const pickupSession = readString(input?.pickupSession);
  if (!Array.isArray(store.pickupSessions) || !store.pickupSessions.includes(pickupSession)) {
    throw new HttpsError('failed-precondition', 'Choose a valid pickup time.');
  }
  const pickupLocationId = readString(input?.pickupLocationId);
  const pickupLocation = Array.isArray(store.pickupLocations)
    ? store.pickupLocations.find(location => readString(location?.id) === pickupLocationId)
    : null;
  if (!pickupLocation) throw new HttpsError('failed-precondition', 'Choose a valid pickup location.');
  const closesAt = new Date(readString(input?.closesAt));
  if (Number.isNaN(closesAt.getTime()) || closesAt <= now) {
    throw new HttpsError('invalid-argument', 'Order closing time must be in the future.');
  }
  const pickupDayEnd = new Date(`${pickupDate}T23:59:59.999Z`);
  if (closesAt > pickupDayEnd) throw new HttpsError('invalid-argument', 'Order closing time must be before pickup.');
  return { name, pickupDate, pickupSession, pickupLocation, closesAt };
};

export const createGroupOrder = async ({ db, uid, email, displayName, slug, input, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to create a Group Order.');
  const [hostSnapshot, store] = await Promise.all([
    db.collection('hostProfiles').doc(uid).get(),
    loadEnabledStore(db, slug)
  ]);
  if (!hostSnapshot.exists || hostSnapshot.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Activate your Host profile before creating a Group Order.');
  }
  const validated = validateCreateInput({ store, input, now });
  const reference = db.collection('groupOrders').doc();
  const shareCode = publicCode();
  const rewardPercent = Math.min(100, Math.max(0, Number(store.hostProgram?.rewardPercent) || 0));
  const minimumQualifyingSales = roundMoney(Math.max(0, Number(store.hostProgram?.minimumQualifyingSales) || 0));
  const hostName = readString(hostSnapshot.data()?.displayName)
    || readString(displayName)
    || readString(email).split('@')[0]
    || 'MiseChef Host';
  await reference.create({
    id: reference.id,
    shareCode,
    workspaceId: readString(store.workspaceId) || store.id,
    storeId: store.id,
    storeSlug: readString(store.slug),
    storeName: readString(store.name),
    hostId: uid,
    hostName,
    name: validated.name,
    pickupDate: validated.pickupDate,
    pickupSession: validated.pickupSession,
    pickupLocationId: readString(validated.pickupLocation.id),
    pickupLocationName: readString(validated.pickupLocation.name),
    pickupLocationAddress: readString(validated.pickupLocation.address),
    closesAt: Timestamp.fromDate(validated.closesAt),
    status: 'open',
    rewardPercent,
    minimumQualifyingSales,
    orderCount: 0,
    eligibleSales: 0,
    estimatedReward: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { groupId: reference.id, shareCode };
};

const publicGroup = (id, data, now = new Date()) => ({
  id,
  shareCode: readString(data.shareCode),
  storeSlug: readString(data.storeSlug),
  storeName: readString(data.storeName),
  hostName: readString(data.hostName),
  name: readString(data.name),
  pickupDate: readString(data.pickupDate),
  pickupSession: readString(data.pickupSession),
  pickupLocationId: readString(data.pickupLocationId),
  pickupLocationName: readString(data.pickupLocationName),
  pickupLocationAddress: readString(data.pickupLocationAddress),
  closesAt: toIso(data.closesAt),
  status: groupStatus(data, now)
});

export const getPublicGroupOrder = async ({ db, shareCode, now = new Date() }) => {
  const snapshot = await db.collection('groupOrders')
    .where('shareCode', '==', readString(shareCode))
    .limit(1)
    .get();
  const document = snapshot.docs[0];
  if (!document) throw new HttpsError('not-found', 'This Group Order could not be found.');
  return publicGroup(document.id, document.data(), now);
};

export const listHostGroupOrders = async ({ db, uid, slug, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view Group Orders.');
  const [store, hostSnapshot] = await Promise.all([
    loadEnabledStore(db, slug),
    db.collection('hostProfiles').doc(uid).get()
  ]);
  if (!hostSnapshot.exists || hostSnapshot.data()?.status !== 'active') {
    return { hostActive: false, groups: [] };
  }
  const snapshot = await db.collection('groupOrders').where('hostId', '==', uid).get();
  const groups = snapshot.docs
    .filter(document => readString(document.data().storeId) === store.id)
    .map(document => ({
      ...publicGroup(document.id, document.data(), now),
      rewardPercent: Number(document.data().rewardPercent) || 0,
      minimumQualifyingSales: Number(document.data().minimumQualifyingSales) || 0,
      orderCount: Number(document.data().orderCount) || 0,
      eligibleSales: Number(document.data().eligibleSales) || 0,
      estimatedReward: Number(document.data().estimatedReward) || 0
    }))
    .sort((a, b) => b.closesAt.localeCompare(a.closesAt));
  return { hostActive: true, groups };
};

export const transitionGroupOrder = async ({ db, uid, groupId, nextStatus, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage Group Orders.');
  const normalizedGroupId = readString(groupId);
  if (!normalizedGroupId) throw new HttpsError('invalid-argument', 'Choose a Group Order.');
  if (!['closed', 'cancelled'].includes(nextStatus)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Group status.');
  }
  return db.runTransaction(async transaction => {
    const reference = db.collection('groupOrders').doc(normalizedGroupId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError('not-found', 'This Group Order could not be found.');
    const group = snapshot.data();
    if (readString(group.hostId) !== uid) {
      throw new HttpsError('permission-denied', 'You can manage only your own Group Orders.');
    }
    const currentStatus = groupStatus(group, now);
    if (currentStatus === nextStatus) {
      return { groupId: normalizedGroupId, status: nextStatus };
    }
    if (currentStatus !== 'open') {
      throw new HttpsError('failed-precondition', 'A closed or cancelled Group cannot be changed.');
    }
    const auditPrefix = nextStatus === 'closed' ? 'closed' : 'cancelled';
    transaction.update(reference, {
      status: nextStatus,
      [`${auditPrefix}At`]: FieldValue.serverTimestamp(),
      [`${auditPrefix}By`]: uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    return { groupId: normalizedGroupId, status: nextStatus };
  });
};

const hostOrder = document => {
  const data = document.data();
  return {
    id: document.id,
    orderNumber: readString(data.orderNumber),
    customerName: readString(data.customerName) || 'Customer',
    itemCount: Math.max(0, Number(data.itemCount) || 0),
    total: roundMoney(Math.max(0, Number(data.total) || 0)),
    currency: data.currency === 'SGD' ? 'SGD' : 'MYR',
    paymentStatus: readString(data.payment?.status) || 'pending',
    fulfilmentStatus: readString(data.fulfilmentStatus) || 'New',
    createdAt: toIso(data.createdAt)
  };
};

export const listHostGroupOrdersDetail = async ({ db, uid, groupId, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage Group Orders.');
  const normalizedGroupId = readString(groupId);
  if (!normalizedGroupId) throw new HttpsError('invalid-argument', 'Choose a Group Order.');
  const groupSnapshot = await db.collection('groupOrders').doc(normalizedGroupId).get();
  if (!groupSnapshot.exists) throw new HttpsError('not-found', 'This Group Order could not be found.');
  const group = groupSnapshot.data();
  if (readString(group.hostId) !== uid) {
    throw new HttpsError('permission-denied', 'You can view only your own Group Orders.');
  }
  const ordersSnapshot = await db.collection('storeOrders')
    .where('groupOrder.id', '==', normalizedGroupId)
    .get();
  const orders = ordersSnapshot.docs
    .map(hostOrder)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    group: {
      ...publicGroup(groupSnapshot.id, group, now),
      rewardPercent: Number(group.rewardPercent) || 0,
      minimumQualifyingSales: Number(group.minimumQualifyingSales) || 0,
      orderCount: Number(group.orderCount) || 0,
      eligibleSales: Number(group.eligibleSales) || 0,
      estimatedReward: Number(group.estimatedReward) || 0
    },
    orders
  };
};

export const resolveCheckoutGroup = async ({ db, store, draft, now = new Date() }) => {
  const shareCode = readString(draft?.groupShareCode);
  if (!shareCode) return null;
  const group = await getPublicGroupOrder({ db, shareCode, now });
  const snapshot = await db.collection('groupOrders').doc(group.id).get();
  const data = snapshot.data();
  if (!data || readString(data.storeId) !== readString(store.id)) throw new Error('This Group Order belongs to a different Store.');
  if (group.status !== 'open') throw new Error('This Group Order is closed.');
  if (readString(draft.pickupDate) !== group.pickupDate
    || readString(draft.pickupSession) !== group.pickupSession
    || readString(draft.pickupLocationId) !== group.pickupLocationId) {
    throw new Error('Pickup details must match this Group Order.');
  }
  return {
    id: group.id,
    shareCode: group.shareCode,
    name: group.name,
    hostId: readString(data.hostId),
    hostName: group.hostName,
    rewardPercent: Number(data.rewardPercent) || 0
  };
};

export const revalidateCheckoutGroupInTransaction = async ({ db, transaction, groupOrder, store, draft, now = new Date() }) => {
  if (!groupOrder?.id) return null;
  const snapshot = await transaction.get(db.collection('groupOrders').doc(groupOrder.id));
  const data = snapshot.data();
  if (!snapshot.exists || readString(data?.storeId) !== readString(store.id)) {
    throw new Error('This Group Order belongs to a different Store.');
  }
  if (groupStatus(data, now) !== 'open') throw new Error('This Group Order is closed.');
  if (readString(draft.pickupDate) !== readString(data.pickupDate)
    || readString(draft.pickupSession) !== readString(data.pickupSession)
    || readString(draft.pickupLocationId) !== readString(data.pickupLocationId)) {
    throw new Error('Pickup details must match this Group Order.');
  }
  return {
    id: snapshot.id,
    shareCode: readString(data.shareCode),
    name: readString(data.name),
    hostId: readString(data.hostId),
    hostName: readString(data.hostName),
    rewardPercent: Number(data.rewardPercent) || 0
  };
};

export const calculateRewardContribution = order => {
  if (!order?.groupOrder?.id || order.orderSource !== 'online') return { eligibleSales: 0, rewardAmount: 0, eligible: false };
  const paid = order.payment?.status === 'paid';
  const cancelled = order.fulfilmentStatus === 'Cancelled';
  const refunded = order.payment?.refundStatus === 'refunded';
  if (!paid || cancelled || refunded) return { eligibleSales: 0, rewardAmount: 0, eligible: false };
  const totalMinor = Math.max(0, Math.round((Number(order.total) || 0) * 100));
  const refundedMinor = Math.max(0, Number(order.payment?.refundedAmountMinor) || 0);
  const eligibleSales = roundMoney(Math.max(0, totalMinor - refundedMinor) / 100);
  const rewardAmount = roundMoney(eligibleSales * (Number(order.groupOrder.rewardPercent) || 0) / 100);
  return { eligibleSales, rewardAmount, eligible: eligibleSales > 0 };
};

export const projectGroupRewardInTransaction = async ({ db, transaction, orderId, order }) => {
  const entryReference = db.collection('hostRewardLedger').doc(orderId);
  const previousSnapshot = await transaction.get(entryReference);
  const previous = previousSnapshot.exists ? previousSnapshot.data() : null;
  const previousGroupId = readString(previous?.groupId);
  const nextGroupId = readString(order?.groupOrder?.id);
  if (previousGroupId && nextGroupId && previousGroupId !== nextGroupId) {
    throw new Error('An order cannot move between Group Orders.');
  }
  const groupId = nextGroupId || previousGroupId;
  if (!groupId) return;
  const groupReference = db.collection('groupOrders').doc(groupId);
  const groupSnapshot = await transaction.get(groupReference);
  if (!groupSnapshot.exists) return;
  const group = groupSnapshot.data();
  const contribution = order ? calculateRewardContribution(order) : { eligibleSales: 0, rewardAmount: 0, eligible: false };
  const previousSales = Number(previous?.eligibleSales) || 0;
  const previousEligible = previous?.eligible === true;
  const orderCount = Math.max(0, (Number(group.orderCount) || 0) + (contribution.eligible ? 1 : 0) - (previousEligible ? 1 : 0));
  const eligibleSales = roundMoney(Math.max(0, (Number(group.eligibleSales) || 0) + contribution.eligibleSales - previousSales));
  const minimum = Number(group.minimumQualifyingSales) || 0;
  const estimatedReward = eligibleSales >= minimum
    ? roundMoney(eligibleSales * (Number(group.rewardPercent) || 0) / 100)
    : 0;
  transaction.set(groupReference, { orderCount, eligibleSales, estimatedReward, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  transaction.set(entryReference, {
    orderId,
    groupId,
    hostId: readString(group.hostId),
    workspaceId: readString(group.workspaceId),
    storeId: readString(group.storeId),
    eligible: contribution.eligible,
    eligibleSales: contribution.eligibleSales,
    rewardAmount: contribution.rewardAmount,
    status: contribution.eligible ? 'pending' : 'excluded',
    reason: contribution.eligible ? '' : 'not_paid_cancelled_or_refunded',
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
};

export const projectGroupReward = async ({ db, orderId }) => {
  await db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(db.collection('storeOrders').doc(orderId));
    await projectGroupRewardInTransaction({
      db,
      transaction,
      orderId,
      order: orderSnapshot.exists ? { id: orderSnapshot.id, ...orderSnapshot.data() } : null
    });
  });
};
