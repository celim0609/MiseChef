import { createHash, randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { GROUP_DELIVERY_PILOT, paidGroupMembers, eligibility, getGroupDeliveryArea, groupDeliveryCutoff, listGroupDeliveryAreas, requireGroupDeliveryManager } from './groupDelivery.js';
import { lalamoveCoordinate } from './storeDelivery.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const validId = value => typeof value === 'string' && /^[\w-]{1,180}$/.test(value);
const fail = (code, message) => { throw new HttpsError(code, message); };
const read = (tx, ref) => tx ? tx.get(ref) : ref.get();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const loadReviewStore = async ({ db, uid, storeId, workspaceId, transaction }) => {
  if (!validId(storeId) || !validId(workspaceId)) fail('invalid-argument', 'Choose a Store and Workspace. / 请选择店铺与工作区。');
  const doc = await read(transaction, db.collection('stores').doc(storeId));
  const store = { ...doc.data(), id: doc.id };
  if (!doc.exists || store.country !== 'MY' || (store.workspaceId || store.id) !== workspaceId) fail('permission-denied', 'Store does not belong to this Workspace. / 店铺不属于此工作区。');
  await requireGroupDeliveryManager({ db, uid, store, transaction });
  return store;
};
const loadReview = async ({ db, store, groupId, transaction, now }) => {
  if (!validId(groupId)) fail('invalid-argument', 'Invalid group. / 团购无效。');
  const reference = db.collection('deliveryGroups').doc(groupId);
  const [group, configuration, reservations] = await Promise.all([
    read(transaction, reference), read(transaction, db.collection('groupDeliveryConfigs').doc(store.id)),
    read(transaction, reference.collection('groupDeliveryReservations'))
  ]);
  const data = group.data();
  if (!group.exists || data.storeId !== store.id || data.workspaceId !== (store.workspaceId || store.id)) fail('permission-denied', 'Group does not belong to this Store. / 此团不属于该店铺。');
  const members = await paidGroupMembers({ db, transaction, groupId, store, date: data.date,
    reservations: reservations.docs.map(d => ({ ...d.data(), id: d.id })), now });
  members.sort((a,b) => a.id.localeCompare(b.id));
  const config = configuration.data();
  const fingerprint = digest({ storeId: store.id, workspaceId: store.workspaceId || store.id, date: data.date,
    areaId: data.areaId, config, delivery: store.delivery || null, members });
  return { reference, group: data, config, members,
    cancellationRequests: reservations.docs.filter(doc => doc.data().cancellationRequestedAt)
      .map(doc => ({ customerId: doc.id, mealOrderId: doc.data().mealOrderId, requestedAt: doc.data().cancellationRequestedAt })),
    fingerprint, activePortions: members.reduce((sum, member) => sum + member.portions, 0),
    expiresAt: groupDeliveryCutoff(data.date) };
};
const summary = (id, state) => ({ id, date: state.group.date, areaId: state.group.areaId, areaName: getGroupDeliveryArea(state.group.areaId).areaName,
  status: state.group.status, activePortions: state.activePortions, target: GROUP_DELIVERY_PILOT.minimumPortions,
  expiresAt: state.expiresAt, ...(state.group.approval ? { approval: state.group.approval } : {}) });
const managerMember = member => ({ id: member.id, name: member.name, phone: member.phone, unit: member.unit,
  address: member.address, items: member.items, portions: member.portions, expiresAt: member.expiresAt,
  ...(member.fallbackQuote ? { fallbackQuote: member.fallbackQuote } : {}),
  ...(member.deliveryFeeVerification ? { deliveryFeeVerified: true } : {}) });
export const listGroupDeliveryReview = async args => {
  const { db, now = new Date(), cursor = '', date = '', areaId = '' } = args;
  const store = await loadReviewStore(args);
  let query = db.collection('deliveryGroups').where('storeId', '==', store.id).orderBy('date', 'asc');
  if (areaId) query = query.where('areaId', '==', getGroupDeliveryArea(areaId).areaId);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('invalid-argument', 'Invalid delivery date.');
    query = query.where('date', '==', date);
  }
  if (cursor) {
    if (!validId(cursor)) fail('invalid-argument', 'Invalid page.');
    const previous = await db.collection('deliveryGroups').doc(cursor).get();
    if (!previous.exists || previous.data().storeId !== store.id || (areaId && previous.data().areaId !== areaId) || (date && previous.data().date !== date)) fail('permission-denied', 'Invalid page.');
    query = query.startAfter(previous);
  }
  const page = await query.limit(26).get();
  const documents = page.docs.slice(0,25);
  const groups = await Promise.all(documents.map(async doc => {
    const group = doc.data();
    const reservations = await doc.ref.collection('groupDeliveryReservations')
      .select('status', 'uid', 'fingerprint', 'mealOrderId', 'portions').get();
    const paid = await paidGroupMembers({ db, groupId: doc.id, store, date: group.date, reservations: reservations.docs.map(reservation => reservation.data()), now });
    return summary(doc.id, {
      group,
      activePortions: paid.reduce((sum, member) => sum + member.portions, 0),
      expiresAt: groupDeliveryCutoff(group.date)
    });
  }));
  return { groups, areas: listGroupDeliveryAreas(), cursor: page.size > 25 ? documents.at(-1).id : '' };
};
export const getGroupDeliveryReview = async args => {
  const { db, now = new Date(), groupId } = args;
  const store = await loadReviewStore(args);
  const state = await loadReview({ db, store, groupId, now });
  const [history, estimates] = await Promise.all([
    state.reference.collection('approvals').get(), state.reference.collection('estimates').orderBy('createdAt','desc').limit(1).get()
  ]);
  const last = estimates.docs[0];
  const estimate = last ? last.data() : null;
  return { group: summary(groupId,state), members: state.members.map(managerMember), cancellationRequests: state.cancellationRequests,
    pickup: store.delivery?.pickup ? { address: store.delivery.pickup.address, latitude: store.delivery.pickup.latitude, longitude: store.delivery.pickup.longitude } : null,
    estimate: estimate ? { id: last.id, ...estimate, valid: estimate.fingerprint === state.fingerprint && Date.parse(estimate.expiresAt) > now.getTime() && state.group.status === 'collecting' } : null,
    history: history.docs.map(d => ({ id:d.id,...d.data() })).sort((a,b) => b.approvedAt.localeCompare(a.approvedAt)) };
};
const validateCollecting = (store, state, now) => {
  if (state.group.status !== 'collecting') fail('failed-precondition', 'This group is already approved or closed. / 此团已获批或截止。');
  if (!state.config?.enabled || !state.config.dates?.[state.group.date]
    || now.getTime() >= Date.parse(`${state.group.date}T13:00:00+08:00`)) {
    fail('failed-precondition', 'This delivery group is unavailable.');
  }
  for (const r of state.members) {
    if (!r.address || !eligibility(r.address, state.group.areaId).eligible || !Number.isSafeInteger(r.portions) || r.portions < 1
      || !Array.isArray(r.items) || r.items.length < 1 || r.items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isInteger(state.config.eligibleProducts?.[item.productId]) || item.portionsPerUnit !== state.config.eligibleProducts[item.productId])
      || r.items.reduce((n,item)=>n+item.quantity*item.portionsPerUnit,0) !== r.portions) fail('failed-precondition', 'A reservation needs review: address or lunch eligibility changed. / 预订地址或午餐资格已更改，请审核。');
  }
};
export const buildGroupDeliveryRoute = ({ store, members, date, pickupTime, environment, now = new Date() }) => {
  const config = store.delivery || {}, pickup = config.pickup;
  if (config.provider !== 'lalamove' || config.market !== 'MY' || environment !== 'sandbox' || config.environment !== environment || !text(config.serviceType)
    || !text(pickup?.address)) fail('failed-precondition', 'Configure the Store kitchen pickup and Sandbox Lalamove service first. / 请先设置店铺厨房取件地址及测试配送服务。');
  // Validate kitchen coordinates independently; the pilot area center is never a pickup fallback.
  try { eligibility(pickup); } catch { fail('failed-precondition', 'Kitchen pickup coordinates are missing or invalid. / 厨房取件坐标无效。'); }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pickupTime || '')) fail('invalid-argument','Choose a pickup time. / 请选择取件时间。');
  const scheduleAt = new Date(`${date}T${pickupTime}:00+08:00`).toISOString();
  if (Date.parse(scheduleAt) <= now.getTime()) fail('failed-precondition','Choose a future pickup time. / 请选择未来取件时间。');
  if (!members.length || members.length > 15) fail('failed-precondition','Quote review supports 1–15 customer stops. Larger groups need separate route planning. / 报价支持1至15个顾客站点，更多站点需另行规划。');
  const stops = [{ coordinates:{ lat:lalamoveCoordinate(pickup.latitude),lng:lalamoveCoordinate(pickup.longitude) },address:pickup.address },
    ...members.map(r => ({ coordinates:{lat:lalamoveCoordinate(r.address.latitude),lng:lalamoveCoordinate(r.address.longitude)}, address:[r.address.formattedAddress,r.unit].filter(Boolean).join(', ') }))];
  return { market:'MY',data:{ serviceType:config.serviceType,language:'en_MY',scheduleAt,isRouteOptimized:false,stops } };
};
const toEstimate = (quote, request, now) => {
  const fee = String(quote?.priceBreakdown?.total ?? '');
  if (!text(quote?.quotationId) || !/^\d+(?:\.\d{1,2})?$/.test(fee) || quote.priceBreakdown.currency !== 'MYR'
    || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now.getTime()
    || quote.serviceType !== request.data.serviceType || !Array.isArray(quote.stops) || quote.stops.length !== request.data.stops.length
    || quote.stops.some((s,i) => !s.coordinates || ![s.coordinates.lat,s.coordinates.lng].every(v => v !== '' && v != null && Number.isFinite(Number(v))) || Math.abs(Number(s.coordinates.lat)-Number(request.data.stops[i].coordinates.lat)) > 1e-9 || Math.abs(Number(s.coordinates.lng)-Number(request.data.stops[i].coordinates.lng)) > 1e-9)) fail('failed-precondition','Invalid multi-stop quotation. Refresh the estimate. / 多站点报价无效，请刷新。');
  const feeMinor = Math.round(Number(fee)*100);
  if (!Number.isSafeInteger(feeMinor) || feeMinor < 0) fail('failed-precondition','Invalid delivery cost.');
  return { quotationId:quote.quotationId,feeMinor,currency:'MYR',providerExpiresAt:quote.expiresAt,environment:'sandbox',
    serviceType:request.data.serviceType,scheduleAt:request.data.scheduleAt,route:request.data.stops };
};
export const estimateGroupDelivery = async args => {
  const { db, provider, groupId, pickupTime, now, clock = () => new Date() } = args;
  const store = await loadReviewStore(args);
  const state = await loadReview({ db, store, groupId, now:now || clock() });
  validateCollecting(store,state,now || clock());
  const request = buildGroupDeliveryRoute({store,members:state.members,date:state.group.date,pickupTime,environment:provider.environment,now:now || clock()});
  // Quote only. This module never calls createOrder or any payment/checkout service.
  const quote = toEstimate(await provider.createQuote(request),request,now || clock());
  const estimateId = randomUUID();
  return db.runTransaction(async transaction => {
    const checkedAt = now || clock();
    const currentStore = await loadReviewStore({...args,transaction});
    const current = await loadReview({db,store:currentStore,groupId,transaction,now:checkedAt});
    validateCollecting(currentStore,current,checkedAt);
    if (current.fingerprint !== state.fingerprint) fail('failed-precondition','Reservations or pickup changed. Refresh the estimate. / 预订或取件设置已更改，请刷新报价。');
    const expiresAt = new Date(Math.min(Date.parse(quote.providerExpiresAt),checkedAt.getTime()+10*60000,Date.parse(request.data.scheduleAt))).toISOString();
    if (Date.parse(expiresAt) <= checkedAt.getTime()) fail('failed-precondition','Estimate expired. / 报价已过期。');
    const estimate = {...quote,fingerprint:current.fingerprint,groupId,storeId:currentStore.id,workspaceId:currentStore.workspaceId || currentStore.id,
      portions:current.activePortions,expiresAt,createdBy:args.uid,createdAt:checkedAt.toISOString()};
    transaction.create(current.reference.collection('estimates').doc(estimateId),estimate);
    return {id:estimateId,...estimate,valid:true};
  });
};
export const approveGroupDelivery = async args => {
  const {db,groupId,estimateId,requestId,confirmFreeDelivery,expectedFeeMinor,now,clock=()=>new Date()}=args;
  if (!validId(requestId) || !validId(estimateId) || confirmFreeDelivery !== true) fail('invalid-argument','Explicit approval of free delivery and a reviewed estimate are required. / 请明确批准免费配送并审核报价。');
  return db.runTransaction(async transaction => {
    const checkedAt=now || clock();
    const store=await loadReviewStore({...args,transaction});
    const state=await loadReview({db,store,groupId,transaction,now:checkedAt});
    const approvalRef=state.reference.collection('approvals').doc('free-delivery');
    const [existing,estimateDoc]=await Promise.all([transaction.get(approvalRef),transaction.get(state.reference.collection('estimates').doc(estimateId))]);
    if (existing.exists) {
      if (existing.data().paidPolicy !== true) fail('failed-precondition', 'This legacy approval did not verify meal payments.');
      return {duplicate:true,approval:{id:existing.id,...existing.data()}};
    }
    validateCollecting(store,state,checkedAt);
    const estimate=estimateDoc.data();
    const commitAt=now || clock();
    validateCollecting(store,state,commitAt);
    if (state.activePortions < GROUP_DELIVERY_PILOT.minimumPortions) fail('failed-precondition','At least 10 paid lunch portions are required. / 至少需要10份有效午餐预订。');
    if (!estimateDoc.exists || estimate.groupId !== groupId || estimate.storeId !== store.id || estimate.workspaceId !== (store.workspaceId || store.id)
      || estimate.fingerprint !== state.fingerprint || Date.parse(estimate.expiresAt) <= commitAt.getTime() || estimate.feeMinor !== expectedFeeMinor
      || estimate.currency !== 'MYR' || estimate.environment !== 'sandbox' || Date.parse(estimate.scheduleAt) <= commitAt.getTime()) fail('failed-precondition','Estimate expired or group changed. Review and refresh before approving. / 报价已过期或团购已更改，请重新审核报价。');
    const approval={groupId,storeId:store.id,workspaceId:store.workspaceId || store.id,approvedBy:args.uid,approvedAt:commitAt.toISOString(),
      requestId,estimateId,estimatedDeliveryCostMinor:estimate.feeMinor,currency:'MYR',customerDeliveryFeeMinor:0,approvedPortions:state.activePortions,
      paidPolicy:true,reservationExpiresAt:state.expiresAt,quotationId:estimate.quotationId,environment:estimate.environment,scheduleAt:estimate.scheduleAt,
      route:estimate.route,members:state.members.map(managerMember)};
    transaction.create(approvalRef,approval);
    transaction.update(state.reference,{status:'approved',updatedAt:checkedAt.toISOString(),approval:{id:'free-delivery',paidPolicy:true,approvedBy:args.uid,
      approvedAt:approval.approvedAt,approvedPortions:approval.approvedPortions,estimatedDeliveryCostMinor:estimate.feeMinor,currency:'MYR',customerDeliveryFeeMinor:0}});
    return {duplicate:false,approval:{id:'free-delivery',...approval}};
  });
};
