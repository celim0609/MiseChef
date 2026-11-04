import test from 'node:test';
import assert from 'node:assert/strict';
import { createPosDeliveryQuote, resolvePosDeliveryCharge } from './posDeliveryQuotes.js';
const now=new Date('2026-11-04T04:00:00Z');
const checkout={store:{id:'s',workspaceId:'s',currency:'MYR',pickupLocations:[{id:'loc',name:'Counter',address:'Store'}],delivery:{enabled:true,provider:'lalamove',market:'MY',environment:'sandbox',serviceType:'MOTORCYCLE',pickup:{address:'Store',latitude:'4.6',longitude:'101.1'},freeDelivery:{enabled:false}}},products:[{id:'p',storeId:'s',workspaceId:'s',name:'Meal',available:true,price:12,optionGroupIds:[]}],sets:[],optionGroups:[]};
const input={slug:'store',storeId:'s',workspaceId:'s',fulfilmentMethod:'delivery',fulfilmentDate:'2026-11-05',fulfilmentTime:'12:00',deliveryAddress:'Corrected unit 1',destination:{formattedAddress:'Corrected unit 1',placeId:'my-place',latitude:'99',longitude:'0'},selections:[{productId:'p',quantity:2,selectedOptions:[]}]};
function fixture(){
 const docs=new Map(), requests=[];
 const db={collection:()=>({doc:id=>({create:async value=>docs.set(id,value),id})})};
 const transaction={get:async ref=>({data:()=>docs.get(ref.id)})};
 const provider={environment:'sandbox',createQuote:async request=>{requests.push(request);return {quotationId:`quote-${requests.length}`,expiresAt:'2026-11-04T04:10:00Z',priceBreakdown:{total:'9.50',currency:'MYR'},serviceType:'MOTORCYCLE',stops:[]};},createOrder:()=>{throw new Error('Booking must never be invoked');}};
 const args={db,uid:'manager',input,provider,authorize:async()=>true,loadCheckout:async()=>checkout,resolvePlace:async()=>({latitude:4.61,longitude:101.11}),now};
 return {args,docs,requests,transaction};
}
test('authenticated quote-only POS resolves server pins, preserves corrected address and uses the chosen MYT schedule',async()=>{
 const f=fixture(),q=await createPosDeliveryQuote(f.args);
 assert.equal(q.customerDeliveryFee,9.5);assert.equal(q.providerDeliveryFee,9.5);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].data.scheduleAt,'2026-11-05T04:00:00.000Z');
 assert.deepEqual(f.requests[0].data.stops[1],{address:'Corrected unit 1',coordinates:{lat:'4.61',lng:'101.11'}});
 const saved=f.docs.get(q.id);assert.equal(saved.uid,'manager');assert.equal(saved.purpose,'pos_estimate_only');
 const built={items:[{productId:'p'}]};
 await assert.rejects(resolvePosDeliveryCharge({db:f.args.db,transaction:f.transaction,input:{...input,posDeliveryQuoteId:q.id},checkout,built,uid:'manager',fullAccess:true,now}),/changed/);
});
test('past schedules never block POS recording but cannot request a provider quotation',async()=>{
 const f=fixture();
 await assert.rejects(createPosDeliveryQuote({...f.args,input:{...input,fulfilmentDate:'2020-01-01'}}),/future/);
 assert.equal(f.requests.length,0);
 const charge=await resolvePosDeliveryCharge({db:f.args.db,transaction:f.transaction,input:{...input,deliveryFeeOverride:{amount:5,reason:'Historical delivery; quotation unavailable'}},checkout,uid:'manager',fullAccess:true,now});
 assert.equal(charge.fee,5);assert.equal(charge.snapshot.providerDeliveryFee,null);
});
test('manual fee is role-scoped, exact cents, bounded and audited',async()=>{
 const f=fixture();
 const args={db:f.args.db,transaction:f.transaction,input:{...input,deliveryFeeOverride:{amount:5,reason:'Provider unavailable'}},checkout,uid:'chef',fullAccess:false,now};
 await assert.rejects(resolvePosDeliveryCharge(args),e=>e.code==='permission-denied');
 for(const amount of [-1,1.234,Infinity,'5',100001]) await assert.rejects(resolvePosDeliveryCharge({...args,fullAccess:true,input:{...args.input,deliveryFeeOverride:{amount,reason:'Unavailable'}}}));
 await assert.rejects(resolvePosDeliveryCharge({...args,fullAccess:true,input:{...args.input,deliveryFeeOverride:{amount:5,reason:''}}}));
});
test('quote access rejects unauthenticated, cross-workspace and revoked roles before any provider call',async()=>{
 for(const override of [{uid:''},{input:{...input,workspaceId:'other'}},{authorize:async()=>{throw new Error('role revoked');}}]){
  const f=fixture();await assert.rejects(createPosDeliveryQuote({...f.args,...override}));assert.equal(f.requests.length,0);
 }
});
test('multi-date addresses get distinct provider quotations and existing free delivery policy applies to each allocation',async()=>{
 const f=fixture();
 const request={...input,selections:[...input.selections,{...input.selections[0],quantity:1}],lineSchedules:[{date:'2026-11-05',time:'12:00'},{date:'2026-11-06',time:'13:00'}],deliveryDestinations:{'2026-11-06':{placeId:'second',formattedAddress:'Different destination'}}};
 const config={...checkout,store:{...checkout.store,delivery:{...checkout.store.delivery,freeDelivery:{enabled:true,distanceThresholdKm:20,minimumSubtotalWithin:20,minimumSubtotalBeyond:100}}}};
 const q=await createPosDeliveryQuote({...f.args,input:request,loadCheckout:async()=>config});
 assert.equal(f.requests.length,2);assert.equal(f.requests[1].data.stops[1].address,'Different destination');
 assert.equal(q.providerDeliveryFee,19);assert.equal(q.customerDeliveryFee,9.5);assert.equal(q.days[0].freeDeliveryApplied,true);assert.equal(q.days[1].freeDeliveryApplied,false);
});

test('saved quotes validate exact canonical items, schedule, destination, policy, operator and expiry at checkout',async()=>{
 const {buildExternalOrderItems}=await import('./externalPosOrderModel.js');
 const f=fixture(),q=await createPosDeliveryQuote(f.args);
 const built=buildExternalOrderItems(input,checkout,now,{owner:true});
 const args={db:f.args.db,transaction:f.transaction,input:{...input,posDeliveryQuoteId:q.id},checkout,built,uid:'manager',fullAccess:true,now};
 const charge=await resolvePosDeliveryCharge(args);assert.equal(charge.fee,9.5);assert.equal(charge.snapshot.providerDeliveryFee,9.5);
 for(const override of [
  {uid:'other'}, {now:new Date('2026-11-04T04:09:56Z')},
  {input:{...args.input,destination:{...input.destination,formattedAddress:'Changed address'}}},
  {built:{...built,items:built.items.map(i=>({...i,quantity:3}))}},
  {checkout:{...checkout,store:{...checkout.store,delivery:{...checkout.store.delivery,serviceType:'CAR'}}}},
 ])await assert.rejects(resolvePosDeliveryCharge({...args,...override}),/expired|changed/);
});

test('same-date different times get separate quotes and fees; provider failures never create a booking or snapshot',async()=>{
 const f=fixture();
 const request={...input,selections:[input.selections[0],input.selections[0]],lineSchedules:[{date:'2026-11-05',time:'12:00'},{date:'2026-11-05',time:'13:00'}]};
 const q=await createPosDeliveryQuote({...f.args,input:request});assert.equal(f.requests.length,2);assert.equal(q.customerDeliveryFee,19);
 const failed=fixture();await assert.rejects(createPosDeliveryQuote({...failed.args,provider:{...failed.args.provider,createQuote:async()=>{throw new Error('Provider unavailable');}}}),/unavailable/);assert.equal(failed.docs.size,0);
});

test('Manual Order reuses quote-only pricing for store delivery and excludes pickup/customer-arranged items', async () => {
 const {buildManualOrder, manualDeliveryInput} = await import('./manualPosOrders.js');
 const f=fixture();
 const lines = [
  {selection:{productId:'p',selectedOptions:[]},quantity:1,date:'2026-11-05',time:'12:00',method:'delivery',deliveryArrangement:'store',deliveryAddress:'Unit 1',destination:{placeId:'my-place',latitude:'99',longitude:'0'},notes:''},
  {custom:{name:'Pickup catering',unitPrice:500},quantity:1,date:'2026-11-06',time:'12:00',method:'pickup',deliveryAddress:'',notes:''},
  {custom:{name:'Own driver',unitPrice:500},quantity:1,date:'2026-11-07',time:'12:00',method:'delivery',deliveryAddress:'Own address',notes:''}
 ];
 const request={...input,selections:undefined,manualPos:true,source:'whatsapp',customerName:'QA',lines};
 const config={...checkout,store:{...checkout.store,delivery:{...checkout.store.delivery,freeDelivery:{enabled:true,distanceThresholdKm:20,minimumSubtotalWithin:20,minimumSubtotalBeyond:100}}}};
 const q=await createPosDeliveryQuote({...f.args,input:request,loadCheckout:async()=>config,buildItems:buildManualOrder,normalizeInput:manualDeliveryInput});
 assert.equal(f.requests.length,1); assert.equal(q.customerDeliveryFee,9.5);
 const normalized=manualDeliveryInput({...request,posDeliveryQuoteId:q.id},config.products);
 const built=buildManualOrder(request,config,now,{owner:true});
 const args={db:f.args.db,transaction:f.transaction,input:normalized,checkout:config,built,uid:'manager',fullAccess:true,now};
 assert.equal((await resolvePosDeliveryCharge(args)).fee,9.5);
 await assert.rejects(resolvePosDeliveryCharge({...args,now:new Date('2026-11-04T04:10:00Z')}),/expired/);
 await assert.rejects(resolvePosDeliveryCharge({...args,built:{...built,total:1,items:built.items.map(i=>({...i,quantity:10}))}}),/changed/);
 assert.equal(f.requests[0].data.stops[1].coordinates.lat,'4.61');
});
