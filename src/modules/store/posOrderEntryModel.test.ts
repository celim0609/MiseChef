import test from 'node:test';
import assert from 'node:assert/strict';
import { claimPosAdd, posDeliveryDates, currentPosQuote, posInitialItemDate, type PosQuote } from './posOrderEntryModel';

test('rapid Add events add once; later intentional quantity changes remain available',()=>{
 const recent=new Map<string,number>();
 assert.equal(claimPosAdd(recent,'product:tea',1000),true);
 assert.equal(claimPosAdd(recent,'product:tea',1001),false);
 assert.equal(claimPosAdd(recent,'product:tea',1200),false);
 assert.equal(claimPosAdd(recent,'set:tea',1200),true);
 assert.equal(claimPosAdd(recent,'product:tea',1350),true);
});
test('single-date items inherit main schedule; explicit overrides and full weeks retain dates',()=>{
 assert.deepEqual(posDeliveryDates([{selection:{productId:'tea'}},{date:'2020-01-01',selection:{productId:'tea'}},{date:'2026-10-26',selection:{productId:'week'}}],[{id:'tea'},{id:'week',productType:'weekly_meal_plan'}],'2030-12-31'),['2020-01-01','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2030-12-31']);
});
test('quote responses from an older address or schedule and expired quotes are unusable immediately',()=>{
 const quote={id:'q',expiresAt:'2026-11-04T04:00:10Z'} as PosQuote;
 const now=Date.parse('2026-11-04T04:00:00Z');
 assert.equal(currentPosQuote(quote,'same','same',now),quote);
 assert.equal(currentPosQuote(quote,'old','changed',now),null);
 assert.equal(currentPosQuote(quote,'same','same',now+5000),null);
});

test('new full-week selections never inherit a non-Monday main date while explicit meal days remain untouched',()=>{
 assert.equal(posInitialItemDate({productType:'weekly_meal_plan'},'2026-11-04'),'');
 assert.equal(posInitialItemDate({productType:'weekly_meal_plan'},'2026-11-09'),'2026-11-09');
 assert.equal(posInitialItemDate({productType:'weekly_meal_plan'},'2026-11-09','2026-11-11'),'2026-11-11');
 assert.equal(posInitialItemDate(undefined,'2020-01-01'),'2020-01-01');
});

test('soft-deleted paid orders remain financial records but never produce kitchen eligibility or tickets',async()=>{
 const {isOrderOperationallyEligible,filterHistoryOrders}=await import('./posOrderModel');
 const {getOrderTickets}=await import('./orderTickets');
 const order={id:'deleted',orderNumber:'QA',orderSource:'pos',payment:{status:'paid',amountMinor:1200},total:12,deletedAt:'2026-11-04T08:00:00Z',items:[]} as any;
 assert.equal(isOrderOperationallyEligible(order),false);assert.deepEqual(getOrderTickets(order),[]);assert.deepEqual(filterHistoryOrders([order],'all',''),[]);assert.equal(order.payment.amountMinor,1200);
});
