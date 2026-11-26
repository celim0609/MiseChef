import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePromotionPricing, applyManualDiscount,allocateDiscountMinor} from './storePromotionPricing.js';
const items=[{productId:'a',productName:'Food',quantity:1,basePrice:10.01,lineTotal:10.01},{productId:'b',productName:'Drink',quantity:2,basePrice:5,lineTotal:10}];
const apply=(discount,extra={})=>applyManualDiscount({items,pricing:calculatePromotionPricing({items,excluded:true}),discount,authorized:true,uid:'owner',now:new Date('2026-11-25T01:00:00Z'),...extra});
test('manual discount uses canonical totals, cents allocation and immutable source prices',()=>{
 const before=JSON.stringify(items);
 for(const [discount,saving] of [[{type:'fixed_amount',value:1.01},1.01],[{type:'percentage',value:12.5},2.5],[{type:'percentage',value:100},20.01]]){
  const result=apply({...discount,reason:' Goodwill '});
  assert.equal(result.merchandiseSubtotal,20.01);assert.equal(result.discountTotal,saving);
  assert.equal(Math.round(result.discountedMerchandiseTotal*100),2001-Math.round(saving*100));
  assert.equal(result.promotionSnapshot.lineAdjustments.reduce((sum,line)=>sum+Math.round(line.discountAmount*100),0),Math.round(saving*100));
  assert.equal(result.manualDiscountSnapshot.authorizedBy,'owner');assert.equal(result.manualDiscountSnapshot.reason,'Goodwill');
 }
 assert.equal(JSON.stringify(items),before);
 assert.deepEqual(allocateDiscountMinor([1,1,1],2).map(row=>row.amount),[1,1,0]);
});
test('invalid, forged, over-subtotal and over-percentage discounts are rejected',()=>{
 for(const discount of [{type:'fixed_amount',value:-1},{type:'fixed_amount',value:20.02},{type:'percentage',value:100.01},{type:'percentage',value:NaN},{type:'fixed_amount',value:Infinity},{type:'fixed_amount',value:0.001},{type:'fixed_amount',value:'1'},{type:'fixed_amount',value:1,authorizedBy:'owner'},{type:'fixed_amount',value:1,reason:'a'.repeat(241)},[],{}]) assert.throws(()=>apply(discount));
 assert.throws(()=>apply({type:'fixed_amount',value:1},{authorized:false}),/Owner or Manager/);
 assert.throws(()=>apply({type:'fixed_amount',value:1},{uid:''}),/Owner or Manager/);
});
test('implicit stacking, promotion codes and carts with no eligible product subtotal are rejected',()=>{
 for(const extra of [{pricing:{...calculatePromotionPricing({items}),discountTotal:1}},{pricing:{...calculatePromotionPricing({items}),promotionCodeSnapshot:{code:'KEEP'}}},{items:[{...items[0],weeklyPriceSnapshot:{discountAmount:2}}]},{items:[{...items[0],itemType:'set'}]}]) assert.throws(()=>apply({type:'fixed_amount',value:1},extra),/Explicitly choose|Weekly Discounts|Set offers|promotion code|eligible product subtotal/);
 const pricing=calculatePromotionPricing({items});assert.equal(applyManualDiscount({pricing,discount:undefined}),pricing);
});
