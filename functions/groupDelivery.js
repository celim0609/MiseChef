import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { deliveryDistanceKm } from './storeDeliveryPricing.js';
import { getValidPickupDates } from './storePaymentsCore.js';
import { productAllowsFulfilmentDate } from './storeProductAvailability.js';
import { hasEmbeddedMenu, resolveHealthyLunchDay, validCalendarDate } from './storeWeeklyMealPlan.js';
import { snapshotMealOptions } from './healthyLunchOptions.js';
import { hasActiveBusinessEntitlement } from './subscriptionFoundation.js';

export const GROUP_DELIVERY_PILOT = Object.freeze({
  areaId: 'pakatan-bercham-raya', areaName: 'Pakatan / Bercham Raya',
  centerAddress: '44, Laluan Pakatan Jaya 3, Pakatan Jaya, 31150 Ipoh, Perak',
  center: { latitude: 4.6413277, longitude: 101.1445881 },
  centerSource: 'user_confirmed_google_maps_pin',
  centerMapsUrl: 'https://www.google.com/maps?q=4.6413277,101.1445881',
  // Area eligibility center only. Kitchen pickup stays in the existing Store configuration.
  centerVerifiedAt: '2026-11-01', radiusMetres: 1000, minimumPortions: 10,
  deliveryWindow: { start: '11:00', end: '13:00' },
  customerDeliveryFeeMinor: 0, currency: 'MYR', timeZone: 'Asia/Kuala_Lumpur'
});
// Preserve the original Bercham key so existing Beta reservations remain readable.
const GROUP_DELIVERY_AREAS = Object.freeze({
  [GROUP_DELIVERY_PILOT.areaId]: GROUP_DELIVERY_PILOT
});
export const getGroupDeliveryArea = (areaId = GROUP_DELIVERY_PILOT.areaId) => {
  if (typeof areaId !== 'string' || !Object.hasOwn(GROUP_DELIVERY_AREAS, areaId)) {
    throw new HttpsError('invalid-argument', 'Choose a configured delivery area.');
  }
  return GROUP_DELIVERY_AREAS[areaId];
};

export const listGroupDeliveryAreas = () => Object.values(GROUP_DELIVERY_AREAS)
  .map(({ areaId, areaName }) => ({ areaId, areaName }));

const text = value => typeof value === 'string' ? value.trim() : '';
const fail = (code, message) => { throw new HttpsError(code, message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = value => typeof value === 'string' && /^[\w-]{1,160}$/.test(value);
export const groupDeliveryKey = (storeId, date, areaId) => `${hash(storeId).slice(0,24)}_${getGroupDeliveryArea(areaId).areaId}_${date}`;
export const requireGroupDeliveryBeta = projectId => {
  if (projectId !== 'misechef-beta-fa4bf' && !projectId?.startsWith('demo-misechef-')) fail('permission-denied', 'Group Delivery is available in Beta only. / 团购配送仅在测试版开放。');
};
export const requireCustomer = uid => { if (!id(uid)) fail('unauthenticated', 'Sign in to join. / 请先登录。'); };
const configRef = (db, storeId) => db.collection('groupDeliveryConfigs').doc(storeId);
const groupRef = (db, storeId, date, areaId) => db.collection('deliveryGroups').doc(groupDeliveryKey(storeId, date, areaId));
const active = (reservation, now) => reservation.status === 'reserved' && Date.parse(reservation.expiresAt) > now.getTime();
export const activePortions = (reservations, now = new Date()) => reservations.filter(r => active(r, now)).reduce((sum, r) => sum + r.portions, 0);
// Order links and payment events are server-owned. Legacy reservations have no link.
export const paidGroupMembers = async ({ db, transaction, groupId, store, date, reservations, now }) => {
  const read = ref => transaction ? transaction.get(ref) : ref.get();
  const cutoff = Date.parse(groupDeliveryCutoff(date));
  const members = [];
  const seen = new Set();
  for (const reservation of reservations) {
    const orderId = reservation.mealOrderId;
    if (!id(orderId) || seen.has(orderId) || !['reserved', 'expired'].includes(reservation.status)
      || !Number.isSafeInteger(reservation.portions) || reservation.portions < 1) continue;
    const order = (await read(db.collection('storeOrders').doc(orderId))).data();
    const binding = order?.groupDelivery;
    if (!order || order.storeId !== store.id || order.workspaceId !== (store.workspaceId || store.id)
      || order.customerUid !== reservation.uid || binding?.groupId !== groupId
      || binding?.reservationFingerprint !== reservation.fingerprint
      || binding?.date !== date || binding?.portions !== reservation.portions
      || order.deletedAt || order.status === 'Cancelled' || order.fulfilmentStatus === 'Cancelled'
      || order.payment?.status !== 'paid' || order.payment?.refundStatus !== 'none'
      || order.payment?.refundedAmountMinor !== 0 || !(order.payment?.amountMinor > 0)) continue;
    const event = (await read(db.collection('storeOrderTimeline').doc(`${orderId}_payment-received`))).data();
    const paidAt = event?.createdAt?.toMillis?.() ?? Date.parse(event?.createdAt);
    if (event?.type !== 'payment_received' || event.orderId !== orderId
      || event.storeId !== store.id || event.workspaceId !== order.workspaceId
      || !Number.isFinite(paidAt) || paidAt >= cutoff || paidAt > now.getTime()) continue;
    seen.add(orderId);
    members.push(reservation);
  }
  return members;
};

export const eligibility = (point, areaId) => {
  const area = getGroupDeliveryArea(areaId);
  const distanceMetres = deliveryDistanceKm(area.center, point) * 1000;
  // One micrometre absorbs floating-point error at the inclusive spherical boundary.
  return { eligible: distanceMetres <= area.radiusMetres + 1e-6, distanceMetres: Math.round(distanceMetres) };
};
export const groupDeliveryCutoff = date => {
  if (!validCalendarDate(date)) fail('invalid-argument', 'Invalid delivery date.');
  return new Date(Date.parse(`${date}T17:00:00+08:00`) - 86400000).toISOString();
};
export const validateDeliveryDate = (store, config, date, now = new Date()) => {
  if (!validCalendarDate(date) || config?.enabled !== true || !config.dates?.[date]
    || !getValidPickupDates(store, now).includes(date)) fail('failed-precondition', 'This lunch date is unavailable. / 此午餐日期暂不可用。');
  const closesAt = groupDeliveryCutoff(date);
  if (!Number.isFinite(Date.parse(closesAt)) || Date.parse(closesAt) <= now.getTime()) fail('failed-precondition', 'Reservations have closed. / 预订已截止。');
  return closesAt;
};
// Explicit server-managed main-meal allowlist. Sides/options never add portions.
export const lunchMenu = (products, config, date) => Object.entries(config.eligibleProducts || {}).flatMap(([productId, portionsPerUnit]) => {
  const product = products.find(p => p.id === productId);
  if (!product || product.available !== true || !productAllowsFulfilmentDate(product, date)) return [];
  const meal = product.productType === 'weekly_meal_plan'
    ? (hasEmbeddedMenu(product) ? resolveHealthyLunchDay(product, products, date) : null) : product;
  // Legacy single-product options need the Store option-group validator; defer them.
  if (!meal || (product.productType !== 'weekly_meal_plan' && product.optionGroupIds?.length)) return [];
  return [{ productId, name: meal.name, price: meal.price, photoUrl: meal.photoUrl || '',
    portionsPerUnit, optionGroups: meal.optionGroups || [] }];
});
export const snapshotLunchSelections = (selections, products, config, date) => {
  if (!Array.isArray(selections) || !selections.length || selections.length > 20) fail('invalid-argument', 'Choose lunch meals. / 请选择午餐。');
  const menu = lunchMenu(products, config, date);
  const seen = new Set();
  let portions = 0;
  const items = selections.map(selection => {
    const meal = menu.find(m => m.productId === selection?.productId);
    if (!meal || !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 20 || seen.has(selection.productId)) fail('invalid-argument', 'Invalid or duplicate lunch selection. / 午餐选择无效或重复。');
    seen.add(selection.productId);
    const options = snapshotMealOptions(meal, date, selection.selectedMealOptions || []);
    portions += selection.quantity * meal.portionsPerUnit;
    return { productId: meal.productId, name: meal.name, quantity: selection.quantity, portionsPerUnit: meal.portionsPerUnit,
      indicativeUnitPriceMinor: Math.round(meal.price * 100) + (options.optionSurchargeUnitMinor || 0), ...options };
  });
  if (!Number.isSafeInteger(portions) || portions < 1 || portions > 100) fail('invalid-argument', 'Maximum 100 lunch portions per reservation. / 每次最多预订100份午餐。');
  return { items, portions };
};
const loadStore = async (db, slug) => {
  if (!/^[a-z0-9-]{1,160}$/.test(slug || '')) fail('invalid-argument', 'Invalid Store. / 店铺无效。');
  const snap = await db.collection('stores').where('slug', '==', slug).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || doc.data().country !== 'MY') fail('not-found', 'Store unavailable. / 店铺暂不可用。');
  return { ...doc.data(), id: doc.id };
};
export const requireGroupDeliveryManager = async ({ db, uid, store, transaction }) => {
  requireCustomer(uid);
  const workspaceId = store.workspaceId || store.id;
  const read = ref => transaction ? transaction.get(ref) : ref.get();
  const [workspace, member] = await Promise.all([
    read(db.collection('workspaces').doc(workspaceId)),
    read(db.collection('workspaceMembers').doc(`${workspaceId}_${uid}`))
  ]);
  const m = member.data();
  if (!workspace.exists || !hasActiveBusinessEntitlement(workspace.data())
    || !(workspace.data().ownerId === uid || m?.userId === uid && m.workspaceId === workspaceId && m.status === 'Active' && ['Owner', 'Manager'].includes(m.role))) fail('permission-denied', 'Owner or Manager access required. / 仅限店主或经理。');
};
export const configureGroupDelivery = async ({ db, uid, slug, input, now = new Date() }) => {
  const store = await loadStore(db, slug);
  await requireGroupDeliveryManager({ db, uid, store });
  if (typeof input?.enabled !== 'boolean' || !input.dates || !input.eligibleProducts) fail('invalid-argument', 'Invalid pilot configuration.');
  const dates = Object.entries(input.dates);
  const products = Object.entries(input.eligibleProducts);
  if (dates.length > 30 || products.length > 30 || input.enabled && (!dates.length || !products.length)) fail('invalid-argument', 'Configure lunch products and dates.');
  for (const [date] of dates) {
    if (!getValidPickupDates(store, now).includes(date) || Date.parse(groupDeliveryCutoff(date)) <= now.getTime()) fail('invalid-argument', 'Choose an available delivery date before its cutoff.');
  }
  for (const [productId, portions] of products) {
    if (!id(productId) || !Number.isInteger(portions) || portions < 1 || portions > 10) fail('invalid-argument', 'Invalid main-meal portions per unit.');
    const p = await db.collection('storeProducts').doc(productId).get();
    if (!p.exists || p.data().storeId !== store.id || p.data().available !== true || (p.data().productType === 'weekly_meal_plan' ? !hasEmbeddedMenu(p.data()) : Boolean(p.data().optionGroupIds?.length))) fail('invalid-argument', 'Choose available lunch products from this Store.');
  }
  // All geographic and fee policy fields come from the reviewed pilot, never input.
  const config = { enabled: input.enabled, dates: Object.fromEntries(dates.map(([date]) => [date, { closesAt: groupDeliveryCutoff(date) }])),
    eligibleProducts: Object.fromEntries(products), ...GROUP_DELIVERY_PILOT, storeId: store.id,
    workspaceId: store.workspaceId || store.id, updatedBy: uid, updatedAt: now.toISOString() };
  await configRef(db, store.id).set(config);
  return { configured: true };
};
export const getGroupDelivery = async ({ db, slug, date, areaId, uid, now = new Date() }) => {
  const area = getGroupDeliveryArea(areaId);
  const store = await loadStore(db, slug);
  const config = (await configRef(db, store.id).get()).data();
  if (!config) return { available: false };
  const availableDates = Object.keys(config.dates).filter(d => {
    try { validateDeliveryDate(store, config, d, now); return true; } catch { return false; }
  }).sort();
  const selectedDate = date || availableDates[0] || Object.keys(config.dates || {}).sort().find(d => validCalendarDate(d) && Date.parse(`${d}T13:00:00+08:00`) > now.getTime());
  if (!selectedDate || !config.dates[selectedDate] || !validCalendarDate(selectedDate)) return { available: true, dates: availableDates, date: '', menu: [], joinedPortions: 0, ...area, areas: listGroupDeliveryAreas() };
  const reference = groupRef(db, store.id, selectedDate, area.areaId);
  const [group, reservations, products] = await Promise.all([
    reference.get(), reference.collection('groupDeliveryReservations').get(),
    db.collection('storeProducts').where('storeId', '==', store.id).where('available', '==', true).get()
  ]);
  const joinedPortions = activePortions(reservations.docs.map(d => d.data()), now);
  const paid = await paidGroupMembers({ db, groupId: reference.id, store, date: selectedDate, reservations: reservations.docs.map(d => d.data()), now });
  const paidPortions = paid.reduce((sum, member) => sum + member.portions, 0);
  const mine = uid ? reservations.docs.find(d => d.id === uid)?.data() : null;
  const paidMine = paid.some(member => member.uid === uid);
  const open = availableDates.includes(selectedDate) && (!group.exists || group.data().status === 'collecting');
  // Explicit projection. Neither customer identities nor locations leave this endpoint.
  return { available: true, ...area, areas: listGroupDeliveryAreas(), dates: availableDates, date: selectedDate,
    closesAt: groupDeliveryCutoff(selectedDate), joinedPortions, paidPortions,
    canChooseFallback: paidMine && !mine?.deliveryFeeVerification && paidPortions < 10 && group.data()?.status !== 'approved'
      && now.getTime() >= Date.parse(groupDeliveryCutoff(selectedDate))
      && now.getTime() < Date.parse(`${selectedDate}T13:00:00+08:00`),
    status: group.data()?.approval?.paidPolicy === true && paidPortions >= 10 ? 'approved' : paidPortions >= 10 ? 'ready_for_review' : !open ? 'closed' : 'collecting',
    menu: open ? lunchMenu(products.docs.map(d => ({ ...d.data(), id: d.id })), config, selectedDate) : [],
    sharePath: `/store/${encodeURIComponent(slug)}/group-delivery?date=${selectedDate}&area=${area.areaId}`,
    mine: mine ? { paymentConfirmed: paidMine, deliveryFeeVerified: Boolean(mine.deliveryFeeVerification), cancellationRequested: Boolean(mine.cancellationRequestedAt), status: active(mine, now) ? 'reserved' : mine.status === 'cancelled' ? 'cancelled' : 'expired',
      portions: mine.portions, expiresAt: mine.expiresAt } : null };
};
export const reserveGroupDelivery = async ({ db, uid, slug, input, resolvePlace, now, clock = () => new Date() }) => {
  const operationNow = now || clock();
  const area = getGroupDeliveryArea(input?.areaId);
  requireCustomer(uid);
  if (!id(input?.requestId) || !id(input?.placeId) || !validCalendarDate(input?.date) || !Array.isArray(input?.selections) || input.selections.length < 1 || input.selections.length > 20) fail('invalid-argument', 'Invalid reservation. / 预订无效。');
  const name = text(input.name), phone = text(input.phone), unit = text(input.unit);
  if (!name || name.length > 100 || !/^\+?\d[\d ()-]{7,24}$/.test(phone) || unit.length > 300) fail('invalid-argument', 'Enter a name and valid phone. / 请填写姓名和有效电话号码。');
  const fingerprint = hash({ date: input.date, selections: input.selections, placeId: input.placeId, name, phone, unit });
  const store = await loadStore(db, slug);
  const reference = groupRef(db, store.id, input.date, area.areaId);
  const reservationRef = reference.collection('groupDeliveryReservations').doc(uid);
  const old = (await reservationRef.get()).data();
  if (old?.requestId === input.requestId) {
    if (old.fingerprint !== fingerprint) fail('already-exists', 'Submission changed. / 提交内容已更改。');
    return { duplicate: true, status: active(old, operationNow) ? 'reserved' : old.status === 'cancelled' ? 'cancelled' : 'expired', portions: old.portions, expiresAt: old.expiresAt };
  }
  // Ignore all client coordinates/address labels. Resolve the selected Place on server.
  const place = await resolvePlace(input.placeId);
  if (!eligibility(place, area.areaId).eligible) fail('out-of-range', 'Outside the 1 km pilot area. / 地址不在1公里试点范围内。');
  return db.runTransaction(async tx => {
    // Read the group first so reservation and approval contend on the same document.
    const group = await tx.get(reference);
    const existing = await tx.get(reservationRef);
    const checkedAt = now || clock();
    const previous = existing.data();
    if (previous?.requestId === input.requestId) {
      if (previous.fingerprint !== fingerprint) fail('already-exists', 'Submission changed. / 提交内容已更改。');
      return { duplicate: true, status: active(previous, checkedAt) ? 'reserved' : previous.status === 'cancelled' ? 'cancelled' : 'expired', portions: previous.portions, expiresAt: previous.expiresAt };
    }
    if (previous && active(previous, checkedAt)) fail('already-exists', 'You have joined this date. Cancel before changing meals. / 您已参加此日期；更改餐点前请先取消。');
    const configSnapshot = await tx.get(configRef(db, store.id));
    const freshStore = await tx.get(db.collection('stores').doc(store.id));
    const reservations = await tx.get(reference.collection('groupDeliveryReservations').select('status'));
    const catalog = await tx.get(db.collection('storeProducts').where('storeId', '==', store.id).where('available', '==', true));
    const commitAt = now || clock();
    const config = configSnapshot.data();
    if (!freshStore.exists || freshStore.data().slug !== slug || freshStore.data().country !== 'MY') fail('failed-precondition', 'Store unavailable. / 店铺暂不可用。');
    const expiresAt = validateDeliveryDate(freshStore.data() || {}, config, input.date, commitAt);
    if (group.exists && group.data().status !== 'collecting') fail('failed-precondition', 'This group is closed. / 此团已截止。');
    if (reservations.size >= 100 && !existing.exists) fail('resource-exhausted', 'Pilot group is full. / 试点团已满。');
    const snapshot = snapshotLunchSelections(input.selections, catalog.docs.map(d => ({ ...d.data(), id: d.id })), config, input.date);
    if (!group.exists) tx.create(reference, { storeId: store.id, workspaceId: store.workspaceId || store.id, date: input.date,
      areaId: area.areaId, status: 'collecting', customerDeliveryFeeMinor: 0, createdAt: commitAt.toISOString() });
    // Touch group on every write, serializing joins/cancels and future approval.
    else tx.update(reference, { updatedAt: commitAt.toISOString() });
    tx.set(reservationRef, { ...snapshot, uid, storeId: store.id, date: input.date, status: 'reserved', expiresAt,
      requestId: input.requestId, fingerprint, name, phone, unit,
      address: { placeId: input.placeId, formattedAddress: place.formattedAddress, latitude: place.latitude, longitude: place.longitude },
      customerDeliveryFeeMinor: 0, paymentStatus: 'not_requested', createdAt: commitAt.toISOString() });
    return { duplicate: false, status: 'reserved', portions: snapshot.portions, expiresAt };
  });
};
export const cancelGroupDelivery = async ({ db, uid, slug, date, areaId, now = new Date() }) => {
  requireCustomer(uid);
  if (!validCalendarDate(date)) fail('invalid-argument', 'Invalid date.');
  const store = await loadStore(db, slug), ref = groupRef(db, store.id, date, areaId);
  return db.runTransaction(async tx => {
    const group = await tx.get(ref), reservation = await tx.get(ref.collection('groupDeliveryReservations').doc(uid));
    if (group.exists && group.data().status !== 'collecting') fail('failed-precondition', 'This group is closed. / 此团已截止。');
    if (reservation.data()?.mealOrderId) fail('failed-precondition', 'Use the paid reservation cancellation workflow.');
    if (reservation.exists && reservation.data().status === 'reserved') {
      tx.update(reservation.ref, { status: 'cancelled', cancelledAt: now.toISOString() });
      tx.update(ref, { updatedAt: now.toISOString() });
    }
    return { cancelled: true };
  });
};
// Scheduled materialization only; eligibility/counts always apply expiresAt themselves.
export const expireGroupDelivery = async ({ db, now = new Date() }) => {
  const snapshot = await db.collectionGroup('groupDeliveryReservations').where('status', '==', 'reserved').where('expiresAt', '<=', now.toISOString()).limit(250).get();
  let expired = 0;
  for (const doc of snapshot.docs) {
    if (doc.ref.parent.parent?.parent.id !== 'deliveryGroups') continue;
    await db.runTransaction(async tx => {
      const current = await tx.get(doc.ref);
      if (current.data()?.status === 'reserved' && Date.parse(current.data().expiresAt) <= now.getTime()) {
        tx.update(doc.ref, { status: 'expired', expiredAt: now.toISOString() }); expired++;
      }
    });
  }
  return { expired };
};

export const getGroupDeliveryConfiguration = async ({ db, uid, slug, now = new Date() }) => {
  const store = await loadStore(db, slug);
  await requireGroupDeliveryManager({ db, uid, store });
  const [configuration, products] = await Promise.all([configRef(db, store.id).get(),
    db.collection('storeProducts').where('storeId', '==', store.id).where('available', '==', true).get()]);
  const config = configuration.data();
  return { config: config ? { enabled: config.enabled, dates: config.dates, eligibleProducts: config.eligibleProducts } : { enabled: false, dates: {}, eligibleProducts: {} },
    dates: getValidPickupDates(store, now).filter(date => Date.parse(groupDeliveryCutoff(date)) > now.getTime()),
    products: products.docs.filter(d => { const p = d.data(); return p.productType === 'weekly_meal_plan' ? hasEmbeddedMenu(p) : !p.optionGroupIds?.length; })
      .map(d => ({ productId: d.id, name: d.data().name })), ...GROUP_DELIVERY_PILOT };
};

const loadPaidFallback = async ({ db, uid, slug, date, areaId, now, transaction }) => {
  requireCustomer(uid);
  const cutoff = Date.parse(groupDeliveryCutoff(date));
  if (now.getTime() < cutoff || now.getTime() >= Date.parse(`${date}T13:00:00+08:00`)) {
    fail('failed-precondition', 'Delivery choices are available after cutoff and before the delivery window ends.');
  }
  const store = await loadStore(db, slug);
  const reference = groupRef(db, store.id, date, areaId);
  const read = ref => transaction ? transaction.get(ref) : ref.get();
  const group = (await read(reference)).data();
  if (!group || group.storeId !== store.id || group.workspaceId !== (store.workspaceId || store.id) || group.status === 'approved') {
    fail('failed-precondition', 'This group is not eligible for delivery choices.');
  }
  const reservations = await read(reference.collection('groupDeliveryReservations'));
  const members = await paidGroupMembers({ db, transaction, groupId: reference.id, store, date,
    reservations: reservations.docs.map(doc => doc.data()), now });
  const mine = members.find(member => member.uid === uid);
  if (!mine) fail('permission-denied', 'A confirmed meal payment is required.');
  if (mine.deliveryFeeVerification) fail('failed-precondition', 'The delivery fee is already verified.');
  if (members.reduce((total, member) => total + member.portions, 0) >= GROUP_DELIVERY_PILOT.minimumPortions) {
    fail('failed-precondition', 'The group has reached its target and is awaiting review.');
  }
  return { reference, mine };
};

export const quoteGroupDeliveryFallback = async ({ db, uid, slug, date, areaId, time, quote, now, clock = () => new Date() }) => {
  const startedAt = now || clock();
  if (!/^\d{2}:[0-5]\d$/.test(time || '') || time < '11:00' || time >= '13:00') {
    fail('invalid-argument', 'Choose a time within the delivery window.');
  }
  const { mine } = await loadPaidFallback({ db, uid, slug, date, areaId, now: startedAt });
  const selections = await Promise.all(mine.items.map(async item => {
    const product = (await db.collection('storeProducts').doc(item.productId).get()).data();
    const options = item.selectedMealOptions?.map(({ serviceDate, optionGroupId, optionId }) => ({ serviceDate, optionGroupId, optionId }));
    if (!hasEmbeddedMenu(product)) return { productId: item.productId, quantity: item.quantity };
    const meal = resolveHealthyLunchDay(product, [product], date);
    if (!meal?.id) fail('failed-precondition', 'This meal is unavailable for a delivery quote.');
    return { productId: meal.id, healthyLunchPlanId: item.productId, healthyLunchDate: date,
      quantity: item.quantity, ...(options?.length ? { selectedMealOptions: options } : {}) };
  }));
  const result = await quote({ db, slug, customerUid: uid, draft: {
    fulfilmentMethod: 'delivery', deliveryMode: 'preorder', deliveryDate: date, deliveryTime: time,
    selections, destination: { ...mine.address, deliveryInstructions: mine.unit || '' }
  } });
  const { customerDeliveryFee, expiresAt, currency, minimumValidityMs } = result.quote || {};
  if (currency !== 'MYR' || !Number.isFinite(customerDeliveryFee) || customerDeliveryFee < 0
    || !Number.isFinite(Date.parse(expiresAt))
    || Date.parse(expiresAt) <= (now || clock()).getTime() + (minimumValidityMs || 0)) {
    fail('failed-precondition', 'A valid delivery quote is unavailable.');
  }
  const quoteId = result.pricingSnapshotId;
  const amountMinor = Math.round(customerDeliveryFee * 100);
  if (!id(quoteId) || !Number.isSafeInteger(amountMinor)) fail('failed-precondition', 'A valid delivery quote is unavailable.');
  await db.runTransaction(async transaction => {
    const checkedAt = now || clock();
    const current = await loadPaidFallback({ db, uid, slug, date, areaId, now: checkedAt, transaction });
    if (current.mine.mealOrderId !== mine.mealOrderId || current.mine.fingerprint !== mine.fingerprint
      || Date.parse(expiresAt) <= checkedAt.getTime() + (minimumValidityMs || 0)) {
      fail('failed-precondition', 'The reservation or quote changed. Request a fresh quote.');
    }
    transaction.update(current.reference.collection('groupDeliveryReservations').doc(uid), {
      fallbackQuote: { quoteId, amountMinor, expiresAt, currency, time, mealOrderId: mine.mealOrderId }
    });
  });
  return { customerDeliveryFee, expiresAt, currency };
};

export const requestGroupDeliveryCancellation = async ({ db, uid, slug, date, areaId, now = new Date() }) =>
  db.runTransaction(async transaction => {
    const { reference } = await loadPaidFallback({ db, uid, slug, date, areaId, now, transaction });
    transaction.update(reference.collection('groupDeliveryReservations').doc(uid), {
      status: 'cancelled', cancellationRequestedAt: now.toISOString()
    });
    transaction.update(reference, { updatedAt: now.toISOString() });
    return { requested: true };
  });

// Staff record receipt of a separately paid fee. No payment adapter is invoked.
export const verifyGroupDeliveryFee = async ({ db, uid, storeId, groupId, customerId, quoteId, amountMinor, receipt, now }) => {
  requireCustomer(uid);
  if (![storeId, groupId, customerId, quoteId].every(id) || !Number.isSafeInteger(amountMinor) || amountMinor < 0
    || typeof receipt !== 'string' || !receipt.trim() || receipt.trim().length > 120) {
    fail('invalid-argument', 'Provide the reviewed quote, exact amount and external receipt reference.');
  }
  const receiptReference = receipt.trim();
  return db.runTransaction(async transaction => {
    const storeDoc = await transaction.get(db.collection('stores').doc(storeId));
    if (!storeDoc.exists || storeDoc.data().country !== 'MY') fail('not-found', 'Store unavailable.');
    const store = { ...storeDoc.data(), id: storeId };
    await requireGroupDeliveryManager({ db, uid, store, transaction });
    const groupRef = db.collection('deliveryGroups').doc(groupId);
    const group = (await transaction.get(groupRef)).data();
    if (!group || group.storeId !== storeId || group.workspaceId !== (store.workspaceId || storeId)
      || groupDeliveryKey(storeId, group.date, group.areaId) !== groupId) fail('permission-denied', 'Group unavailable.');
    const memberRef = groupRef.collection('groupDeliveryReservations').doc(customerId);
    const member = (await transaction.get(memberRef)).data();
    const previous = member?.deliveryFeeVerification;
    if (previous) {
      if (previous.quoteId === quoteId && previous.amountMinor === amountMinor && previous.receiptReference === receiptReference) {
        return { verified: true, duplicate: true };
      }
      fail('already-exists', 'A delivery fee is already recorded.');
    }
    const current = await loadPaidFallback({ db, uid: customerId, slug: store.slug, date: group.date, areaId: group.areaId,
      now: now || new Date(), transaction });
    const quote = current.mine.fallbackQuote;
    const verifiedAt = now || new Date();
    if (quote?.quoteId !== quoteId || quote.amountMinor !== amountMinor || quote.currency !== 'MYR'
      || quote.mealOrderId !== current.mine.mealOrderId || !(Date.parse(quote.expiresAt) > verifiedAt.getTime())) {
      fail('failed-precondition', 'The quote is expired or the amount changed.');
    }
    const receiptRef = db.collection('groupDeliveryFeeReceipts').doc(hash([storeId, receiptReference.toLowerCase()]));
    if ((await transaction.get(receiptRef)).exists) fail('already-exists', 'This receipt reference was already recorded.');
    const record = { quoteId, amountMinor, currency: 'MYR', receiptReference, verifiedBy: uid,
      verifiedAt: verifiedAt.toISOString(), mealOrderId: current.mine.mealOrderId };
    transaction.create(receiptRef, { ...record, storeId, groupId, customerId });
    transaction.update(memberRef, { deliveryFeeVerification: record });
    return { verified: true, duplicate: false };
  });
};
