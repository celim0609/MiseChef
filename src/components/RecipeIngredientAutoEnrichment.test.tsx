import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');

test('imported rows are marked for automatic enrichment while manual name blur remains enabled', () => {
  const importStart = source.indexOf('const importRecipeToEditor =');
  const importEnd = source.indexOf('const handlePdfFileChange =', importStart);
  const importRecipeToEditor = source.slice(importStart, importEnd);

  assert.match(importRecipeToEditor, /markUnlinkedRecipeIngredientRowsForAutoEnrichment\(normalizedImportedIngredients, pendingAutoEnrichmentRowIdsRef\.current\)/);
  assert.match(source, /getPendingRecipeIngredientEnrichmentTargets\([\s\S]*void enrichRecipeIngredient\(ingredient\)/);
  assert.match(source, /onBlur=\{\(\) => void enrichRecipeIngredient\(ing\)\}/);
});
