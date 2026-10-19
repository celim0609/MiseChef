import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyStatus, orderInPeriod } from './dailyOrderModel';
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
