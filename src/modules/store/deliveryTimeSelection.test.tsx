import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { deliveryTimeSelectionReducer as reduce, emptyDeliveryTimeSelection as empty, finalDeliveryTime, hasDeliveryOverrides } from './deliveryTimeSelection';
import { deliveryTimeSlots, isDeliveryTimeWithinHours } from '../../../functions/deliveryTimePolicy.js';
import DeliveryTimeSelect from './DeliveryTimeSelect';
import { groupFulfilmentSchedule } from './storeOrderFulfilments';
import { customerActionMessage, customerMessageSchedule } from './customerCommunicationModel';
import type { StoreOrder } from './types';
const hours={from:'09:00',to:'18:00'};
const dates=['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04'];
test('single-day checkout requires an explicit time and offers only Delivery Hours, independently of pickup hours',()=>{
 let state=empty();assert.equal(finalDeliveryTime(state,dates[0]),'');state=reduce(state,{type:'general',time:'11:00'});assert.equal(finalDeliveryTime(state,dates[0]),'11:00');
 const slots=deliveryTimeSlots(hours);assert.equal(slots[0],'09:00');assert.equal(slots.at(-1),'18:00');assert.ok(slots.includes('11:00'));assert.ok(slots.every(t=>isDeliveryTimeWithinHours(t,hours)));
 assert.deepEqual(deliveryTimeSlots({from:'10:07',to:'10:35'}),['10:07','10:22','10:35']);
 assert.deepEqual(deliveryTimeSlots({from:'18:00',to:'09:00'}),[]);
 const html=renderToStaticMarkup(<DeliveryTimeSelect label="Delivery time" hours={hours} value="" onChange={()=>{}}/>);assert.match(html,/Choose a delivery time/);assert.doesNotMatch(html,/type="time"|value="08:00"/);
});
for(const [label,count]of [['single-day',1],['multi-day',3],['Weekly Menu',5]] as const)test(`${label}: changing general time replaces every stale per-date time`,()=>{
 let state=reduce(empty(),{type:'general',time:'09:00'});
 for(const date of dates.slice(0,count))state=reduce(state,{type:'day',date,time:'09:00'});
 state=reduce(state,{type:'general',time:'11:00'});
 assert.deepEqual(dates.slice(0,count).map(date=>finalDeliveryTime(state,date)),Array(count).fill('11:00'));
 assert.equal(hasDeliveryOverrides(state,dates.slice(0,count)),false);
});
test('preserving replaced overrides requires a separate explicit confirmation and edits invalidate confirmation',()=>{
 let state=reduce(empty(),{type:'general',time:'09:00'});state=reduce(state,{type:'day',date:dates[0],time:'10:00'});state=reduce(state,{type:'confirm',confirmed:true});
 state=reduce(state,{type:'general',time:'11:00'});assert.equal(finalDeliveryTime(state,dates[0]),'11:00');assert.equal(state.overridesConfirmed,false);
 state=reduce(state,{type:'preserve'});assert.equal(finalDeliveryTime(state,dates[0]),'10:00');assert.equal(finalDeliveryTime(state,dates[1]),'11:00');assert.equal(state.overridesConfirmed,true);
 state=reduce(state,{type:'day',date:dates[1],time:'12:00'});assert.equal(state.overridesConfirmed,false);assert.equal(hasDeliveryOverrides(state,dates),true);
});
test('closing/restarting checkout clears general time, per-date times, pending overrides and addresses',()=>{
 let state=reduce(empty(),{type:'general',time:'11:00'});state=reduce(state,{type:'day',date:dates[0],time:'09:00'});state=reduce(state,{type:'general',time:'12:00'});
 state=reduce(state,{type:'reset'});assert.deepEqual(state,empty());assert.ok(dates.every(date=>finalDeliveryTime(state,date)===''));
});
test('address edits survive general time changes without preserving stale time overrides',()=>{
 const destination={formattedAddress:'School',latitude:'4.5',longitude:'101.2'};
 let state=reduce(empty(),{type:'destination',date:dates[0],destination});state=reduce(state,{type:'day',date:dates[0],time:'09:00'});state=reduce(state,{type:'general',time:'11:00'});
 assert.deepEqual(state.days[dates[0]].destination,destination);assert.equal(finalDeliveryTime(state,dates[0]),'11:00');
});
test('Weekly Menu final schedule and WhatsApp confirmation preserve five accepted 11 AM wall-clock times',()=>{
 const state=reduce(empty(),{type:'general',time:'11:00'});
 const schedule=groupFulfilmentSchedule(dates.map(date=>({date,time:finalDeliveryTime(state,date),itemIndexes:[0]})));
 assert.deepEqual(schedule.map(day=>day.time),Array(5).fill('11:00'));
 const order={id:'test',orderNumber:'TEST',currency:'MYR',total:132,customerName:'QA',orderSource:'online',payment:{status:'paid',refundStatus:'none'},fulfilmentStatus:'New',fulfilmentMethod:'delivery',items:[{quantity:1,productName:'Menu',selectedOptions:[]}],fulfilments:schedule.map((day,i)=>({...day,id:`day${i}`,method:'delivery',allocations:[{itemIndex:0,quantity:1}]})),delivery:{fulfilmentMethod:'delivery',recipient:{address:'School'}}} as unknown as StoreOrder;
 const text=customerActionMessage(order,'confirm','','','QA Store');assert.deepEqual(customerMessageSchedule(order).map(day=>day.time),Array(5).fill('11:00'));assert.match(text,/11:00 AM/);assert.doesNotMatch(text,/9:00 AM|09:00/);
});
test('public checkout uses one resolved schedule for quote, payment and final summary and resets at checkout boundaries',()=>{
 const source=readFileSync(new URL('./PublicStorePage.tsx',import.meta.url),'utf8');
 assert.match(source,/finalDeliveryTime\(deliverySelection, date\)/);assert.match(source,/Final delivery times/);assert.match(source,/<fieldset disabled=\{isPlacingOrder\}/);
 assert.match(source,/checkoutFulfilments\?\.every\(entry => isDeliveryTimeWithinHours/);
 const close=source.slice(source.indexOf('const closeCheckout'),source.indexOf('const closeCheckout')+2000);assert.match(close,/updateDeliverySelection\(\{type:'reset'\}\)/);
 assert.doesNotMatch(source,/setDeliveryDays|setDeliveryTime\(preOrder\?\.deliveryHours.from/);
});
