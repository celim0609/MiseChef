import assert from 'node:assert/strict';
import test from 'node:test';
import {historyIndexRows, historySearchTerms, historySearchToken, normalizeHistorySearch} from './posHistoryIndex.js';
const base={storeId:'store',workspaceId:'workspace',customerName:'Ａisha 林',orderNumber:'MC-123',items:[],fulfilmentStatus:'New',createdAt:'2026-10-01T00:00:00Z'};
test('search grams find substrings anywhere, Unicode and short searches',()=>{
 for(const text of ['isha','林','mc-123','23','i']) {
  const terms=new Set([base.customerName,base.orderNumber].flatMap(historySearchTerms));
  assert.ok(terms.has(historySearchToken(text)));
 }
 assert.equal(normalizeHistorySearch(' ＡISHA '),'aisha');
});
test('index dates are purchased fulfilment dates and deduplicate same-day schedules',()=>{
 const order={...base,fulfilments:[{id:'one',date:'2026-11-23',method:'pickup'},{id:'two',date:'2026-11-24',method:'delivery'},{id:'three',date:'2026-11-23'}]};
 const before=structuredClone(order);
 assert.deepEqual(historyIndexRows(order,'id').map(row=>row.date),['2026-11-23','2026-11-24']);
 assert.deepEqual(order,before);
 assert.equal(historyIndexRows({...order,deletedAt:'now'},'id').length,0);
});
test('weekly, legacy dated meals, ordinary delivery and unscheduled weekly parents retain their date semantics',()=>{
 assert.equal(historyIndexRows({...base,weeklyFulfilments:[{date:'2026-12-01'}]},'id')[0].date,'2026-12-01');
 assert.equal(historyIndexRows({...base,items:[{quantity:1,healthyLunchSnapshot:{date:'2026-12-02'}}]},'id')[0].date,'2026-12-02');
 assert.equal(historyIndexRows({...base,delivery:{schedule:{date:'2026-12-03'}}},'id')[0].date,'2026-12-03');
 assert.deepEqual(historyIndexRows({...base,items:[{weeklyPlanSnapshot:{}}]},'id'),[]);
});

test('transient index errors retry within a bounded handler and persistent failures remain visible',async()=>{
 const {retryHistoryIndexSync}=await import('./posHistoryIndex.js');
 let calls=0;
 assert.equal(await retryHistoryIndexSync(async()=>{if(++calls<2)throw new Error('transient');return 'indexed';},async()=>{}),'indexed');
 assert.equal(calls,2);calls=0;
 await assert.rejects(retryHistoryIndexSync(async()=>{calls++;throw new Error('persistent');},async()=>{}),/persistent/);
 assert.equal(calls,3);
});
