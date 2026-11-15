import test from 'node:test';
import assert from 'node:assert/strict';
import { readWeeklyShare, weeklyShareUrl, weeklyShareChoice, weeklySharePhoto, weeklySharePreviewDate } from './weeklyMenuSharing.js';
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

test('closed selections retain the exact slot/day for a view-only menu', () => {
 assert.equal(weeklySharePreviewDate(product,readWeeklyShare(product,'?week=week3')),'2026-10-26');
 assert.equal(weeklySharePreviewDate(product,readWeeklyShare(product,'?week=week3&day=fri')),'2026-10-30');
});

// Exercise every requested share independently with distinct photos and menus.
const allDays = ['mon', 'tue', 'wed', 'thu', 'fri'];
const completeProduct = {
  ...product,
  rotationWeeks: Object.fromEntries(['week1', 'week2', 'week3'].map(slot => [slot, {
    coverPhotoUrl: `https://cdn.example/${slot}-cover.jpg`,
    meals: Object.fromEntries(allDays.map(day => [day, { name: `${slot} ${day}`, price: 12, photoUrl: `https://cdn.example/${slot}-${day}.jpg` }]))
  }]))
};
for (const [index, slot] of ['week1', 'week2', 'week3'].entries()) {
  for (const day of [null, ...allDays]) {
    test(`${slot} ${day || 'Full Set'} opens the exact ordering selection and original preview`, async () => {
      const { buildProductSocialMetadata } = await import('./storeSocialPreview.js');
      const base = 'https://misechef-beta-fa4bf.web.app/store/chef/product/existing-menu';
      const before = structuredClone(completeProduct);
      const url = weeklyShareUrl(base, slot, day);
      const share = readWeeklyShare(completeProduct, new URL(url).search);
      const monday = new Date(Date.parse('2026-10-19T00:00:00Z') + index * 604800000).toISOString().slice(0, 10);
      const dates = Array.from({length: 5}, (_, i) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
      assert.deepEqual(weeklyShareChoice(completeProduct, share, [monday], dates), {mode: day ? 'day' : 'week', date: day ? dates[allDays.indexOf(day)] : monday});
      const metadata = buildProductSocialMetadata({store: {slug: 'chef', name: 'Chef'}, product: {...completeProduct, productSlug: 'existing-menu'}, origin: new URL(base).origin, search: new URL(url).search});
      assert.equal(metadata.canonicalUrl, url);
      assert.equal(metadata.image, `https://cdn.example/${slot}-${day || 'cover'}.jpg`);
      assert.equal(new URL(url).pathname, new URL(base).pathname);
      assert.deepEqual(completeProduct, before);
    });
  }
}
