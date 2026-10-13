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
  assert.match(day, /12\.00/); assert.match(day, /wed vegetables/); assert.match(day, /h-40 w-full/);
  assert.match(day, /src="https:\/\/example.test\/wed.jpg"/); assert.equal((day.match(/<li /g) || []).length, 2);
});
