import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Recipe detail keeps Ready to Sell behind the authorized callback in its overflow menu', () => {
  const detailSource = readFileSync(new URL('./RecipeDetailModal.tsx', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

  assert.match(detailSource, /onReadyToSell\?: \(recipe: Recipe\) => void/);
  assert.match(detailSource, /\{onReadyToSell && \([\s\S]*Ready to Sell/);
  assert.match(detailSource, /onReadyToSell\(recipe\)/);
  assert.match(appSource, /hasBusinessEntitlement && getStorePermissions\(currentWorkspaceRole\)\.manageProducts/);
  assert.match(appSource, /setReadyToSellRecipe\(recipe\);[\s\S]*handleRootNavigate\('store'\)/);
});
