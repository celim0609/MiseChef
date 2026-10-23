import test from 'node:test';
import assert from 'node:assert/strict';
import { readWeeklyShare, weeklyShareUrl, weeklyShareChoice, weeklySharePhoto } from './weeklyMenuSharing.js';
import { validateWeeklyStructure } from './storeWeeklyMealPlan.js';
const meals = Object.fromEntries(['mon','tue','wed','thu','fri'].map(day => [day, { name: day, price: 12, photoUrl: `https://cdn.example/original-${day}.jpg` }]));
const product = { productType: 'weekly_meal_plan', weeklyMenuVersion: 3, rotationStartMonday: '2026-10-19', rotationWeeks: { week1: { meals, coverPhotoUrl: 'https://cdn.example/original-cover.jpg', discount: {type:'percentage',value:10} }, week3: { meals, discount: {type:'none',value:0} } }, photoUrl:'https://cdn.example/legacy-cover.jpg' };
test('links keep the original product path and valid slot/day; reject malformed selections', () => {
 const base='https://example.com/store/chef/product/weekly-menu';
 assert.equal(weeklyShareUrl(base,'week3','fri'), `${base}?week=week3&day=fri`);
 assert.equal(readWeeklyShare(product,'?week=week3&day=fri').mode,'day');
 for (const query of ['?week=week2','?week=week1&day=sat','?week=__proto__','?week=week1&day=']) assert.equal(readWeeklyShare(product,query),null);
 assert.equal(readWeeklyShare({...product,productType:'single'},'?week=week1'),null);
});
test('resolve sparse repeating slots against available dates without substituting another menu', () => {
 const weeks=['2026-10-26','2026-11-02','2026-11-09'];
 assert.deepEqual(weeklyShareChoice(product,readWeeklyShare(product,'?week=week1'),weeks,[]),{mode:'week',date:'2026-11-02'});
 assert.deepEqual(weeklyShareChoice(product,readWeeklyShare(product,'?week=week3&day=fri'),[],['2026-10-23','2026-10-30']),{mode:'day',date:'2026-10-30'});
 assert.deepEqual(weeklyShareChoice(product,readWeeklyShare(product,'?week=week3&day=fri'),[],['2026-10-23']),{mode:'day',date:''});
});
test('cover and daily photos use original URLs and round-trip without affecting commerce values', () => {
 const before=structuredClone(product);
 assert.equal(weeklySharePhoto(product,readWeeklyShare(product,'?week=week1')),product.rotationWeeks.week1.coverPhotoUrl);
 assert.equal(weeklySharePhoto(product,readWeeklyShare(product,'?week=week1&day=tue')),meals.tue.photoUrl);
 assert.equal(validateWeeklyStructure(product),'');
 assert.deepEqual(product,before);
 assert.match(validateWeeklyStructure({...product,rotationWeeks:{week1:{...product.rotationWeeks.week1,coverPhotoUrl:'javascript:bad'}}}),/cover photo/);
});
