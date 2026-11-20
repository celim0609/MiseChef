import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rotationWeekForMonday, resolveHealthyLunchDay, weeklyPricing, validateWeeklyStructure, getWeeklyDates } from './storeWeeklyMealPlan.js';
import { buildPendingOrder } from './storePaymentsCore.js';
import { readWeeklyShare, weeklyShareChoice, weeklySharePreviewDate } from './weeklyMenuSharing.js';
const original=JSON.parse(readFileSync(new URL('../docs/qa/week4-mapping/production-product-before.json',import.meta.url)));
const fixed=()=>({...structuredClone(original),rotationStartMonday:'2026-10-05',rotationCycleLength:4});
const store={id:original.storeId,workspaceId:original.workspaceId,name:'QA',country:'MY',currency:'MYR',pickupEnabled:true,orderDays:['monday','tuesday','wednesday','thursday','friday'],maximumAdvanceDays:60,earliestPickupDays:0,pickupOperatingHours:{start:'10:00',end:'18:00'},pickupLocations:[{id:'counter',name:'Counter',address:'QA'}]};
const makeOrder=(plan,{day,option}={})=>{
 const date=day || '2026-11-23';
 const selectedMealOptions=option?[{serviceDate:'2026-11-27',optionGroupId:'1bcf919f-dcc7-4a0c-ae79-52a2c8852c66',optionId:option}]:[];
 return buildPendingOrder({id:'qa-week4',orderNumber:'QA-WEEK4',store,products:[plan],optionGroups:[],paymentProvider:'stripe',paymentProviderMode:'test',now:new Date('2026-11-20T06:00:00Z'),draft:{customerName:'QA',phone:'+60123456789',pickupDate:date,pickupTime:'10:00',pickupLocationId:'counter',selections:[{productId:plan.id,quantity:1,...(day?{healthyLunchPlanId:plan.id,healthyLunchDate:day}:{}),selectedMealOptions}],fulfilments:(day?[day]:getWeeklyDates(date)).map(date=>({date,time:'10:00',itemIndexes:[0]}))}});
};
test('incident reproduces against the read-only Production snapshot; Week 4 is distinct and published',()=>{
 assert.equal(original.available,true);assert.equal(validateWeeklyStructure(original),'');
 assert.equal(rotationWeekForMonday(original,'2026-11-23'),original.rotationWeeks.week3);
 assert.notDeepEqual(original.rotationWeeks.week4.meals,original.rotationWeeks.week3.meals);
});
test('confirmed November dates and continuing cycles resolve identical saved menu objects',()=>{
 const p=fixed();assert.equal(validateWeeklyStructure(p),'');
 for(const [monday,slot] of [['2026-11-02','week1'],['2026-11-09','week2'],['2026-11-16','week3'],['2026-11-23','week4'],['2026-11-30','week1'],['2026-12-07','week2'],['2026-12-14','week3'],['2026-12-21','week4']])assert.equal(rotationWeekForMonday(p,monday),p.rotationWeeks[slot]);
 assert.deepEqual(p.rotationWeeks,original.rotationWeeks);
 const share=readWeeklyShare(p,'?week=week4');assert.equal(weeklyShareChoice(p,share,['2026-11-23'],[]).date,'2026-11-23');
 assert.equal(rotationWeekForMonday(p,weeklySharePreviewDate(p,share)),p.rotationWeeks.week4);
});
test('checkout uses Week 4 dates, actual parent Product ID, saved meals and authoritative options/prices',()=>{
 const p=fixed();const beef='16d30151-edd8-44e5-ad26-183233f425a4';
 const full=makeOrder(p,{option:beef});assert.equal(full.total,61);assert.equal(full.payment.amountMinor,6100);
 assert.equal(full.items[0].productId,p.id);assert.equal(full.items[0].weeklyPriceSnapshot.originalPrice,68.5);
 assert.deepEqual(full.items[0].weeklyPlanSnapshot.meals.map(m=>m.productName),getWeeklyDates('2026-11-23').map(date=>resolveHealthyLunchDay(p,[],date).name));
 assert.equal(full.items[0].weeklyPlanSnapshot.meals[4].selectedMealOptions[0].optionId,beef);
 for(const date of getWeeklyDates('2026-11-23')){const result=makeOrder(p,{day:date,...(date.endsWith('27')?{option:beef}:{})});assert.equal(result.items[0].productId,p.id);assert.equal(result.total,date.endsWith('25')?12.9:date.endsWith('27')?14.9:13.9);}
 assert.throws(()=>makeOrder(p),/Complete Exchange/);
 assert.throws(()=>makeOrder(p,{day:'2026-11-27',option:'63c9bed6-de30-43ab-8f8b-7d2b06f152eb'}),/choice|available|option/i);
});
test('missing slots never collapse the cycle or supply previous products; checkout fails closed',()=>{
 const p=fixed();delete p.rotationWeeks.week4;assert.equal(validateWeeklyStructure(p),'');
 assert.equal(rotationWeekForMonday(p,'2026-11-23'),undefined);assert.equal(resolveHealthyLunchDay(p,[],'2026-11-23'),undefined);
 assert.equal(rotationWeekForMonday(p,'2026-11-30'),p.rotationWeeks.week1);
 assert.throws(()=>makeOrder(p));assert.throws(()=>makeOrder(p,{day:'2026-11-23'}));assert.throws(()=>weeklyPricing(p,[],'2026-11-23'));
 delete p.rotationWeeks.week2;assert.equal(rotationWeekForMonday(p,'2026-11-09'),undefined);assert.equal(rotationWeekForMonday(p,'2026-11-16'),p.rotationWeeks.week3);
});
test('order snapshots survive catalogue remapping, repricing and removal; missing calories remain absent',()=>{
 const p=fixed();const saved=makeOrder(p,{option:'2662a590-7d15-46e0-9f05-cecf2a543bc4'});const before=JSON.stringify(saved);
 for(const day of ['wed','thu','fri'])assert.equal(p.rotationWeeks.week4.meals[day].calories,undefined);
 p.rotationStartMonday='2026-10-12';p.rotationWeeks={};assert.equal(JSON.stringify(saved),before);
 for(const cycle of [0,5,1.5,'4'])assert.match(validateWeeklyStructure({...fixed(),rotationCycleLength:cycle}),/cycle/);
});
