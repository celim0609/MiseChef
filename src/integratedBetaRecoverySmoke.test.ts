import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('workspace entitlement, Business navigation, and active MYR costing remain integrated', () => {
  assert.match(read('./services/subscriptionPlans.ts'), /internal_unlimited/);
  assert.match(read('../firestore.rules'), /\['professional', 'business', 'internal_unlimited'\]/);
  assert.match(read('./components/NavigationDrawer.tsx'), /<span className="flex-1">Business<\/span>/);
  assert.match(read('./App.tsx'), /<WorkspaceRegionProvider workspace=\{currentWorkspace\}>/);
  assert.match(read('./components/RecipeCostAnalysis.tsx'), /useWorkspaceRegion/);
  assert.match(read('./components/RecipeCostAnalysis.tsx'), /formatRegionCurrency/);
  assert.match(read('./modules/costing/pages/Ingredients/index.tsx'), /value=\{region\.currency\} readOnly/);
  assert.match(read('./modules/costing/services/recipeIngredientLibrary.ts'), /workspaceId/);
});

test('Recipe, Finance, Invoice, and Resume recovery paths remain integrated', () => {
  assert.match(read('./App.tsx'), /<GlobalQuickAdd actions=\{availableQuickAddActions\} onSelect=\{handleQuickAdd\}/);
  assert.match(read('./navigation/quickAdd.ts'), /id: 'recipe', label: 'Add Recipe'/);
  assert.match(read('./components/SearchTab.tsx'), /formatRecipeCreatorLine\(recipe, workspaceMembers\)/);
  assert.match(read('./components/RecipeShareDialog.tsx'), /Download QR/);
  assert.match(read('./navigation/financeNavigation.ts'), /\/app\/finance\/personal-expenses/);
  assert.match(read('./modules/costing/pages/Invoices/index.tsx'), /Invoice OCR completed\./);
  assert.match(read('./modules/costing/services/invoiceImportReview.ts'), /ingredient/);
  assert.match(read('./modules/chef-profile/ChefProfilePage.tsx'), /Accept Imported/);
  assert.match(read('./services/resumeImportJobs.ts'), /subscribeToResumeImportJob/);
  assert.match(read('../functions/index.js'), /processResumeImportJob/);
  assert.match(read('../firestore.rules'), /match \/resumeImportJobs\/\{jobId\}/);
});

test('Store, POS, payments, Host Groups, appearance, and hardened Hosting remain integrated', () => {
  assert.match(read('./modules/store/StorePage.tsx'), /StoreSetsPanel/);
  assert.match(read('./modules/store/StoreOrdersPanel.tsx'), /setSnapshot/);
  assert.match(read('./modules/store/StorePosPage.tsx'), /data-pos-theme/);
  assert.match(read('./modules/store/paymentProviders/manualClientAdapter.tsx'), /manual_payment/);
  assert.match(read('../functions/storePaymentsCore.js'), /buildSetOrderItem/);
  assert.match(read('./modules/store/PublicGroupOrderPage.tsx'), /PublicGroupOrderPage/);
  assert.match(read('./components/SettingsTab.tsx'), /applyAppearanceMode/);

  const firebase = JSON.parse(read('../firebase.json'));
  assert.deepEqual(firebase.hosting.headers.map((entry: { source: string }) => entry.source), ['/app', '/app/**']);
  assert.equal(firebase.hosting.rewrites[0].source, '/store/**');
  assert.equal(firebase.hosting.rewrites[0].function.functionId, 'renderPublicStore');
  assert.equal(firebase.firestore.indexes, 'firestore.indexes.json');
  assert.ok(Array.isArray(firebase.storage));
  assert.match(read('../scripts/generateBetaBuildManifest.mjs'), /misechef-beta-release/);
});
