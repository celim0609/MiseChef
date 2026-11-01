import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { reserveGroupDelivery, cancelGroupDelivery, expireGroupDelivery, getGroupDelivery, configureGroupDelivery, groupDeliveryKey, GROUP_DELIVERY_PILOT as pilot } from '../functions/groupDelivery.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const projectId = 'demo-misechef-group-delivery';
const now = new Date('2026-11-01T00:00:00Z'), date = '2026-11-03';
const config = { enabled: true, dates: { [date]: { closesAt: '2026-11-03T02:00:00.000Z' } }, eligibleProducts: { lunch: 1 } };
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
test('10 portions is ready for review, never approved or paid automatically', async () => {
  await Promise.all([reserve('customer-a', {...input,selections:[{productId:'lunch',quantity:6}]}), reserve('customer-b',{...input,selections:[{productId:'lunch',quantity:4}]})]);
  const p = await progress(); assert.equal(p.joinedPortions,10); assert.equal(p.status,'ready_for_review');
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
