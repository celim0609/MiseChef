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
