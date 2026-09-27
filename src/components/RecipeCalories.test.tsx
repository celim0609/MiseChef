import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');

test('Recipe editor keeps manual calories optional and validates whole non-negative values', () => {
  assert.match(source, /Calories per serving \(kcal\)/);
  assert.match(source, /type="number"[\s\S]*min="0"[\s\S]*step="1"/);
  assert.match(source, /Calories must be a non-negative whole number\./);
  assert.match(source, /calories: savedCalories/);
});
