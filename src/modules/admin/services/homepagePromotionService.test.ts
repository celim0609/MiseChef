import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHomepagePromotionImageFile } from './homepagePromotionImage';

test('promotion upload validation accepts supported images', () => {
  assert.doesNotThrow(() => validateHomepagePromotionImageFile({ type: 'image/jpeg', size: 1_000_000 }));
  assert.doesNotThrow(() => validateHomepagePromotionImageFile({ type: 'image/png', size: 2_000_000 }));
  assert.doesNotThrow(() => validateHomepagePromotionImageFile({ type: 'image/webp', size: 3_000_000 }));
});

test('promotion upload validation rejects unsupported or oversized files', () => {
  assert.throws(() => validateHomepagePromotionImageFile({ type: 'image/svg+xml', size: 100 }), /JPG, PNG, or WEBP/);
  assert.throws(() => validateHomepagePromotionImageFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 }), /10 MB or smaller/);
});
