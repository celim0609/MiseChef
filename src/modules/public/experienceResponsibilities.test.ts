import test from 'node:test';
import assert from 'node:assert/strict';
import { toExperienceResponsibilities } from './experienceResponsibilities';

test('renders each ordered responsibility as a separate bullet', () => {
  assert.deepEqual(toExperienceResponsibilities(
    'Prepared cold kitchen products. Supported production planning. Maintained food safety.'
  ), [
    'Prepared cold kitchen products.',
    'Supported production planning.',
    'Maintained food safety.'
  ]);
});

test('joins wrapped lines belonging to an explicit multi-line bullet', () => {
  assert.deepEqual(toExperienceResponsibilities(`
    • Prepared and maintained high-quality cold kitchen products
      for daily service.

    • Supported production planning and kitchen workflow coordination.
  `), [
    'Prepared and maintained high-quality cold kitchen products for daily service.',
    'Supported production planning and kitchen workflow coordination.'
  ]);
});

test('separates punctuation-free responsibility lines and keeps lowercase wraps attached', () => {
  assert.deepEqual(toExperienceResponsibilities(`
    Prepared and maintained high-quality cold kitchen products
    for daily service
    Supported production planning and kitchen workflow coordination
    Maintained food safety, hygiene and quality standards
  `), [
    'Prepared and maintained high-quality cold kitchen products for daily service',
    'Supported production planning and kitchen workflow coordination',
    'Maintained food safety, hygiene and quality standards'
  ]);
});

test('ignores blanks, trims whitespace, removes duplicate bullets, and preserves punctuation', () => {
  assert.deepEqual(toExperienceResponsibilities(`
    -  Maintained food safety, hygiene and quality standards.

    - Maintained food safety, hygiene and quality standards.
    3. Assisted with inventory management — and ingredient preparation!
  `), [
    'Maintained food safety, hygiene and quality standards.',
    'Assisted with inventory management — and ingredient preparation!'
  ]);
});
