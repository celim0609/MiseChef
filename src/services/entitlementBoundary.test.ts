import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the authenticated app classifies every Workspace business route centrally', () => {
  const app = read('../App.tsx');
  const businessTabs = [
    'statistics', 'team', 'store', 'storePos', 'business', 'businessSales',
    'businessSuppliers', 'personalExpenses', 'costing', 'costingIngredients',
    'costingInvoices', 'costingInvoiceDetail', 'costingReports'
  ];
  const classification = app.slice(app.indexOf('const BUSINESS_WORKSPACE_TABS'), app.indexOf('const ROOT_TAB_PATHS'));
  businessTabs.forEach(tab => assert.match(classification, new RegExp(`'${tab}'`)));
  assert.doesNotMatch(classification, /'search'|'favorites'|'portfolio'|'profile'|'billing'/);
  assert.match(app, /BUSINESS_WORKSPACE_TABS\.has\(tab\) && !hasBusinessEntitlement/);
  assert.match(app, /BUSINESS_WORKSPACE_TABS\.has\(activeTab\) && !hasBusinessEntitlement/);
});

test('navigation hiding and dashboard loading use the same fail-closed entitlement', () => {
  const navigation = read('../components/NavigationDrawer.tsx');
  const home = read('../components/HomeTab.tsx');
  const personalHome = read('../components/home/PersonalHome.tsx');
  assert.match(navigation, /businessTabs\.has\(tab\) && !hasBusinessEntitlement/);
  assert.match(home, /if \(!businessEnabled \|\| !userId \|\| !activeWorkspaceId\)/);
  assert.match(home, /if \(!businessEnabled\)[\s\S]*<PersonalHome/);
  assert.match(personalHome, /Add Recipe/);
  assert.match(personalHome, /My Recipes/);
  assert.match(personalHome, /My Orders/);
  assert.match(personalHome, /Host \/ Stores/);
  assert.doesNotMatch(personalHome, /TodaysTasks|Restaurant Command Center|Costing|Invoice|Finance|Team|Reports|Sales/);
});

test('server and rules enforce Business entitlement while customer paths stay public', () => {
  const fulfilment = read('../../functions/storeFulfilment.js');
  const manualPayments = read('../../functions/storeManualPayments.js');
  const firestore = read('../../firestore.rules');
  const storage = read('../../storage.rules');
  assert.equal((fulfilment.match(/hasActiveBusinessEntitlement\(workspace\)/g) || []).length, 2);
  assert.match(manualPayments, /hasActiveBusinessEntitlement\(workspace\.data\(\) \|\| \{\}\)/);
  assert.match(firestore, /subscriptionPlan in \['starter', 'professional', 'business', 'internal_unlimited'\]/);
  assert.match(storage, /subscriptionPlan in \['starter', 'professional', 'business', 'internal_unlimited'\]/);
  assert.match(firestore, /match \/stores\/\{workspaceId\}[\s\S]*allow read: if true/);
  assert.match(firestore, /match \/storeOrders\/\{orderId\}[\s\S]*allow create: if false/);
  assert.match(firestore, /match \/groupOrders\/\{groupId\}[\s\S]*resource\.data\.hostId == request\.auth\.uid/);
});
