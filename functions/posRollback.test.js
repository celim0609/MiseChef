import test from 'node:test';
import assert from 'node:assert/strict';
import {saveManualPosOrder,confirmManualPosPayment,buildManualOrder} from './manualPosOrders.js';
const at=new Date('2026-11-20T04:00:00Z');
const store={id:'s',workspaceId:'s',country:'MY',timeZone:'Asia/Kuala_Lumpur',currency:'MYR'};
const preservedOrder={id:'new',workspaceId:'s',storeId:'s',orderSource:'pos',fulfilmentStatus:'New',
 manualOrder:{posAddOrder:true,revision:1,createdBy:'owner',draft:{}},payment:{provider:'manual_pos',status:'pending',amountMinor:1890,currency:'MYR'},
 total:18.9,items:[{productId:'retained',productName:'Vietnam prawn noodle salad',quantity:1,unitPrice:13.9,lineTotal:13.9,healthyLunchSnapshot:{planId:'retained',date:'2026-11-16'}},{productId:'muffin',quantity:1,unitPrice:5,lineTotal:5}],
 fulfilments:[{date:'2026-11-21',time:'12:00',method:'pickup',allocations:[{itemIndex:0,quantity:1},{itemIndex:1,quantity:1}]}],fulfilmentCompletion:{},fulfilmentOperations:{}};
function database(){
 const docs={'workspaces/s':{ownerId:'owner',subscriptionPlan:'professional',subscriptionStatus:'active'},'stores/s':store,
  'workspaceMembers/s_manager':{userId:'manager',workspaceId:'s',role:'Manager',status:'Active'},
  'workspaceMembers/s_staff':{userId:'staff',workspaceId:'s',role:'Chef',status:'Active'},'storeOrders/new':structuredClone(preservedOrder)};
 const writes=[];const ref=(name,id)=>({id,key:`${name}/${id}`,get:async()=>snapshot({key:`${name}/${id}`})});
 const snapshot=r=>({exists:Boolean(docs[r.key]),data:()=>structuredClone(docs[r.key])});
 const db={collection:name=>({doc:id=>ref(name,id)}),runTransaction:async callback=>callback({get:async r=>snapshot(r),
  create(r,v){assert.ok(!docs[r.key]);docs[r.key]=structuredClone(v);writes.push(r.key);},
  update(r,v){for(const[k,x]of Object.entries(v)){const keys=k.split('.');let target=docs[r.key];while(keys.length>1)target=target[keys.shift()]??={};target[keys[0]]=x;}writes.push(r.key);}})};
 return{db,docs,writes};
}
const confirm={orderId:'new',expectedRevision:1,amountMinor:1890,method:'cash',reference:'Emulator-only receipt',received:true};
test('rollback rejects stale-client Add Order creation and editing without altering preserved records',async()=>{
 const f=database();const before=structuredClone(f.docs);const args={db:f.db,uid:'owner',now:at,loadCheckout:async()=>({store,products:[],sets:[],optionGroups:[]}),input:{workspaceId:'s',storeId:'s',slug:'s',requestId:'rollback-stable-request-123456',source:'other',customerName:'Local only',lines:[]}};
 await assert.rejects(saveManualPosOrder({...args,input:{...args.input,posAddOrder:true}}),/disabled by this rollback/);
 await assert.rejects(saveManualPosOrder({...args,input:{...args.input,orderId:'new',expectedRevision:1}}),/read-only in the rollback/);
 assert.deepEqual(f.docs,before);assert.equal(f.writes.length,0);
});
test('rollback retains role, receipt, amount, revision, gateway and historical restrictions for new-format records',async()=>{
 const f=database();const args={db:f.db,input:confirm,now:at};
 await assert.rejects(confirmManualPosPayment({...args,uid:'staff'}),/role/);
 for(const patch of [{received:false},{amountMinor:1},{expectedRevision:2}])
  await assert.rejects(confirmManualPosPayment({...args,uid:'owner',input:{...confirm,...patch}}),/Verify/);
 await assert.rejects(confirmManualPosPayment({...args,uid:'owner',now:new Date('2026-11-22T04:00:00Z')}),/Past fulfilments/);
 f.docs['storeOrders/new'].payment.provider='curlec';
 await assert.rejects(confirmManualPosPayment({...args,uid:'owner'}),/gateway payments/);f.docs['storeOrders/new'].payment.provider='manual_pos';
 assert.equal(f.writes.length,0);
 await confirmManualPosPayment({...args,uid:'manager'});const count=f.writes.length;
 assert.equal((await confirmManualPosPayment({...args,uid:'owner'})).duplicate,true);assert.equal(f.writes.length,count);
 const saved=f.docs['storeOrders/new'];assert.equal(saved.payment.status,'paid');assert.equal(saved.total,18.9);
 assert.deepEqual(saved.items,preservedOrder.items);assert.deepEqual(saved.fulfilments,preservedOrder.fulfilments);
 assert.deepEqual(saved.fulfilmentCompletion,{});assert.deepEqual(saved.fulfilmentOperations,{});
 assert.equal(f.writes.filter(p=>p.endsWith('_manual_payment_confirmed')).length,1);
});
test('rollback keeps the legacy unflagged manual builder behavior',()=>{
 const result=buildManualOrder({source:'other',customerName:'Local only',lines:[{custom:{name:'Existing custom workflow',unitPrice:7},quantity:1,date:'2020-01-01',time:'12:00',method:'pickup'}]}, {store,products:[],optionGroups:[],sets:[]},at,{owner:true});
 assert.equal(result.total,7);assert.equal(result.fulfilments[0].date,'2020-01-01');
});
