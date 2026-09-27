import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storePage = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const storeService = readFileSync(new URL('./services/storeService.ts', import.meta.url), 'utf8');

test('Store Product editor supports optional independent calories', () => {
  assert.match(storePage, /Calories per serving \(kcal\)/);
  assert.match(storePage, /updateProduct\('calories', event\.target\.value === '' \? undefined : Number\(event\.target\.value\)\)/);
  assert.match(storeService, /draft\.calories === undefined[\s\S]*calories: deleteField\(\)/);
});

test('public Store displays calories only when a Product has them', () => {
  assert.match(publicStorePage, /requestedProduct\.calories !== undefined[\s\S]*requestedProduct\.calories\} kcal/);
  assert.match(publicStorePage, /product\.calories !== undefined[\s\S]*product\.calories\} kcal/);
});
