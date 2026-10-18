import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import HealthyLunchMenu from './HealthyLunchMenu';
import HealthyLunchOptionsEditor from './HealthyLunchOptionsEditor';
import HealthyLunchPurchasedOptions from './HealthyLunchPurchasedOptions';
import { addDatedHealthyLunchLine } from './storeOrderFulfilments';
import { normalizeStoreOrderItem } from './storeOrderSnapshot';
import { normalizeStoreProduct } from './storeModel';
import { getStoreProductEditorDraft, prepareHealthyLunchDraft, syncHealthyLunchRecipe, updateHealthyLunchMeal } from './storeProductVisibility';
import type { StoreProduct, StoreProductDraft, StoreOrderItem, MealOptionGroup, CartSelection } from './types';

const group: MealOptionGroup = { id:'egg', name:'Egg Choice', type:'choose', required:true, selection:'single', options:[
  { id:'boiled',name:'Hard Boiled Egg',priceAdjustmentMinor:0 },
  { id:'omega',name:'Omega Onsen Egg',priceAdjustmentMinor:120 },
  { id:'kangori',name:'Kangori Onsen Egg',priceAdjustmentMinor:220 }
] };
const meal = { name:'Teriyaki Chicken Bowl',photoUrl:'meal.jpg',price:12.9,calories:520,optionGroups:[group] };
const product = { id:'plan',name:'Healthy Lunch',price:60,productType:'weekly_meal_plan',weeklyMenuVersion:3,available:true,rotationStartMonday:'2026-10-19',rotationWeeks:{ week1:{ meals:Object.fromEntries(['mon','tue','wed','thu','fri'].map(day => [day,day === 'mon' ? meal : { ...meal,name:`${day} bowl`,optionGroups:[] }])) } },healthyLunchBlockedDates:[],optionGroupIds:[] } as StoreProduct;
const render = (mode: 'week' | 'day', plan = product) => renderToStaticMarkup(<HealthyLunchMenu product={plan} products={[plan]} currency="MYR" weeks={['2026-10-19']} dayDates={['2026-10-19','2026-10-20']} choice={{ mode,date:'2026-10-19' }} onChange={() => {}} onAdd={() => {}} />);

test('dated customer UI displays RM0/1.20/2.20 under Monday and blocks required submission', () => {
  for (const mode of ['day','week'] as const) {
    const html = render(mode);
    for (const text of ['+RM0.00','+RM1.20','+RM2.20','Egg Choice']) assert.ok(html.includes(text));
    assert.equal((html.match(/type="radio"/g)||[]).length,3);
    assert.match(html,/Complete required choices/);
    assert.match(html,mode === 'week' ? /disabled=""[^>]*>Add 5-Day Plan/ : /aria-label="Add Teriyaki Chicken Bowl" disabled=""/);
    assert.ok(html.indexOf('Mon, 19 Oct') < html.indexOf('Egg Choice'));
    assert.ok(html.indexOf('Egg Choice') < html.indexOf('Tue, 20 Oct'));
  }
});

test('multi-select renders checkboxes, optional groups expose clearing, inactive items are hidden', () => {
  const plan = structuredClone(product);
  plan.rotationWeeks!.week1!.meals.mon.optionGroups = [{ ...group,required:false,selection:'multi',options:group.options.map(option => option.id === 'kangori' ? { ...option,active:false } : option) }];
  const html = render('day',plan);
  assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
  assert.doesNotMatch(html,/Kangori Onsen Egg/);
  assert.doesNotMatch(html,/Complete required choices/);
});

test('merchant editor exposes group/item fields and IDs survive edits, recipe sync and save/reload', () => {
  const html = renderToStaticMarkup(<HealthyLunchOptionsEditor groups={[group]} onChange={() => {}} />);
  for (const name of ['Group name','Choose','Add Side','Exchange','Multiple','Required','Add option','Delete option','Delete group']) assert.ok(html.includes(name));
  const edited = updateHealthyLunchMeal(meal,{ name:'Edited lunch' });
  const synced = syncHealthyLunchRecipe(edited,{ id:'recipe',title:'Recipe lunch',imageUrl:'recipe.jpg' } as never);
  assert.deepEqual(synced.optionGroups,[group]); assert.equal(synced.price,12.9);
  const draft = getStoreProductEditorDraft(product);
  draft.rotationWeeks!.week1!.meals.mon = synced;
  const saved = prepareHealthyLunchDraft(draft as StoreProductDraft);
  const reloaded = normalizeStoreProduct('plan',saved as never);
  assert.deepEqual(reloaded.rotationWeeks!.week1!.meals.mon.optionGroups,[group]);
  assert.notEqual(getStoreProductEditorDraft(reloaded).rotationWeeks!.week1!.meals.mon.optionGroups,reloaded.rotationWeeks!.week1!.meals.mon.optionGroups);
});

test('day cart lines combine matching choices and keep different choices separate', () => {
  const base = { optionGroupId:'egg',serviceDate:'2026-10-19' };
  let cart: Array<CartSelection & { key:string }> = [];
  cart = addDatedHealthyLunchLine(cart,'plan','plan',base.serviceDate,[{ ...base,optionId:'omega' }]);
  cart = addDatedHealthyLunchLine(cart,'plan','plan',base.serviceDate,[{ ...base,optionId:'omega' }]);
  cart = addDatedHealthyLunchLine(cart,'plan','plan',base.serviceDate,[{ ...base,optionId:'boiled' }]);
  assert.deepEqual(cart.map(line => line.quantity),[2,1]);
  assert.equal(cart[0].selectedMealOptions![0].optionId,'omega');
});

test('normalization and kitchen/POS rendering preserve purchased day names/prices without menu lookups', () => {
  const selected = { optionGroupId:'egg',optionGroupName:'Egg Choice',optionGroupType:'choose',optionId:'omega',optionName:'Omega Onsen Egg',priceAdjustmentMinor:120,serviceDate:'2026-10-19' };
  const day = { serviceDate:'2026-10-19',selectedMealOptions:[selected],optionSurchargeUnitMinor:120 };
  for (const weekly of [false,true]) {
    const item = normalizeStoreOrderItem({ productId:'plan',productName:'Healthy Lunch',quantity:2,basePrice:60,unitPrice:61.2,lineTotal:122.4,selectedOptions:[],
      ...(weekly ? { weeklyPlanSnapshot:{ meals:[{ day:'mon',productName:'Purchased bowl',productId:'plan',photoUrl:'meal.jpg',...day }] } } : { healthyLunchSnapshot:{ planId:'plan',date:'2026-10-19',...day } }) });
    const snapshot = weekly ? item.weeklyPlanSnapshot!.meals[0] : item.healthyLunchSnapshot;
    assert.deepEqual(snapshot!.selectedMealOptions,[selected]); assert.equal(snapshot!.optionSurchargeUnitMinor,120);
    const html = renderToStaticMarkup(<HealthyLunchPurchasedOptions item={item as StoreOrderItem} />);
    assert.match(html,/2026-10-19/); assert.match(html,/Egg Choice: Omega Onsen Egg/); assert.match(html,/\+RM1\.20/);
  }
  const old = normalizeStoreOrderItem({ productName:'Old meal',quantity:1,selectedOptions:[] });
  assert.equal(renderToStaticMarkup(<HealthyLunchPurchasedOptions item={old} />),'');
});
