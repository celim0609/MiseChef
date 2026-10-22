import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyStatus, orderInPeriod, nextDailyStatus, sortOrdersForPeriod } from './dailyOrderModel';
import { getOrderTickets } from './orderTickets';
import type { StoreOrder } from './types';
const order = {id:'a',items:[{productName:'Lunch',quantity:1,selectedOptions:[]}],fulfilmentStatus:'New',payment:{status:'paid'},fulfilments:[{id:'today',date:'2026-10-19',time:'12:00',method:'pickup',allocations:[{itemIndex:0,quantity:1}]},{id:'future',date:'2026-10-20',time:'12:00',method:'pickup',allocations:[{itemIndex:0,quantity:1}]}]} as StoreOrder;
test('parent can appear in Today and Upcoming while daily statuses remain independent',()=>{
 const next={...order,fulfilmentOperations:{today:{kitchenStatus:'Ready'}}};const tickets=getOrderTickets(next);
 assert.equal(dailyStatus(next,tickets[0]),'Ready');assert.equal(dailyStatus(next,tickets[1]),'New');
 assert.ok(orderInPeriod(next,'Today','2026-10-19'));assert.ok(orderInPeriod(next,'Upcoming','2026-10-19'));
});
test('completed days leave today and remain in history without completing future days',()=>{
 const next={...order,fulfilmentCompletion:{today:{completedAt:'now',completedBy:'owner'}}};
 assert.ok(!orderInPeriod(next,'Today','2026-10-19'));assert.ok(orderInPeriod(next,'History','2026-10-19'));assert.ok(orderInPeriod(next,'Upcoming','2026-10-19'));
});
test('paid cancelled parents stay out of both active periods',()=>{
 const next={...order,fulfilmentStatus:'Cancelled'} as StoreOrder;
 assert.ok(!orderInPeriod(next,'Today','2026-10-19'));assert.ok(!orderInPeriod(next,'Upcoming','2026-10-19'));assert.ok(orderInPeriod(next,'History','2026-10-19'));
});

test('daily action follows actual day status, payment gating and provider completion authority',()=>{
 const ticket=getOrderTickets(order)[0];
 for(const [status,next] of [['New','Preparing'],['Preparing','Ready'],['Ready','Completed']]) assert.equal(nextDailyStatus({...order,fulfilmentOperations:{today:{kitchenStatus:status}}},ticket),next);
 assert.equal(nextDailyStatus({...order,payment:{...order.payment,status:'pending'}},ticket),null);
 assert.equal(nextDailyStatus({...order,fulfilmentStatus:'Cancelled'},ticket),null);
 const ready={...order,fulfilmentOperations:{today:{kitchenStatus:'Ready'}}};
 assert.equal(nextDailyStatus(ready,{...ticket,method:'delivery'}),null);
 assert.equal(nextDailyStatus({...ready,manualOrder:{revision:1,draft:{},createdBy:'owner'}},{...ticket,method:'delivery'}),'Completed');
});
test('ambiguous legacy parents remain accessible in History and period ordering uses daily schedule',()=>{
 const ambiguous={...order,fulfilments:undefined,items:[{...order.items[0],weeklyPlanSnapshot:{meals:[]}}]};
 assert.equal(orderInPeriod(ambiguous,'History','2026-10-19'),true);assert.equal(orderInPeriod(ambiguous,'Today','2026-10-19'),false);
 const later={...order,id:'later',fulfilments:order.fulfilments!.map(day=>({...day,date:'2026-10-22'}))};
 const earlier={...order,id:'earlier',createdAt:'2026-10-18',fulfilments:order.fulfilments!.map(day=>({...day,date:'2026-10-20'}))};
 assert.deepEqual(sortOrdersForPeriod([later,earlier],'Upcoming','2026-10-19').map(order=>order.id),['earlier','later']);
});

test('direct Ready and Preparing are both available only for paid New days',async()=>{
 const {dailyActions}=await import('./dailyOrderModel');const ticket=getOrderTickets(order)[0];
 assert.deepEqual(dailyActions(order,ticket),['Preparing','Ready']);
 assert.deepEqual(dailyActions({...order,payment:{...order.payment,status:'pending'}},ticket),[]);
 assert.deepEqual(dailyActions({...order,fulfilmentOperations:{today:{kitchenStatus:'Preparing'}}},ticket),['Ready']);
 assert.deepEqual(dailyActions({...order,fulfilmentOperations:{today:{kitchenStatus:'Ready'}}},ticket),['Completed']);
});
test('shared board/list projection isolates today, future, completed and cancelled without duplicate parents',async()=>{
 const {dailyEntries}=await import('./dailyOrderModel');
 const ready={...order,fulfilmentOperations:{today:{kitchenStatus:'Ready'},future:{kitchenStatus:'Ready'}}};
 assert.deepEqual(dailyEntries([ready,ready],'Today','2026-10-19').map(e=>[e.ticket.fulfilmentId,e.status]),[['today','Ready']]);
 assert.deepEqual(dailyEntries([ready],'Upcoming','2026-10-19').map(e=>[e.ticket.fulfilmentId,e.status]),[['future','Ready']]);
 assert.equal(dailyEntries([ready],'Tomorrow','2026-10-19').length,1);
 assert.equal(dailyEntries([{...ready,fulfilmentCompletion:{today:{completedAt:'now',completedBy:'owner'}}}],'Today','2026-10-19').length,0);
 assert.equal(dailyEntries([{...ready,fulfilmentStatus:'Cancelled'}],'Upcoming','2026-10-19').length,0);
 assert.equal(dailyEntries([{...ready,payment:{...ready.payment,status:'pending'}}],'Today','2026-10-19').length,0);
 assert.equal(dailyEntries([ready],'Today','2026-10-20')[0].ticket.fulfilmentId,'future');
});

test('period and status intersect on the same fulfilment rather than the parent or sibling day', async () => {
 const {orderMatchesStatusInPeriod}=await import('./dailyOrderModel');
 const mixed={...order,fulfilmentStatus:'New',fulfilmentOperations:{today:{kitchenStatus:'Ready'}}} as StoreOrder;
 assert.equal(orderMatchesStatusInPeriod(mixed,'Today','Ready','2026-10-19'),true);
 assert.equal(orderMatchesStatusInPeriod(mixed,'Upcoming','Ready','2026-10-19'),false);
 assert.equal(orderMatchesStatusInPeriod(mixed,'Upcoming','New','2026-10-19'),true);
 assert.equal(orderMatchesStatusInPeriod(mixed,'Today','New','2026-10-19'),false);
 assert.equal(orderMatchesStatusInPeriod(mixed,'History','All','2026-10-19'),false);
 const completed={...mixed,fulfilmentCompletion:{today:{completedAt:'now',completedBy:'owner'}}};
 assert.equal(orderMatchesStatusInPeriod(completed,'History','Completed','2026-10-19'),true);
 assert.equal(orderMatchesStatusInPeriod(completed,'Upcoming','Completed','2026-10-19'),false);
 assert.equal(orderMatchesStatusInPeriod(completed,'Upcoming','Paid','2026-10-19'),true);
});


test('fulfilment History includes completed ordinary tickets and completed days of active multi-date orders', async () => {
 const {dailyEntries}=await import('./dailyOrderModel');
 const completed={...order,id:'completed',createdAt:'2026-10-19T02:00:00Z',fulfilments:undefined,fulfilmentStatus:'Completed',fulfilmentMethod:'pickup',pickupDate:'2026-10-19',pickupTime:'12:00'} as StoreOrder;
 const partial={...order,fulfilmentCompletion:{today:{completedAt:'now',completedBy:'owner'}}};
 const entries=dailyEntries([completed,partial],'History','2026-10-19');
 assert.ok(entries.some(entry=>entry.order.id==='completed'));
 assert.deepEqual(entries.filter(entry=>entry.order.id==='a').map(entry=>entry.ticket.fulfilmentId),['today']);
 assert.equal(dailyEntries([completed],'Today','2026-10-19').length,0);
});


test('Completed summary follows the selected day while preserving future active meals and payment gating', async () => {
 const {completedEntriesForPeriod,dailyEntries}=await import('./dailyOrderModel');
 const partial={...order,fulfilmentCompletion:{today:{completedAt:'now',completedBy:'owner'}}};
 const completedFuture={...order,id:'future-parent',fulfilmentStatus:'Completed'} as StoreOrder;
 assert.deepEqual(completedEntriesForPeriod([partial,partial],'Today','2026-10-19').map(entry=>entry.ticket.fulfilmentId),['today']);
 assert.equal(completedEntriesForPeriod([partial],'Tomorrow','2026-10-19').length,0);
 assert.equal(completedEntriesForPeriod([completedFuture],'Tomorrow','2026-10-19').length,1);
 assert.equal(completedEntriesForPeriod([completedFuture],'Upcoming','2026-10-19').length,1);
 assert.equal(completedEntriesForPeriod([{...completedFuture,payment:{status:'pending'}} as StoreOrder],'Today','2026-10-19').length,0);
 assert.equal(dailyEntries([partial],'Upcoming','2026-10-19').length,1);
 assert.equal(completedEntriesForPeriod([{...completedFuture,fulfilmentStatus:'Cancelled'}],'Today','2026-10-19').length,0);
});

 test('delivery days advance through Preparing before Ready, then require merchant booking', async()=>{
 const {dailyActions}=await import('./dailyOrderModel');const delivery={...order,fulfilmentMethod:'delivery',fulfilments:order.fulfilments?.map(day=>({...day,method:'delivery'}))} as typeof order;const ticket={...getOrderTickets(delivery)[0],method:'delivery' as const};
 assert.deepEqual(dailyActions(delivery,ticket),['Preparing']);
 assert.deepEqual(dailyActions({...delivery,fulfilmentOperations:{today:{kitchenStatus:'Preparing'}}},ticket),['Ready']);
 assert.deepEqual(dailyActions({...delivery,fulfilmentOperations:{today:{kitchenStatus:'Ready'}}},ticket),[]);
 });
