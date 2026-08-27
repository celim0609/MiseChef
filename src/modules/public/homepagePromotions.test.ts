import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HOMEPAGE_PROMOTIONS,
  createLoopingHomepagePromotionItems,
  mapHomepagePromotion,
  normalizeHomepagePromotionHref,
  sortActiveHomepagePromotions
} from './homepagePromotions';

test('homepage promotion links accept internal paths and HTTPS only', () => {
  assert.equal(normalizeHomepagePromotionHref('/recipes', 'internal'), '/recipes');
  assert.equal(normalizeHomepagePromotionHref('https://misechef.example/campaign', 'external'), 'https://misechef.example/campaign');
  assert.equal(normalizeHomepagePromotionHref('https://instagram.com/misechef', 'social'), 'https://instagram.com/misechef');
  assert.equal(normalizeHomepagePromotionHref('https://unsafe.example', 'internal'), '');
  assert.equal(normalizeHomepagePromotionHref('javascript:alert(1)', 'external'), '');
});

test('homepage promotions expose active campaigns in owner-defined order', () => {
  const promotions = [
    mapHomepagePromotion('inactive', { title: 'Hidden', href: '/recipes', active: false, sortOrder: 0 }),
    mapHomepagePromotion('second', { title: 'Second', href: '/recipes', active: true, sortOrder: 2 }),
    mapHomepagePromotion('first', { title: 'First', href: '/recipes', active: true, sortOrder: 1 })
  ];
  assert.deepEqual(sortActiveHomepagePromotions(promotions).map(item => item.id), ['first', 'second']);
  assert.deepEqual(DEFAULT_HOMEPAGE_PROMOTIONS.map(item => item.eyebrow), ['MiseChef Go', 'Sets & Combos', 'Featured Store', 'Share & Earn']);
});

test('legacy links remain compatible and four cards receive a seamless loop track', () => {
  assert.equal(mapHomepagePromotion('legacy', { title: 'Legacy', href: 'https://misechef.example', active: true }).linkType, 'external');
  const items = createLoopingHomepagePromotionItems(DEFAULT_HOMEPAGE_PROMOTIONS);
  assert.equal(items.length, 8);
  assert.deepEqual(items.slice(0, 4).map(item => item.promotion.id), DEFAULT_HOMEPAGE_PROMOTIONS.map(item => item.id));
  assert.ok(items.slice(4).every(item => item.isClone));
});
