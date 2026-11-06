import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import PosWeeklyMenu from './PosWeeklyMenu';
import type {StoreProduct, WorkspaceStore} from './types';
const product={id:'weekly',storeId:'s',workspaceId:'s',name:'Weekly',price:60,available:true,productType:'weekly_meal_plan',weeklyMenuVersion:2,weeklyWeeks:{week1:{startMonday:'2026-11-09',meals:Object.fromEntries(['mon','tue','wed','thu','fri'].map(day=>[day,{name:`${day} meal`,photoUrl:`https://example.com/${day}.jpg`,price:12}]))}}} as StoreProduct;
const store={id:'s',workspaceId:'s',currency:'MYR',country:'MY',orderDays:['monday','tuesday','wednesday','thursday','friday'],pickupOperatingHours:{start:'09:00',end:'18:00'},maximumAdvanceDays:30} as WorkspaceStore;
const render=(date:string)=>renderToStaticMarkup(<PosWeeklyMenu product={product} products={[product]} store={store} unrestricted exactTime defaultDate={date} defaultTime="09:17" onAdd={()=>{}}/>);
test('main non-Monday date never populates the Weekly Plan Monday input',()=>{
 for(const date of ['2026-11-04','2026-11-10','2020-01-01','']) {
  const html=render(date);
  assert.match(html,/Week starting \(Monday\)<input type="date"[^>]*value=""/);
  assert.match(html,/value="09:17"/);
 }
});
test('a valid main Monday is inherited without changing catalog week dates',()=>{
 const html=render('2026-11-09');
 assert.match(html,/Week starting \(Monday\)<input type="date"[^>]*value="2026-11-09"/);
 assert.match(html,/Mon, 9 Nov/); assert.match(html,/Fri, 13 Nov/);
});
