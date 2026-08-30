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
  assert.match(app, /currentUser && BUSINESS_WORKSPACE_TABS\.has\(activeTab\)/);
  assert.match(app, /businessEntitlement === null/);
  assert.match(app, /!hasBusinessEntitlement \|\| !canAccessRootTab/);
});

test('Guest, Personal, and Business identity boundaries fail closed', () => {
  const app = read('../App.tsx');
  const provisioning = read('../../functions/newUserProvisioning.js');
  const subscriptionFoundation = read('../../functions/subscriptionFoundation.js');
  const trial = read('../../functions/businessTrial.js');
  const pricing = read('../modules/subscription/PricingExperience.tsx');
  assert.doesNotMatch(app, /setIsGuestMode\(true\)/);
  assert.match(app, /const isProtectedShellVisible = Boolean\(currentUser\)/);
  assert.match(app, /if \(!currentUser && tab !== 'login'\)[\s\S]*window\.history\.replaceState\(null, '', '\/login'\)/);
  assert.match(app, /handleContinueAsGuest[\s\S]*signOut\(auth\)[\s\S]*setBusinessEntitlement\(null\)[\s\S]*setChefProfile\(DEFAULT_CHEF_PROFILE\)[\s\S]*window\.location\.replace\('\/'\)/);
  assert.doesNotMatch(provisioning, /collection\('workspaces'\)|collection\('workspaceMembers'\)|allowTrialProvisioning/);
  assert.doesNotMatch(subscriptionFoundation, /allowTrialProvisioning|isProvisionedTrial/);
  assert.match(trial, /startBusinessTrial/);
  assert.match(trial, /subscriptionPlan: 'professional'/);
  assert.match(trial, /subscriptionStatus: 'trialing'/);
  assert.match(pricing, /RM0 forever/);
  assert.match(pricing, /RM39\/month/);
  assert.match(pricing, /RM79\/month/);
  assert.match(pricing, /RM149\/month/);
  assert.doesNotMatch(pricing, /1 Workspace|Up to 20 Products|Up to 50 Orders/);
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
