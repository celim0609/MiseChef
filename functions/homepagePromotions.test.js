import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPublicHomepagePromotions, toPublicHomepagePromotion } from './homepagePromotions.js';

test('homepage promotion projection exposes only presentation fields for active safe entries', () => {
  assert.deepEqual(toPublicHomepagePromotion('promo-1', {
    eyebrow: 'Featured',
    title: 'Seasonal menu',
    description: 'A short story.',
    ctaLabel: 'Explore',
    href: '/recipes',
    imageUrl: 'https://images.example.com/menu.jpg',
    active: true,
    sortOrder: 2,
    createdBy: 'private-user-id'
  }), {
    id: 'promo-1',
    eyebrow: 'Featured',
    title: 'Seasonal menu',
    description: 'A short story.',
    ctaLabel: 'Explore',
    href: '/recipes',
    imageUrl: 'https://images.example.com/menu.jpg',
    active: true,
    sortOrder: 2
  });
});

test('homepage promotion projection rejects inactive and unsafe destinations', () => {
  assert.equal(toPublicHomepagePromotion('inactive', { title: 'Hidden', href: '/recipes', active: false }), null);
  assert.equal(toPublicHomepagePromotion('unsafe', { title: 'Unsafe', href: 'javascript:alert(1)', active: true }), null);
});

test('public homepage promotions are sorted and capped', async () => {
  const result = await loadPublicHomepagePromotions({
    loadPromotions: async () => Array.from({ length: 24 }, (_, index) => ({
      id: `promo-${index}`,
      title: `Promotion ${index}`,
      href: '/recipes',
      active: true,
      sortOrder: 23 - index
    }))
  });
  assert.equal(result.length, 20);
  assert.equal(result[0].sortOrder, 0);
  assert.equal(result.at(-1).sortOrder, 19);
});
