import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import HealthyLunchMenu from './HealthyLunchMenu';
import type { StoreProduct } from './types';
import { WEEKLY_DAYS } from '../../../functions/storeWeeklyMealPlan.js';

const products = WEEKLY_DAYS.map(day => ({ id: day, name: `${day} lunch`, price: 12, photoUrl: '' })) as StoreProduct[];
const product = { id: 'healthy', name: 'Healthy Lunch', productType: 'weekly_meal_plan', weeklyWeeks: {
  week1: { startMonday: '2026-10-19', meals: Object.fromEntries(WEEKLY_DAYS.map(day => [day, day])) },
  week2: { startMonday: '2026-10-26', meals: { mon: 'fri', tue: 'thu', wed: 'wed', thu: 'tue', fri: 'mon' } }
} } as StoreProduct;
const render = (mode: 'week' | 'day', date: string, weeks = ['2026-10-19','2026-10-26'], dayDates = ['2026-10-20','2026-10-21']) => renderToStaticMarkup(<HealthyLunchMenu product={product} products={products} currency="MYR" choice={{ mode, date }} weeks={weeks} dayDates={dayDates} onChange={() => {}} />);

test('customer sees two choices, date ranges and only the selected week menu without numbered weeks', () => {
  const html = render('week', '2026-10-26');
  assert.match(html, />5-Day Plan<|>5-Day Plan</);
  assert.match(html, />Order by Day</);
  assert.match(html, /19–23 Oct/);
  assert.match(html, /26–30 Oct/);
  assert.match(html, /Mon,? 26 Oct: fri lunch/);
  assert.match(html, /Fri,? 30 Oct: mon lunch/);
  assert.doesNotMatch(html, /Week [1-4]|Mon,? 19 Oct:/);
  assert.equal((html.match(/<li /g) || []).length, 5);
});

test('Order by Day shows only valid real dates and the selected meal with its standalone price', () => {
  const html = render('day', '2026-10-21', [], ['2026-10-20','2026-10-21']);
  assert.match(html, /Tue,? 20 Oct/);
  assert.match(html, /Wed,? 21 Oct: wed lunch/);
  assert.match(html, /12\.00/);
  assert.doesNotMatch(html, /value="2026-10-19"|mon lunch|fri lunch|Week [1-4]/);
  assert.equal((html.match(/<li /g) || []).length, 1);
});

test('closed full weeks offer no full-week dates while future single days still render', () => {
  assert.match(render('week', '', [], ['2026-10-21']), /No available dates/);
  assert.match(render('day', '2026-10-21', [], ['2026-10-21']), /Wed,? 21 Oct: wed lunch/);
});
