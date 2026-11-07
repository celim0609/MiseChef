import { listGroupDeliveryReview, getGroupDeliveryReview, estimateGroupDelivery, approveGroupDelivery } from '../functions/groupDeliveryReview.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { reserveGroupDelivery, cancelGroupDelivery, expireGroupDelivery, getGroupDelivery, configureGroupDelivery, quoteGroupDeliveryFallback, requestGroupDeliveryCancellation, verifyGroupDeliveryFee, groupDeliveryKey, GROUP_DELIVERY_PILOT as pilot } from '../functions/groupDelivery.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const projectId = 'demo-misechef-group-delivery';
const now = new Date('2026-11-01T00:00:00Z'), date = '2026-11-03';
const config = { enabled: true, dates: { [date]: { closesAt: '2026-11-02T09:00:00.000Z' } }, eligibleProducts: { lunch: 1 } };
const input = { date, selections: [{ productId: 'lunch', quantity: 3 }], placeId: 'qa-customer-place', requestId: 'request-one', name: 'QA Customer', phone: '+60123456789', unit: 'PRIVATE UNIT' };
const resolvePlace = async () => ({ ...pilot.center, formattedAddress: 'PRIVATE CUSTOMER ADDRESS' });
let env, app, db;
const reserve = (uid = 'customer', reservation = input, extra = {}) => reserveGroupDelivery({ db, uid, slug: 'qa-store', input: reservation, resolvePlace, now, ...extra });
const progress = uid => getGroupDelivery({ db, uid, slug: 'qa-store', date, now });
const reservationPath = `deliveryGroups/${groupDeliveryKey('store',date)}/groupDeliveryReservations/customer`;
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  app = initializeApp({ projectId }, 'group-delivery-integration'); db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc('stores/store').set({ country: 'MY', slug: 'qa-store', workspaceId: 'workspace', orderDays: ['tuesday'], earliestPickupDays: 0, maximumAdvanceDays: 14 });
  await db.doc('workspaces/workspace').set({ ownerId: 'owner', subscriptionPlan: 'business', subscriptionStatus: 'active' });
  await db.doc('storeProducts/lunch').set({ storeId: 'store', name: 'Lunch', price: 12, available: true, optionGroupIds: [] });
  await db.doc('groupDeliveryConfigs/store').set(config);
});
after(async () => { await env?.cleanup(); if (app) await deleteApp(app); });

test('joins unpaid; concurrent duplicate requests count once and create no Store order or payment', async () => {
  const results = await Promise.all(Array.from({length:6}, () => reserve()));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal((await progress('customer')).joinedPortions, 3);
  const saved = (await db.doc(reservationPath).get()).data();
  assert.equal(saved.customerDeliveryFeeMinor, 0); assert.equal(saved.paymentStatus, 'not_requested');
  for (const name of ['storeOrders','storePaymentEvents','storeNotifications']) assert.equal((await db.collection(name).get()).size, 0);
});
test('new request IDs cannot duplicate an active customer; changed payload cannot reuse ID', async () => {
  await reserve();
  await assert.rejects(reserve('customer', { ...input, requestId:'request-two' }), { code: 'already-exists' });
  await assert.rejects(reserve('customer', { ...input, selections:[{productId:'lunch',quantity:5}] }), { code: 'already-exists' });
  assert.equal((await progress()).joinedPortions,3);
});
test('10 unpaid portions do not qualify for free-delivery review', async () => {
  await Promise.all([reserve('customer-a', {...input,selections:[{productId:'lunch',quantity:6}]}), reserve('customer-b',{...input,selections:[{productId:'lunch',quantity:4}]})]);
  const p = await progress(); assert.equal(p.joinedPortions,10); assert.equal(p.paidPortions,0); assert.equal(p.status,'collecting');
  assert.equal((await db.doc(`deliveryGroups/${groupDeliveryKey('store',date)}`).get()).data().status,'collecting');
});
test('public and other-customer responses never contain private addresses, contacts, UID or request ID', async () => {
  await reserve();
  for (const uid of [undefined,'other','customer']) {
    const p=await progress(uid), encoded=JSON.stringify(p);
    for(const secret of ['PRIVATE CUSTOMER ADDRESS','PRIVATE UNIT','QA Customer','60123456789','request-one','fingerprint','latitude":4.6413277,"longitude":101.1445881,"placeId']) assert.equal(encoded.includes(secret),false);
    assert.equal(p.mine?.portions,uid==='customer'?3:undefined);
  }
});
test('backend ignores forged client coordinates and rejects out-of-radius Google Place', async () => {
  await assert.rejects(reserve('customer',{...input,latitude:pilot.center.latitude,longitude:pilot.center.longitude}, { resolvePlace:async()=>({...pilot.center,latitude:4.7,formattedAddress:'far'}) }),{code:'out-of-range'});
  assert.equal((await progress()).joinedPortions,0);
  await assert.rejects(reserve(''),{code:'unauthenticated'});
});
test('cancel decrements, rejoin replaces instead of accumulating, old retry never resurrects', async () => {
  await reserve(); await cancelGroupDelivery({db,uid:'customer',slug:'qa-store',date,now});
  assert.equal((await progress()).joinedPortions,0);
  assert.equal((await reserve()).status,'cancelled');
  await reserve('customer',{...input,requestId:'replacement',selections:[{productId:'lunch',quantity:2}]});
  assert.equal((await progress()).joinedPortions,2);
});
test('deadline excludes immediately, delayed cleanup is safe and repeatable', async () => {
  await reserve(); const deadline=new Date(config.dates[date].closesAt);
  const p=await getGroupDelivery({db,uid:'customer',slug:'qa-store',date,now:deadline});
  assert.equal(p.joinedPortions,0); assert.equal(p.mine.status,'expired'); assert.equal(p.status,'closed');
  await assert.rejects(reserve('new',input,{now:deadline}),{code:'failed-precondition'});
  assert.equal((await expireGroupDelivery({db,now:deadline})).expired,1);
  assert.equal((await expireGroupDelivery({db,now:deadline})).expired,0);
});
test('paused configuration, unavailable main meals and blocked Store dates cannot join', async () => {
  await db.doc('groupDeliveryConfigs/store').update({enabled:false}); await assert.rejects(reserve(),{code:'failed-precondition'});
  await db.doc('groupDeliveryConfigs/store').update({enabled:true}); await db.doc('storeProducts/lunch').update({available:false}); await assert.rejects(reserve(),{code:'invalid-argument'});
  await db.doc('storeProducts/lunch').update({available:true}); await db.doc('stores/store').update({unavailableDates:[date]}); await assert.rejects(reserve(),{code:'failed-precondition'});
});
test('only active workspace Owner/Manager configures; fee/radius/center input cannot alter policy', async () => {
  await assert.rejects(configureGroupDelivery({db,uid:'customer',slug:'qa-store',input:config,now}),{code:'permission-denied'});
  await db.doc('workspaceMembers/workspace_chef').set({userId:'chef',workspaceId:'workspace',status:'Active',role:'Chef'});
  await assert.rejects(configureGroupDelivery({db,uid:'chef',slug:'qa-store',input:config,now}),{code:'permission-denied'});
  await db.doc('workspaceMembers/workspace_manager').set({userId:'manager',workspaceId:'workspace',status:'Active',role:'Manager'});
  for(const uid of ['owner','manager']) await configureGroupDelivery({db,uid,slug:'qa-store',input:{...config,customerDeliveryFeeMinor:999,radiusMetres:9000,center:{latitude:0,longitude:0}},now});
  const saved=(await db.doc('groupDeliveryConfigs/store').get()).data(); assert.equal(saved.customerDeliveryFeeMinor,0); assert.equal(saved.radiusMetres,1000); assert.deepEqual(saved.center,pilot.center);
  await assert.rejects(configureGroupDelivery({db,uid:'owner',slug:'qa-store',input:{...config,eligibleProducts:{lunch:0}},now}),{code:'invalid-argument'});
});
test('Firestore blocks direct reservation/config/group reads, list queries and all writes for guests, customer, another customer, owner', async () => {
  await reserve();
  for (const context of [env.unauthenticatedContext(), ...['customer','other','owner'].map(uid=>env.authenticatedContext(uid))]) {
    const client=context.firestore();
    for (const path of ['groupDeliveryConfigs/store', `deliveryGroups/${groupDeliveryKey('store',date)}`, reservationPath,'groupDeliveryRateLimits/customer']) {
      await assertFails(getDoc(doc(client,path))); await assertFails(setDoc(doc(client,path),{status:'reserved',portions:999}));
    }
    await assertFails(getDocs(collection(client,`deliveryGroups/${groupDeliveryKey('store',date)}/groupDeliveryReservations`)));
  }
});

test('address lookup crossing the cutoff rechecks the server clock before committing', async () => {
  const deadline = new Date(config.dates[date].closesAt);
  let clockCalls = 0;
  await assert.rejects(reserveGroupDelivery({db,uid:'slow-lookup',slug:'qa-store',input,resolvePlace,
    clock:()=>++clockCalls === 1 ? new Date(deadline.getTime()-1000) : deadline}),{code:'failed-precondition'});
  assert.equal((await progress()).joinedPortions,0);
});

test('pausing hides new joins but preserves a customer’s private cancellation/status', async () => {
  await reserve(); await db.doc('groupDeliveryConfigs/store').update({enabled:false});
  const p=await progress('customer'); assert.equal(p.available,true); assert.equal(p.status,'closed'); assert.equal(p.mine.status,'reserved');
  await cancelGroupDelivery({db,uid:'customer',slug:'qa-store',date,now});
  assert.equal((await progress('customer')).joinedPortions,0);
});

test('corrected-center eligibility is enforced by reservation backend; Store kitchen pickup remains independent', async () => {
  const pickup = { latitude: 4.60, longitude: 101.10, formattedAddress: 'Existing kitchen pickup' };
  await db.doc('stores/store').update({ 'delivery.pickup': pickup });
  await configureGroupDelivery({db,uid:'owner',slug:'qa-store',input:config,now});
  assert.deepEqual((await db.doc('stores/store').get()).data().delivery.pickup,pickup);
  const atDistance = metres => ({ latitude: pilot.center.latitude + metres / 6371000 * 180 / Math.PI, longitude: pilot.center.longitude, formattedAddress:'PRIVATE CUSTOMER ADDRESS' });
  await reserve('inside',input,{resolvePlace:async()=>atDistance(999.9)});
  await assert.rejects(reserve('outside',input,{resolvePlace:async()=>atDistance(1000.1)}),{code:'out-of-range'});
  assert.equal((await progress()).joinedPortions,3);
  assert.deepEqual((await db.doc('stores/store').get()).data().delivery.pickup,pickup);
});


const reviewArgs=()=>({db,uid:'owner',storeId:'store',workspaceId:'workspace',groupId:groupDeliveryKey('store',date),now});
const fakeQuoteProvider=(changes={})=>({environment:'sandbox',createQuote:async request=>({quotationId:'quote-phase2',serviceType:request.data.serviceType,stops:request.data.stops,expiresAt:new Date(now.getTime()+60000).toISOString(),priceBreakdown:{total:'18.40',currency:'MYR'},...changes}),createOrder:async()=>{throw new Error('Booking must never be called');}});
const linkPaidFixture = async (uid, options = {}) => {
 const groupId = groupDeliveryKey('store', date);
 const reservation = db.doc(`deliveryGroups/${groupId}/groupDeliveryReservations/${uid}`);
 const { fingerprint, portions } = (await reservation.get()).data();
 const orderId = `meal-${uid}`;
 await db.doc(`storeOrders/${orderId}`).set({
   storeId: 'store', workspaceId: 'workspace', customerUid: uid,
   groupDelivery: { groupId, reservationFingerprint: fingerprint, date, portions },
   payment: { status: 'paid', refundStatus: 'none', refundedAmountMinor: 0, amountMinor: portions * 1200 },
   ...options
 });
 await db.doc(`storeOrderTimeline/${orderId}_payment-received`).set({
   orderId, storeId: 'store', workspaceId: 'workspace', type: 'payment_received', createdAt: now.toISOString()
 });
 await reservation.update({ mealOrderId: orderId });
};
const seedReview=async(quantities=[6,4])=>{
 await db.doc('stores/store').update({delivery:{provider:'lalamove',market:'MY',environment:'sandbox',serviceType:'MOTORCYCLE',pickup:{address:'Separate QA kitchen',latitude:4.60,longitude:101.10}}});
 // Fixture setup is sequential; concurrency is exercised explicitly in the approval test.
 for (const [i,quantity] of quantities.entries()) {
   await reserve('member-'+i,{...input,selections:[{productId:'lunch',quantity}]});
   await linkPaidFixture('member-'+i);
 }
 return reviewArgs();
};
const makeEstimate=async(args)=>estimateGroupDelivery({...args,provider:fakeQuoteProvider(),pickupTime:'11:30'});
const approveEstimate=(args,estimate,extra={})=>approveGroupDelivery({...args,estimateId:estimate.id,expectedFeeMinor:estimate.feeMinor,requestId:'approve-request',confirmFreeDelivery:true,...extra});

test('Phase 2 lists date/area/active count/expiry and exposes private customer detail only to Owner/Manager',async()=>{
 const args=await seedReview();
 const list=await listGroupDeliveryReview(args);assert.equal(list.groups.length,1);assert.equal(list.groups[0].activePortions,10);assert.equal(list.groups[0].target,10);assert.equal(list.groups[0].expiresAt,config.dates[date].closesAt);
 assert.equal(JSON.stringify(list).includes('PRIVATE'),false);
 assert.equal((await listGroupDeliveryReview({...args,date,areaId:list.groups[0].areaId})).groups[0].id,list.groups[0].id);
 await assert.rejects(listGroupDeliveryReview({...args,areaId:'unconfigured-area'}),{code:'invalid-argument'});

 const detail=await getGroupDeliveryReview(args);assert.equal(detail.members.length,2);assert.equal(detail.members[0].address.formattedAddress,'PRIVATE CUSTOMER ADDRESS');assert.equal(detail.members[0].items[0].quantity,6);
 for(const role of ['Chef','Finance','Viewer']) {
  await db.doc('workspaceMembers/workspace_not-manager').set({userId:'not-manager',workspaceId:'workspace',role,status:'Active'});
  await assert.rejects(getGroupDeliveryReview({...args,uid:'not-manager'}),{code:'permission-denied'});
 }
 await db.doc('workspaceMembers/workspace_manager').set({userId:'manager',workspaceId:'workspace',role:'Manager',status:'Active'});
 assert.equal((await getGroupDeliveryReview({...args,uid:'manager'})).members.length,2);
 await assert.rejects(listGroupDeliveryReview({...args,uid:'customer'}),{code:'permission-denied'});
 await assert.rejects(getGroupDeliveryReview({...args,workspaceId:'another'}),{code:'permission-denied'});
});

test('Phase 2 quote includes kitchen plus customer stops, price is server-owned, explicit approval records one immutable history',async()=>{
 const args=await seedReview();const estimate=await makeEstimate(args);
 assert.equal(estimate.route.length,3);assert.equal(estimate.route[0].address,'Separate QA kitchen');assert.equal(estimate.feeMinor,1840);
 await assert.rejects(approveEstimate(args,estimate,{confirmFreeDelivery:false}),{code:'invalid-argument'});
 await assert.rejects(approveEstimate(args,estimate,{expectedFeeMinor:0}),{code:'failed-precondition'});
 const approved=await approveEstimate(args,estimate);assert.equal(approved.duplicate,false);assert.equal(approved.approval.customerDeliveryFeeMinor,0);assert.equal(approved.approval.approvedPortions,10);
 const detail=await getGroupDeliveryReview(args);assert.equal(detail.history.length,1);assert.equal(detail.group.status,'approved');assert.equal(detail.history[0].members.length,2);
 const pub=await progress();assert.equal(pub.status,'approved');assert.equal(JSON.stringify(pub).includes('PRIVATE'),false);assert.equal(JSON.stringify(pub).includes('approvedBy'),false);
 await assert.rejects(reserve('late',{...input,requestId:'late'}),{code:'failed-precondition'});
 await assert.rejects(cancelGroupDelivery({db,uid:'member-0',slug:'qa-store',date,now}),{code:'failed-precondition'});
 for(const collection of ['storePaymentEvents','storeNotifications'])assert.equal((await db.collection(collection).get()).size,0);
});

test('Phase 2 concurrent approvals and retries record one approval and charge nobody',async()=>{
 const args=await seedReview();const estimate=await makeEstimate(args);
 const results=await Promise.all(Array.from({length:5},(_,i)=>approveEstimate(args,estimate,{requestId:'approval-'+i})));
 assert.equal(results.filter(r=>!r.duplicate).length,1);assert.equal((await getGroupDeliveryReview(args)).history.length,1);
 assert.equal((await db.collection('storeOrders').get()).size,2);
});

test('Phase 2 changed reservations, pickup, eligibility config or expired quote block stale approval',async()=>{
 const args=await seedReview();
 let estimate=await makeEstimate(args);
 await reserve('new-member',{...input,requestId:'new-member'});
 await linkPaidFixture('new-member');
 await assert.rejects(approveEstimate(args,estimate),{code:'failed-precondition'});
 estimate=await makeEstimate(args);await db.doc('stores/store').update({'delivery.pickup.address':'Changed kitchen'});
 await assert.rejects(approveEstimate(args,estimate),{code:'failed-precondition'});
 estimate=await makeEstimate(args);await db.doc('groupDeliveryConfigs/store').update({enabled:false});
 await assert.rejects(approveEstimate(args,estimate),{code:'failed-precondition'});
 await db.doc('groupDeliveryConfigs/store').update({enabled:true});estimate=await makeEstimate(args);
 await assert.rejects(approveEstimate(args,estimate,{now:new Date(now.getTime()+60000)}),{code:'failed-precondition'});
 assert.equal((await getGroupDeliveryReview(args)).history.length,0);
});

test('Paid minimum and refunds are enforced by backend before approval',async()=>{
 const args=await seedReview([6]);let estimate=await makeEstimate(args);
 await assert.rejects(approveEstimate(args,estimate),{code:'failed-precondition'});
 await reserve('another',{...input,selections:[{productId:'lunch',quantity:4}]});
 await linkPaidFixture('another');
 estimate=await makeEstimate(args);
 await db.doc('storeOrders/meal-another').update({'payment.refundStatus':'partial','payment.refundedAmountMinor':100});
 await assert.rejects(approveEstimate(args,estimate),{code:'failed-precondition'});
 assert.equal((await getGroupDeliveryReview(args)).group.activePortions,6);
});

test('Phase 2 provider failure, invalid route/currency and role revocation fail closed',async()=>{
 const args=await seedReview();
 for(const changes of [{priceBreakdown:{total:'10.00',currency:'SGD'}},{stops:[]},{stops:[{coordinates:{lat:'bad',lng:'101'}}]}]) await assert.rejects(estimateGroupDelivery({...args,provider:fakeQuoteProvider(changes),pickupTime:'11:30'}),{code:'failed-precondition'});
 await assert.rejects(estimateGroupDelivery({...args,provider:{environment:'sandbox',createQuote:async()=>{throw new Error('Provider unavailable');}},pickupTime:'11:30'}));
 const estimate=await makeEstimate(args);
 await db.doc('workspaceMembers/workspace_manager').set({userId:'manager',workspaceId:'workspace',role:'Manager',status:'Active'});
 await db.doc('workspaceMembers/workspace_manager').update({status:'Inactive'});
 await assert.rejects(approveEstimate({...args,uid:'manager'},estimate),{code:'permission-denied'});
 let ticks=0;
 await assert.rejects(approveEstimate({...args,now:undefined,clock:()=>++ticks===1?now:new Date(now.getTime()+61000)},estimate),{code:'failed-precondition'});
});

test('Phase 2 estimates and approval histories remain inaccessible through direct Firestore reads and writes',async()=>{
 const args=await seedReview();const estimate=await makeEstimate(args);await approveEstimate(args,estimate);
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('owner'),env.authenticatedContext('member-0')]) {
  for(const suffix of ['estimates/'+estimate.id,'approvals/free-delivery']) {
   const ref=doc(context.firestore(),`deliveryGroups/${args.groupId}/${suffix}`);
   await assertFails(getDoc(ref));await assertFails(setDoc(ref,{customerDeliveryFeeMinor:999}));
  }
 }
});


test('Below target: Store quote, role-checked receipt verification, cancellation request and no payment mutation', async () => {
 const args = await seedReview([4, 3]);
 const cutoff = new Date(config.dates[date].closesAt);
 let draft;
 const quote = async request => {
   draft = request.draft;
   return { pricingSnapshotId: 'quote-snapshot', quote: { customerDeliveryFee: 5.25, currency: 'MYR',
     expiresAt: new Date(cutoff.getTime() + 60000).toISOString() } };
 };
 const input = { db, uid: 'member-0', slug: 'qa-store', date, time: '11:30', quote, now: cutoff };
 await assert.rejects(quoteGroupDeliveryFallback({ ...input, now }), { code: 'failed-precondition' });
 await assert.rejects(quoteGroupDeliveryFallback({ ...input, uid: 'another' }), { code: 'permission-denied' });
 await assert.rejects(quoteGroupDeliveryFallback({ ...input, time: '13:00' }), { code: 'invalid-argument' });
 const before = (await db.doc('storeOrders/meal-member-0').get()).data();
 assert.equal((await quoteGroupDeliveryFallback(input)).customerDeliveryFee, 5.25);
 assert.equal(draft.destination.formattedAddress, 'PRIVATE CUSTOMER ADDRESS');
 assert.deepEqual(draft.selections, [{ productId: 'lunch', quantity: 4 }]);
 const verification = { ...args, customerId: 'member-0', quoteId: 'quote-snapshot',
   amountMinor: 525, receipt: 'EXTERNAL-QA-01', now: cutoff };
 await assert.rejects(verifyGroupDeliveryFee({ ...verification, uid: 'member-0' }), { code: 'permission-denied' });
 await assert.rejects(verifyGroupDeliveryFee({ ...verification, amountMinor: 524 }), { code: 'failed-precondition' });
 await assert.rejects(verifyGroupDeliveryFee({ ...verification, now: new Date(cutoff.getTime() + 60000) }), { code: 'failed-precondition' });
 assert.equal((await verifyGroupDeliveryFee(verification)).duplicate, false);
 assert.equal((await verifyGroupDeliveryFee(verification)).duplicate, true);
 assert.deepEqual((await db.doc('storeOrders/meal-member-0').get()).data(), before);
 assert.equal((await requestGroupDeliveryCancellation({ ...input, uid: 'member-1' })).requested, true);
 const closed = await getGroupDelivery({ db, uid: 'member-1', slug: 'qa-store', date, now: cutoff });
 assert.equal(closed.paidPortions, 4);
 assert.equal(closed.mine.cancellationRequested, true);
 const receipts = await db.collection('groupDeliveryFeeReceipts').get();
 assert.equal(receipts.size, 1);
 await assertFails(getDoc(doc(env.authenticatedContext('owner').firestore(), receipts.docs[0].ref.path)));
 assert.equal((await db.collection('storePaymentEvents').get()).size, 0);
});

test('Paid portions survive cutoff, while a payment confirmed at cutoff cannot qualify', async () => {
 const args = await seedReview([6, 4]);
 const cutoff = new Date(config.dates[date].closesAt);
 await expireGroupDelivery({ db, now: cutoff });
 assert.equal((await getGroupDeliveryReview({ ...args, now: cutoff })).group.activePortions, 10);
 await db.doc('storeOrderTimeline/meal-member-1_payment-received').update({ createdAt: cutoff.toISOString() });
 assert.equal((await getGroupDeliveryReview({ ...args, now: cutoff })).group.activePortions, 6);
});
