import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExternalOrderItems} from './externalPosOrderModel.js';
const now=new Date('2026-10-18T04:00:00Z');
const days=['mon','tue','wed','thu','fri'];
const meals=days.map(day=>({id:day,storeId:'s',workspaceId:'s',name:`Configured ${day} dish`,available:true,price:17,optionGroupIds:[],availableDay:day}));
const plan={id:'plan',storeId:'s',workspaceId:'s',name:'Configured weekly menu',available:true,price:63.5,optionGroupIds:[],productType:'weekly_meal_plan',weeklyMeals:Object.fromEntries(days.map(day=>[day,day]))};
const rice={id:'rice',storeId:'s',workspaceId:'s',name:'Rice',available:true,price:9,optionGroupIds:[]};
const checkout={store:{id:'s',workspaceId:'s',country:'MY',currency:'MYR',orderDays:['monday','tuesday','wednesday','thursday','friday'],earliestPickupDays:0,maximumAdvanceDays:30,unavailableDates:[],pickupOperatingHours:{start:'09:00',end:'18:00'},pickupLocations:[{id:'loc',name:'Kitchen',address:'Full pickup address'}]},products:[plan,...meals,rice],optionGroups:[],sets:[]};
const selection={productId:'plan',quantity:2,selectedOptions:[],unitPrice:1};
test('external weekly packages retain configured price and five actual daily meal allocations',()=>{
 const built=buildExternalOrderItems({selections:[selection],lineSchedules:[{date:'2026-10-19',time:'12:00'}]},checkout,now);
 assert.equal(built.items[0].lineTotal,127);assert.equal(built.items[0].weeklyPlanSnapshot.meals.length,5);
 assert.equal(built.fulfilments.length,5);
 for(const [i,day] of built.fulfilments.entries()) {
  assert.equal(day.date,`2026-10-${19+i}`);assert.equal(day.time,'12:00');
  assert.deepEqual(day.allocations,[{itemIndex:0,quantity:2,componentDay:days[i]}]);
  assert.equal(built.items[0].weeklyPlanSnapshot.meals[i].productName,`Configured ${days[i]} dish`);
 }
});
test('weekly and separately dated products keep one financial parent with correct line indexes',()=>{
 const built=buildExternalOrderItems({selections:[selection,{productId:'rice',quantity:3,selectedOptions:[]}],lineSchedules:[{date:'2026-10-19',time:'12:00'},{date:'2026-10-20',time:'12:00'}]},checkout,now);
 assert.equal(built.items.reduce((sum,item)=>sum+item.lineTotal,0),154);
 assert.deepEqual(built.fulfilments[1].allocations,[{itemIndex:0,quantity:2,componentDay:'tue'},{itemIndex:1,quantity:3}]);
});
test('weekly plans cannot become an unscheduled single meal or accept unavailable dates/times',()=>{
 for(const schedule of [undefined,{date:'2026-10-20',time:'12:00'},{date:'2026-10-19',time:'23:00'}]) assert.throws(()=>buildExternalOrderItems({selections:[selection],...(schedule?{lineSchedules:[schedule]}:{})},checkout,now));
 const blocked={...checkout,store:{...checkout.store,unavailableDates:['2026-10-21']}};
 assert.throws(()=>buildExternalOrderItems({selections:[selection],lineSchedules:[{date:'2026-10-19',time:'12:00'}]},blocked,now));
});
test('ordinary immediate orders retain their established kitchen workflow',()=>{
 const built=buildExternalOrderItems({selections:[{productId:'rice',quantity:2,selectedOptions:[]}]},checkout,now);
 assert.equal(built.items[0].lineTotal,18);assert.equal(built.fulfilments,undefined);
});

test('set choices use configured group selections, upgrades, quantity and fulfilment date',()=>{
 const set={id:'set',name:'Configured set',price:14,available:true,groups:[{id:'main',name:'Dish',selectionCount:1,required:true,options:[{productId:'rice',priceAdjustment:2}]}]};
 const input={selections:[{setId:'set',quantity:3,selectedOptions:[],selectedSetItems:[{groupId:'main',productId:'rice'}]}],lineSchedules:[{date:'2026-10-19',time:'12:00'}]};
 const built=buildExternalOrderItems(input,{...checkout,sets:[set]},now);
 assert.equal(built.items[0].lineTotal,48);assert.equal(built.items[0].setSnapshot.selectedGroups[0].productName,'Rice');
 assert.equal(built.fulfilments[0].date,'2026-10-19');assert.equal(built.fulfilments[0].allocations[0].quantity,3);
 assert.throws(()=>buildExternalOrderItems({...input,selections:[{...input.selections[0],selectedSetItems:[]}]},{...checkout,sets:[set]},now));
});

test('individual dated menu dishes preserve their configured per-day price and snapshot',()=>{
 const embedded={...plan,weeklyMenuVersion:2,weeklyMeals:undefined,weeklyWeeks:{week1:{startMonday:'2026-10-19',meals:Object.fromEntries(days.map((day,index)=>[day,{name:`Embedded ${day} dish`,photoUrl:'https://example.test/meal.jpg',price:10+index}]))}}};
 const data={...checkout,products:[embedded,rice]};
 const built=buildExternalOrderItems({selections:[{productId:'plan',healthyLunchPlanId:'plan',healthyLunchDate:'2026-10-20',quantity:2,selectedOptions:[]}],lineSchedules:[{date:'2026-10-20',time:'12:00'}]},data,now);
 assert.equal(built.items[0].productName,'Embedded tue dish');assert.equal(built.items[0].lineTotal,22);
 assert.equal(built.items[0].healthyLunchSnapshot.date,'2026-10-20');assert.equal(built.fulfilments.length,1);
 assert.throws(()=>buildExternalOrderItems({selections:[{productId:'mon',quantity:1,selectedOptions:[]}]},checkout,now),/Available day/);
});
