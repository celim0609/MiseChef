import test from 'node:test';
import assert from 'node:assert/strict';
import {getPosPromotionCatalog} from './posPromotionCatalog.js';
const input={storeId:'s',workspaceId:'w',slug:'shop'};
const offer={storeId:'s',workspaceId:'w',name:'Offer',active:true,type:'fixed_amount',fixedAmountOff:4,eligibleProductIds:['p'],minimumQuantity:0,minimumOrderAmount:0,startsAt:'2026-01-01',privateAudit:'never returned'};
function database(role='Chef',status='Active'){
 const records={'workspaces/w':{ownerId:'owner',subscriptionPlan:'professional',subscriptionStatus:'active'},'workspaceMembers/w_staff':{workspaceId:'w',userId:'staff',role,status},'stores/s':{workspaceId:'w',slug:'shop'}};
 const docs=[offer,{...offer,workspaceId:'other'},{...offer,active:false},{...offer,fixedAmountOff:-1}];
 return {collection(name){return {doc(id){return {get:async()=>({data:()=>records[`${name}/${id}`]})};},where(){return {where(){return this;},get:async()=>({docs:docs.map((data,i)=>({id:`offer${i}`,data:()=>data}))})};}};}};
}
test('POS scoped terms are available to operators without exposing private promotion metadata',async()=>{
 for(const role of ['Owner','Manager','Head Chef','Sous Chef','Chef']){
  const result=await getPosPromotionCatalog({db:database(role),uid:'staff',input});
  assert.equal(result.promotions.length,1);assert.equal(result.promotions[0].fixedAmountOff,4);assert.equal(result.promotions[0].privateAudit,undefined);
 }
});
test('POS promotion projection rejects unauthenticated, non-operators, inactive members and mismatched Store/Workspace',async()=>{
 for(const args of [{uid:''},{uid:'stranger'},{db:database('Viewer')},{db:database('Manager','Inactive')},{input:{...input,slug:'other'}},{input:{...input,workspaceId:'other'}},{input:{}}]){
  await assert.rejects(getPosPromotionCatalog({db:database(),uid:'staff',input,...args}));
 }
});
