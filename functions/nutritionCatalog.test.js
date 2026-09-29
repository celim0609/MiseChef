import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

test('USDA nutrition import is server-side, secret-backed, and writes only internal catalog/profile documents', () => {
  assert.match(source, /defineSecret\('USDA_FDC_API_KEY'\)/);
  assert.match(source, /export const searchUsdaNutritionCatalog = onCall/);
  assert.match(source, /export const confirmUsdaIngredientNutrition = onCall/);
  assert.match(source, /if \(!query\) throw new HttpsError\('invalid-argument', 'USDA search terms are required\.'/);
  assert.match(source, /if \(!ingredient\.exists \|\| ingredient\.data\(\)\?\.workspaceId !== workspaceId\)/);
  assert.match(source, /const gramsPerPiece = request\.data\?\.gramsPerPiece/);
  assert.match(source, /Weight per piece must be greater than zero/);
  assert.match(source, /collection\('nutritionCatalog'\)/);
  assert.match(source, /collection\('ingredientNutritionProfiles'\)/);
  assert.match(source, /requireNutritionManager/);
});
