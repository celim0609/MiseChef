import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posStoreDate, posWeekMonday, resolvePosAddOrderMeal } from './posAddOrder.js';
const { plan } = JSON.parse(readFileSync(new URL('./fixtures/productionWeeklyMenu.json', import.meta.url)));

test('Store-local dates normalize Monday–Sunday including UTC and Kuala Lumpur midnight boundaries', () => {
  for (let day = 16; day <= 22; day++) assert.equal(posWeekMonday(`2026-11-${day}`), '2026-11-16');
  assert.equal(posWeekMonday('2026-02-30'), '');
  assert.equal(posStoreDate({country:'MY'},new Date('2026-11-15T15:59:59Z')), '2026-11-15');
  assert.equal(posStoreDate({country:'MY'},new Date('2026-11-15T16:00:00Z')), '2026-11-16');
  assert.equal(posStoreDate({timeZone:'UTC'},new Date('2026-11-15T16:00:00Z')), '2026-11-15');
});
test('actual Production four-slot menu retains its own identity/prices, not private Beta fixture values',()=>{
  assert.equal(Object.keys(plan.rotationWeeks).length,4);
  const meal=resolvePosAddOrderMeal(plan,[],'2026-11-16','2026-11-21','2026-11-20').meal;
  assert.equal(meal.name,'Thai Basil Prawn Rice Bowl');assert.equal(meal.price,13.9);
  const next=resolvePosAddOrderMeal(plan,[],'2026-11-23','2026-11-22','2026-11-20').meal;
  assert.equal(next.name,"Sambal Glazed Chicken with Ginger Rice Bowl");assert.equal(next.price,13.9);
  for(const source of ['2026-10-12','2026-10-19','2026-10-26','2026-11-02'])
    assert.ok(resolvePosAddOrderMeal(plan,[],source,'2026-11-21','2026-11-20').meal);
});
test('retained source selection rejects missing/deleted data and past fulfilment without inventing prices',()=>{
  assert.match(resolvePosAddOrderMeal(plan,[],'2026-11-16','2026-11-19','2026-11-20').error,/historical workflow/);
  assert.match(resolvePosAddOrderMeal(plan,[],'2026-11-21','2026-11-22','2026-11-20').error,/Monday/);
  assert.match(resolvePosAddOrderMeal(plan,[],'2026-02-30','2026-11-21','2026-11-20').error,/valid/);
  assert.match(resolvePosAddOrderMeal({...plan,rotationWeeks:{}},[],'2026-11-16','2026-11-21','2026-11-20').error,/No retained/);
  const dated={...plan,weeklyMenuVersion:2,weeklyWeeks:{old:{startMonday:'2026-10-12',meals:{mon:{name:'Retained dated meal',price:9.25,photoUrl:'meal.jpg'}}}}};
  assert.equal(resolvePosAddOrderMeal(dated,[],'2026-10-12','2026-11-21','2026-11-20').meal.price,9.25);
  assert.match(resolvePosAddOrderMeal(dated,[],'2026-10-19','2026-11-21','2026-11-20').error,/No retained/);
});

test('POS source selection preserves fixed Week 4 and Week 1 slots and missing-slot rejection',()=>{
 for(const [date,slot] of [['2026-11-16','week3'],['2026-11-23','week4'],['2026-11-30','week1']]) {
  const result=resolvePosAddOrderMeal(plan,[],date,'2026-12-05','2026-11-20');
  assert.equal(result.meal.name,plan.rotationWeeks[slot].meals.mon.name);
  assert.equal(result.meal.price,plan.rotationWeeks[slot].meals.mon.price);
 }
 const missing=structuredClone(plan);delete missing.rotationWeeks.week4;
 assert.match(resolvePosAddOrderMeal(missing,[],'2026-11-23','2026-12-05','2026-11-20').error,/No retained/);
 assert.equal(resolvePosAddOrderMeal(missing,[],'2026-11-30','2026-12-05','2026-11-20').meal.name,plan.rotationWeeks.week1.meals.mon.name);
});
