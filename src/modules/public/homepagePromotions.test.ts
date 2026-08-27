import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HOMEPAGE_PROMOTIONS,
  mapHomepagePromotion,
  normalizeHomepagePromotionHref,
  sortActiveHomepagePromotions
} from './homepagePromotions';

test('homepage promotion links accept internal paths and HTTPS only', () => {
  assert.equal(normalizeHomepagePromotionHref('/recipes'), '/recipes');
  assert.equal(normalizeHomepagePromotionHref('https://misechef.example/campaign'), 'https://misechef.example/campaign');
  assert.equal(normalizeHomepagePromotionHref('//unsafe.example'), '');
  assert.equal(normalizeHomepagePromotionHref('javascript:alert(1)'), '');
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
