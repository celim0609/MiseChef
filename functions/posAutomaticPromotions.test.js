import test from 'node:test';import assert from 'node:assert/strict';
import {calculatePosPricing,posPricingExpectation,assertPosPricingExpected} from './storePromotionPricing.js';
const now=new Date('2026-11-26T04:00:00Z');
const items=[{productId:'mochi',productName:'Mochi',quantity:1,basePrice:18.9,lineTotal:18.9},{productId:'drink',productName:'Drink',quantity:1,basePrice:5.1,lineTotal:5.1}];
const offer={id:'promo',storeId:'s',workspaceId:'s',name:'Mochi Cake Series',active:true,type:'fixed_amount',fixedAmountOff:4,eligibleProductIds:['mochi'],minimumQuantity:0,minimumOrderAmount:0,startsAt:'2026-01-01',endsAt:'2027-01-01',priority:0};
const calculate=(discount,extra={})=>calculatePosPricing({items,promotions:[offer],discount,authorized:true,uid:'manager',now,...extra});
test('POS automatically applies only actual valid product offers at canonical subtotal',()=>{
 const result=calculate();assert.equal(result.merchandiseSubtotal,24);assert.equal(result.automaticDiscountTotal,4);assert.equal(result.manualDiscountTotal,0);assert.equal(result.discountedMerchandiseTotal,20);assert.equal(result.promotionSnapshot.lineAdjustments[0].finalLineTotal,14.9);
 for(const change of [{active:false},{endsAt:'2026-11-25'},{startsAt:'2026-12-01'},{minimumQuantity:2},{minimumOrderAmount:25},{eligibleProductIds:['other']}]){
  const price=calculate({type:'fixed_amount',value:1},{promotions:[{...offer,...change}]});assert.equal(price.automaticDiscountTotal,0);assert.equal(price.manualDiscountTotal,1);assert.equal(price.discountedMerchandiseTotal,23);
 }
});
test('keep, replace and explicit stack have distinct auditable amounts and never double-discount',()=>{
 assert.throws(()=>calculate({type:'fixed_amount',value:1}),/Explicitly choose/);
 const keep=calculate({type:'percentage',value:10,application:'keep'});assert.equal(keep.discountTotal,4);assert.equal(keep.manualDiscountSnapshot,undefined);
 const replace=calculate({type:'percentage',value:10,application:'replace'});assert.equal(replace.automaticDiscountTotal,0);assert.equal(replace.manualDiscountTotal,2.4);assert.equal(replace.discountedMerchandiseTotal,21.6);assert.equal(replace.manualDiscountSnapshot.stackingPolicy,'replace');assert.equal(replace.manualDiscountSnapshot.replacedPromotions[0].promotionId,'promo');
 const stack=calculate({type:'percentage',value:10,application:'stack'});assert.equal(stack.automaticDiscountTotal,4);assert.equal(stack.manualDiscountTotal,2);assert.equal(stack.discountTotal,6);assert.equal(stack.discountedMerchandiseTotal,18);assert.equal(stack.manualDiscountSnapshot.eligibleSubtotal,20);assert.equal(stack.promotionSnapshot.appliedPromotions[0].promotionId,'promo');
 assert.equal(stack.promotionSnapshot.lineAdjustments.reduce((n,l)=>n+Math.round(l.discountAmount*100),0),600);
 assert.throws(()=>calculate({type:'fixed_amount',value:20.01,application:'stack'}),/eligible product subtotal/);
 assert.throws(()=>calculate({type:'fixed_amount',value:1,application:'stack'},{authorized:false}),/Owner or Manager/);
});
test('Weekly Discounts and Set offer lines are never manually reduced or replaced',()=>{
 const protectedItems=[...items,{productId:'set',itemType:'set',quantity:1,lineTotal:10,basePrice:10},{productId:'weekly',quantity:1,lineTotal:50,basePrice:50,weeklyPriceSnapshot:{discountAmount:10,legacyPrice:false,discount:{type:'fixed_amount'}}}];
 const p=calculate({type:'percentage',value:10,application:'stack'},{items:protectedItems});assert.equal(p.manualDiscountSnapshot.eligibleSubtotal,20);
 assert.deepEqual(p.promotionSnapshot.lineAdjustments.slice(2).map(line=>[line.discountAmount,line.finalLineTotal]),[[0,10],[0,50]]);
});
test('reviewed pricing binds promotion identity, terms, cents and manual choice',()=>{
 const price=calculate({type:'percentage',value:10,application:'stack'});const input={manualDiscount:{type:'percentage',value:10,application:'stack'},expectedDiscountMinor:200,expectedPosPricing:posPricingExpectation(price)};
 assert.doesNotThrow(()=>assertPosPricingExpected(input,price));
 assert.throws(()=>assertPosPricingExpected({...input,expectedPosPricing:undefined},price),/pricing changed/);
 const changed=calculate(input.manualDiscount,{promotions:[{...offer,id:'new-offer'}]});assert.throws(()=>assertPosPricingExpected(input,changed),/pricing changed/);
});
test('quantity-dependent free units and options use existing eligibility without discounting option surcharges',()=>{
 const p=calculate(undefined,{items:[{productId:'mochi',quantity:3,basePrice:10,lineTotal:36}],promotions:[{...offer,type:'buy_x_get_y',buyQuantity:1,getQuantity:1}]});assert.equal(p.discountTotal,10);assert.equal(p.discountedMerchandiseTotal,26);
 const original=JSON.stringify(items);calculate({type:'fixed_amount',value:0.01,application:'stack'});assert.equal(JSON.stringify(items),original);
});
