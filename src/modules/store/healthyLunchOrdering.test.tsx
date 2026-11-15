import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import HealthyLunchMenu from './HealthyLunchMenu';
import type { StoreProduct } from './types';
import { WEEKLY_DAYS } from '../../../functions/storeWeeklyMealPlan.js';

const products = WEEKLY_DAYS.map(day => ({ id: day, name: `${day} lunch`, price: 12, photoUrl: '' })) as StoreProduct[];
const product = { id: 'healthy', name: 'Healthy Lunch', price: 55, productType: 'weekly_meal_plan', weeklyWeeks: {
  week1: { startMonday: '2026-10-19', meals: Object.fromEntries(WEEKLY_DAYS.map(day => [day, day])) },
  week2: { startMonday: '2026-10-26', meals: { mon: 'fri', tue: 'thu', wed: 'wed', thu: 'tue', fri: 'mon' } }
} } as StoreProduct;
const render = (mode: 'week' | 'day', date: string, weeks = ['2026-10-19','2026-10-26'], dayDates = ['2026-10-20','2026-10-21']) => renderToStaticMarkup(<HealthyLunchMenu product={product} products={products} currency="MYR" choice={{ mode, date }} weeks={weeks} dayDates={dayDates} onChange={() => {}} onAdd={() => {}} />);

const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

test('weekly view shows date ranges, five meals, one package price and one Add 5-Day Plan action', () => {
  const html = render('week', '2026-10-26');
  assert.match(html, />5-Day Plan</); assert.match(html, />Order by Day</);
  assert.match(html, /19–23 Oct/); assert.match(html, /26–30 Oct/);
  assert.match(text(html), /Mon, 26 Oct\s+fri lunch/); assert.match(text(html), /Fri, 30 Oct\s+mon lunch/);
  assert.doesNotMatch(html, /Week [1-4]|Mon, 19 Oct/);
  assert.equal((html.match(/<li /g) || []).length, 5);
  assert.equal((html.match(/55\.00/g) || []).length, 1);
  assert.equal((html.match(/>Add 5-Day Plan</g) || []).length, 1);
  assert.doesNotMatch(html, />Add</);
});

test('Order by Day lists every orderable date exactly once with an Add action and no dropdown', () => {
  const html = render('day', '2026-10-21', [], ['2026-10-21','2026-10-20','2026-10-21']);
  assert.doesNotMatch(html, /<select|Choose a date|Add 5-Day Plan|55\.00/);
  assert.match(html, /tue lunch/); assert.match(html, /wed lunch/); assert.match(html, /12\.00/);
  assert.equal((html.match(/Tue, 20 Oct/g) || []).length, 1);
  assert.equal((html.match(/Wed, 21 Oct/g) || []).length, 1);
  assert.ok(html.indexOf('Tue, 20 Oct') < html.indexOf('Wed, 21 Oct'));
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.equal((html.match(/>Add</g) || []).length, 2);
  assert.doesNotMatch(html, /Mon, 19 Oct|mon lunch|fri lunch|Week [1-4]/);
});

test('Order by Day exposes separate Add cards for Thu, Fri and next Monday', () => {
  const html = render('day', '', [], ['2026-10-26', '2026-10-23', '2026-10-22']);
  assert.deepEqual([...html.matchAll(/<time dateTime="([^"]+)"/g)].map(match => match[1]), ['2026-10-22', '2026-10-23', '2026-10-26']);
  assert.equal((html.match(/>Add</g) || []).length, 3);
  assert.match(html, /Thu, 22 Oct/); assert.match(html, /Fri, 23 Oct/); assert.match(html, /Mon, 26 Oct/);
  assert.ok(html.indexOf('Thu, 22 Oct') < html.indexOf('Fri, 23 Oct'));
  assert.ok(html.indexOf('Fri, 23 Oct') < html.indexOf('Mon, 26 Oct'));
});

test('closed full weeks cannot be added while available single days still have their own Add action', () => {
  const closed = render('week', '', [], ['2026-10-21']);
  assert.match(closed, /No available dates/); assert.match(closed, /<button[^>]*disabled=""[^>]*>Add 5-Day Plan</);
  const day = render('day', '', [], ['2026-10-21']);
  assert.match(day, /Wed, 21 Oct/); assert.match(day, /wed lunch/); assert.match(day, />Add</);
  const empty = render('day', '', [], []);
  assert.match(empty, /No meals are currently available/); assert.doesNotMatch(empty, />Add</);
});

test('both views use embedded photos, kcal and descriptions without a Single Product catalogue', () => {
  const meals = Object.fromEntries(WEEKLY_DAYS.map((day, index) => [day, { name: `${day} direct lunch`, photoUrl: `https://example.test/${day}.jpg`, price: 10 + index, calories: 400 + index, description: `${day} vegetables` }]));
  const embedded = { ...product, weeklyMenuVersion: 2, weeklyWeeks: { week2: { startMonday: '2026-10-19', meals } } } as StoreProduct;
  const renderEmbedded = (mode: 'week' | 'day') => renderToStaticMarkup(<HealthyLunchMenu product={embedded} products={[]} currency="MYR" choice={{ mode, date: '2026-10-19' }} weeks={['2026-10-19']} dayDates={['2026-10-20','2026-10-21']} onChange={() => {}} onAdd={() => {}} />);
  const full = renderEmbedded('week');
  assert.equal((full.match(/<img /g) || []).length, 5); assert.match(full, /19–23 Oct/);
  assert.doesNotMatch(full, /Week [1-4]|Meal unavailable/);
  const day = renderEmbedded('day');
  assert.match(day, /Wed, 21 Oct/); assert.match(day, /wed direct lunch/); assert.match(day, /402 kcal/);
  assert.match(day, /12\.00/); assert.match(day, /wed vegetables/); assert.match(day, /object-cover/);
  assert.match(day, /src="https:\/\/example.test\/wed.jpg"/); assert.equal((day.match(/<li /g) || []).length, 2);
});

test('rotation shows real repeating dates and omits blocked days without exposing slots', () => {
  const meals = (label: string) => Object.fromEntries(WEEKLY_DAYS.map(day => [day, { name: `${label} ${day}`, photoUrl: 'meal.jpg', price: 12 }]));
  const rotating = { ...product, weeklyWeeks: undefined, weeklyMenuVersion: 3, rotationStartMonday: '2026-10-19',
    rotationWeeks: { week2: { meals: meals('A') }, week4: { meals: meals('B') } }, healthyLunchBlockedDates: ['2026-10-23'] } as StoreProduct;
  const view = (mode: 'week' | 'day', date: string, weeks: string[], dayDates: string[]) => renderToStaticMarkup(<HealthyLunchMenu product={rotating} products={[]} currency="MYR" choice={{ mode, date }} weeks={weeks} dayDates={dayDates} onChange={() => {}} onAdd={() => {}} />);
  const days = view('day', '', [], ['2026-10-23', '2026-10-26', '2026-11-02']);
  assert.match(days, /B mon/); assert.match(days, /A mon/);
  assert.doesNotMatch(days, /Fri, 23 Oct|Week [1-4]|week[1-4]/);
  assert.equal((days.match(/>Add</g) || []).length, 2);
  const full = view('week', '2026-10-26', ['2026-10-26'], []);
  assert.match(full, /B mon/); assert.match(full, /26–30 Oct/);
  assert.doesNotMatch(full, /Week [1-4]|week[1-4]/);
});

test('weekly display shows independent original, discount and final prices while daily prices stay unchanged', () => {
  const meals = Object.fromEntries(WEEKLY_DAYS.map(day => [day, { name: `${day} lunch`, photoUrl: 'meal.jpg', price: 12 }]));
  const plan = { ...product, weeklyMenuVersion: 3, weeklyWeeks: undefined, rotationStartMonday: '2026-10-19', rotationWeeks: { week1: { meals, discount: { type: 'percentage', value: 10 } }, week2: { meals, discount: { type: 'fixed_weekly_price', value: 40 } } } } as StoreProduct;
  for (const [date, final] of [['2026-10-19', '54.00'], ['2026-10-26', '40.00']]) {
    const html = renderToStaticMarkup(<HealthyLunchMenu product={plan} products={[]} currency="MYR" weeks={['2026-10-19','2026-10-26']} dayDates={[]} choice={{mode:'week',date}} onChange={() => {}} />);
    assert.match(html, /Original Price/); assert.match(html, /Discount/); assert.match(html, /Final Weekly Price/); assert.ok(html.includes(final));
  }
});


test('ingredients are disclosed without dropping source text and required exchanges stay open', () => {
  const meals = Object.fromEntries(WEEKLY_DAYS.map(day => [day, { name: day, photoUrl: `https://example.test/${day}.jpg`, price: 12.9, description: 'Original ingredients', optionGroups: day === 'wed' ? [{id:'exchange',name:'Exchange',type:'exchange',selection:'single',required:true,options:[{id:'egg',name:'Onsen Egg',priceAdjustmentMinor:150}]}] : [] }]));
  const plan = {...product, weeklyMenuVersion:2, weeklyWeeks:{week1:{startMonday:'2026-10-19',meals}}} as StoreProduct;
  const html = renderToStaticMarkup(<HealthyLunchMenu product={plan} products={[]} currency="MYR" weeks={['2026-10-19']} dayDates={[]} choice={{mode:'week',date:'2026-10-19'}} onChange={() => {}} />);
  assert.equal((html.match(/View Ingredients/g)||[]).length,5);
  assert.equal((html.match(/Original ingredients/g)||[]).length,5);
  assert.match(html, /<details[^>]*open=""[^>]*>[\s\S]*?Options &amp; exchanges/);
  assert.match(html,/Onsen Egg/);assert.match(html,/Complete required choices for each meal/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>Add 5-Day Plan/);
});

test('shared day opens only its selected meal and unavailable shared weeks never silently choose another week', () => {
  const props = {product, products, currency:'MYR' as const, weeks:['2026-10-19','2026-10-26'], dayDates:['2026-10-20','2026-10-21'], onChange:()=>{}, sharedSelection:true};
  const day = renderToStaticMarkup(<HealthyLunchMenu {...props} choice={{mode:'day',date:'2026-10-21'}} />);
  assert.equal((day.match(/<li /g)||[]).length,1);
  assert.match(day,/wed lunch/);
  assert.doesNotMatch(day,/tue lunch/);
  const week = renderToStaticMarkup(<HealthyLunchMenu {...props} choice={{mode:'week',date:''}} />);
  assert.match(week,/This shared menu is not currently available/);
  assert.match(week,/disabled=""[^>]*>Add 5-Day Plan/);
  assert.equal((week.match(/<li /g)||[]).length,0);
});

test('a closed shared week stays visible with Add disabled', () => {
  const html=renderToStaticMarkup(<HealthyLunchMenu product={product} products={products} currency="MYR" choice={{mode:'week',date:'2026-10-19'}} weeks={['2026-10-19']} dayDates={[]} sharedSelection sharedUnavailable canOrder={false} onChange={()=>{}} />);
  assert.match(html,/This shared menu is not currently available/);
  assert.equal((html.match(/<li /g)||[]).length,5);
  assert.match(html,/disabled=""[^>]*>Add 5-Day Plan/);
});
