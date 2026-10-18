import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');

test('Recipe editor calculates nutrition automatically without a manual calorie field', () => {
  assert.match(source, /Nutrition \(automatic\)/);
  assert.match(source, /useRecipeNutrition\(nutritionDraft, recipes, workspaceId \|\| userId\)/);
  const hook = readFileSync(new URL('../modules/nutrition/hooks/useRecipeNutrition.ts', import.meta.url), 'utf8');
  assert.match(hook, /calculateRecipeNutrition\(recipe, state.profiles, recipes\)/);
  assert.match(hook, /subscribeWorkspaceNutritionProfiles/);
  assert.doesNotMatch(source, /calories: savedCalories/);
});
