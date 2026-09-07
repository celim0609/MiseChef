import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PublicAboutPage.tsx', import.meta.url), 'utf8');

test('Founder Story follows the approved narrative without unsupported claims', () => {
  for (const copy of [
    'I didn’t start MiseChef because I wanted to build software.',
    'This is where it started.',
    'Built from real kitchen problems.',
    'Why don’t chefs have professional tools built around the way we actually work?',
    'From problem to product.',
    'Why MiseChef',
    'More than a recipe app.',
    'Still built from the kitchen.',
    'Now I’m building that better way.'
  ]) assert.ok(source.includes(copy), `Missing Founder Story copy: ${copy}`);

  assert.doesNotMatch(source, /GG Grab.?Go|Stripe|Touch 'n Go|HitPay|commission|licensed|regulated|certified/i);
});

test('Founder Story uses only the selected authentic photographs with accessible image behavior', () => {
  for (const image of ['ce-lim-chef.jpg', 'recipe-notebook.jpg', 'kitchen-work-01.jpg', 'kitchen-work-02.jpg']) {
    assert.match(source, new RegExp(image.replace('.', '\\.')));
    assert.equal(existsSync(new URL(`../../../public/images/about/${image}`, import.meta.url)), true);
  }
  assert.doesNotMatch(source, /kitchen-team\.jpg/);
  assert.match(source, /fetchPriority="high"/);
  assert.match(source, /loading="lazy"/);
  assert.doesNotMatch(source, /alt=""/);
});

test('problem-to-product view reflects current Recipe and Costing UI vocabulary', () => {
  for (const label of ['Yield', 'Servings', 'Ingredients', 'Ingredient', 'Quantity', 'Unit', 'Cost Analysis', 'Total Cost', 'Per Portion', 'Selling Price', 'Food Cost']) {
    assert.ok(source.includes(label), `Missing current product UI label: ${label}`);
  }
  assert.match(source, /Business Registration No\.:<\/dt> <dd className="inline">202603223516 \(003882452-K\)/);
});
