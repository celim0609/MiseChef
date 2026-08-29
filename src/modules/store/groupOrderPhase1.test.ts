import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getValidatedHostReturnTo,
  getValidatedPublicAccountReturnTo,
  replaceWithValidatedHostReturnTo,
  replaceWithValidatedPublicAccountReturnTo,
  resolveLoggedOutPublicAccountLink,
  resolvePublicHostMenuAction,
  resolvePublicHostStoreCandidate
} from '../public/hostReturnNavigation';
import { resolvePublicRoute } from '../public/publicRoutes';
import { createDefaultWorkspaceStore, normalizeWorkspaceStore, validateStoreSettings } from './storeModel';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const hostPage = readFileSync(new URL('./HostProgramPage.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../../components/LoginTab.tsx', import.meta.url), 'utf8');
const publicLayout = readFileSync(new URL('../public/PublicLayout.tsx', import.meta.url), 'utf8');
const paymentService = readFileSync(new URL('./services/paymentService.ts', import.meta.url), 'utf8');
const groupService = readFileSync(new URL('./services/groupOrderService.ts', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../../functions/groupOrders.js', import.meta.url), 'utf8');
const storePayments = readFileSync(new URL('../../../functions/storePayments.js', import.meta.url), 'utf8');

test('Host and Group links are isolated public routes outside the authenticated app shell', () => {
  assert.deepEqual(resolvePublicRoute('/host/ce-lim-kitchen'), { page: 'host', slug: 'ce-lim-kitchen' });
  assert.deepEqual(resolvePublicRoute('/group/opaque-code'), { page: 'group', shareCode: 'opaque-code' });
});

test('legacy and normal Stores default to Host Program off', () => {
  const created = createDefaultWorkspaceStore({ id: 'workspace-1', name: 'Store', country: 'MY' }, 'owner-1');
  const legacy = normalizeWorkspaceStore('workspace-legacy', { name: 'Legacy', country: 'MY' });
  assert.deepEqual(created.hostProgram, { enabled: false, rewardPercent: 5, minimumQualifyingSales: 0 });
  assert.deepEqual(legacy.hostProgram, { enabled: false, rewardPercent: 0, minimumQualifyingSales: 0 });
});

test('Store-level reward configuration is bounded', () => {
  const store = createDefaultWorkspaceStore({ id: 'workspace-1', name: 'Store', country: 'MY' }, 'owner-1');
  const settings = { ...store, hostProgram: { enabled: true, rewardPercent: 5, minimumQualifyingSales: 20 } };
  assert.equal(validateStoreSettings(settings), '');
  assert.equal(validateStoreSettings({ ...settings, hostProgram: { ...settings.hostProgram, rewardPercent: 101 } }), 'Host Reward must be between 0% and 100%.');
});

test('the Host CTA is conditional and Group checkout reuses PublicStorePage', () => {
  assert.match(publicStorePage, /!groupOrder && store\.hostProgram\.enabled/);
  assert.match(publicStorePage, /Bring your group\. Get rewarded\./);
  assert.match(publicStorePage, /store\.hostProgram\.rewardPercent\.toLocaleString/);
  assert.match(publicStorePage, /formatRegionCurrency\(store\.hostProgram\.minimumQualifyingSales, store\.currency\)/);
  assert.match(publicStorePage, /Guests order and pay individually\./);
  assert.match(publicStorePage, /Host does not collect their money/);
  assert.match(publicStorePage, /Phase 1 tracks estimated Host Rewards only/);
  assert.doesNotMatch(publicStorePage, /Earn 5% on qualifying group orders/);
  assert.match(publicStorePage, /groupShareCode: groupOrder\.shareCode/);
  assert.match(publicStorePage, /disabled=\{Boolean\(groupOrder\)\}/);
  assert.match(publicStorePage, /Start a Group Order/);
  assert.match(publicStorePage, /\/login\?returnTo=/);
  assert.match(paymentService, /createPublicStorePayment/);
});

test('Host auth is passed explicitly, returnTo is preserved, and the header reflects the account', () => {
  assert.match(groupService, /activateMiseChefHost/);
  assert.match(hostPage, /existing MiseChef account/);
  assert.match(appSource, /<PublicLayout pathname=\{window\.location\.pathname\} currentUser=\{currentUser\} onSignOut=\{handleSignOut\}/);
  assert.match(publicLayout, /<HostProgramPage slug=\{route\.slug\} currentUser=\{currentUser\}/);
  assert.match(hostPage, /currentUser: User \| null/);
  assert.match(hostPage, /if \(!currentUser\)/);
  assert.match(publicLayout, /groupOrderService\.listMine\(hostStoreCandidate\)/);
  assert.match(publicLayout, /result\.hostActive/);
  assert.match(appSource, /window\.location\.pathname !== '\/login'/);
  assert.match(appSource, /replaceWithValidatedHostReturnTo/);
  assert.match(appSource, /pathname === '\/login'/);
  assert.match(appSource, /window\.location\.replace\(hostReturnTo\)/);
  assert.doesNotMatch(appSource, /window\.location\.assign\(hostReturnTo\)/);
  assert.match(hostPage, /navigator\.share/);
  assert.match(hostPage, /navigator\.clipboard\.writeText/);
  assert.match(hostPage, /Login \/ Become a Host/);
});

test('activated Host action remains available across public Home, Recipes and Chefs', () => {
  const storeSlug = 'misechef-s-grab-go-store';
  for (const pathname of ['/', '/recipes', '/chefs']) {
    const route = resolvePublicRoute(pathname);
    assert.ok(route);
    const candidate = resolvePublicHostStoreCandidate('', '', [storeSlug]);
    assert.equal(candidate, storeSlug);
    assert.deepEqual(resolvePublicHostMenuAction({ status: 'host', storeSlug, userId: 'host-1' }, candidate, 'host-1'), {
      label: 'Host Center',
      href: '/host/misechef-s-grab-go-store',
      description: 'Groups & rewards'
    });
  }
});

test('Store and Group context select a candidate but require trusted Host validation', () => {
  assert.equal(resolvePublicHostStoreCandidate('store-one', '', ['store-two']), 'store-one');
  assert.equal(resolvePublicHostStoreCandidate('', 'group-store', ['store-two']), 'group-store');
  assert.equal(resolvePublicHostStoreCandidate('', '', ['store-one', 'store-two']), '');
  assert.equal(resolvePublicHostMenuAction({ status: 'host', storeSlug: 'store-one', userId: 'host-1' }, 'store-two', 'host-1'), null);
  assert.match(publicLayout, /<PublicGroupOrderPage shareCode=\{route\.shareCode\} onStoreResolved=\{setGroupStoreSlug\}/);
});

test('non-Host and logged-out public account navigation remains unchanged', () => {
  assert.deepEqual(resolvePublicHostMenuAction({ status: 'non-host', storeSlug: 'misechef-s-grab-go-store', userId: 'user-1' }, 'misechef-s-grab-go-store', 'user-1'), {
    label: 'Become a Host',
    href: '/host/misechef-s-grab-go-store',
    description: 'Start group orders'
  });
  assert.deepEqual(resolveLoggedOutPublicAccountLink(), { label: 'Login', href: '/login' });
  assert.deepEqual(resolveLoggedOutPublicAccountLink('misechef-s-grab-go-store'), {
    label: 'Login',
    href: '/login?returnTo=%2Fhost%2Fmisechef-s-grab-go-store'
  });
  assert.match(publicLayout, /currentUser\s*\? <PublicAccountMenu hostAction=\{hostAction\} onSignOut=\{onSignOut\}/);
});

test('Host authentication return takes precedence and replaces Login history', () => {
  const history = ['/store/misechef-s-grab-go-store', '/login?returnTo=%2Fhost%2Fmisechef-s-grab-go-store'];
  let replacements = 0;
  let workspaceNavigations = 0;
  const handled = replaceWithValidatedHostReturnTo(
    '?returnTo=%2Fhost%2Fmisechef-s-grab-go-store',
    hostReturnTo => {
      replacements += 1;
      history[history.length - 1] = hostReturnTo;
    }
  );
  if (!handled) workspaceNavigations += 1;

  assert.equal(handled, true);
  assert.equal(replacements, 1);
  assert.equal(workspaceNavigations, 0);
  assert.deepEqual(history, ['/store/misechef-s-grab-go-store', '/host/misechef-s-grab-go-store']);
  assert.equal(history[history.length - 2], '/store/misechef-s-grab-go-store');
});

test('Host auth completion and guest continuation share replace-only public navigation', () => {
  const hostCompletionSource = appSource.slice(
    appSource.indexOf('const handleAuthenticated'),
    appSource.indexOf('const handleAvatarClick')
  );
  assert.equal((hostCompletionSource.match(/replaceWithValidatedPublicAccountReturnTo/g) || []).length, 1);
  assert.equal((hostCompletionSource.match(/replaceWithValidatedHostReturnTo/g) || []).length, 1);
  assert.equal((hostCompletionSource.match(/window\.location\.replace/g) || []).length, 2);
  assert.doesNotMatch(hostCompletionSource, /window\.location\.assign/);
  assert.match(hostCompletionSource, /const handleContinueAsGuest[\s\S]*replaceWithValidatedHostReturnTo[\s\S]*setCurrentUser\(null\)/);

  const loginRaceSource = appSource.slice(
    appSource.indexOf("if (currentUser && activeTab === 'login')"),
    appSource.indexOf("if (currentUser && activeTab === 'login')") + 400
  );
  assert.ok(loginRaceSource.indexOf('replaceWithValidatedPublicAccountReturnTo') < loginRaceSource.indexOf("handleRootNavigate('home')"));
});

test('Google popup authentication completes exactly once', () => {
  const googleHandlerSource = loginSource.slice(
    loginSource.indexOf('const handleGoogleSignIn'),
    loginSource.indexOf('const handleCreateAccount')
  );
  assert.equal((googleHandlerSource.match(/onAuthenticated\(\)/g) || []).length, 1);
  assert.doesNotMatch(googleHandlerSource, /finally\s*\{[\s\S]*auth\.currentUser/);
});

test('generic login still falls back to Workspace and malicious return targets are rejected', () => {
  for (const search of [
    '',
    '?returnTo=%2Fapp',
    '?returnTo=https%3A%2F%2Fevil.example%2Fhost%2Fstore',
    '?returnTo=%2F%2Fevil.example%2Fhost%2Fstore',
    '?returnTo=%2Fhost%2Fstore%3Fnext%3D%2Fapp',
    '?returnTo=%2Fhost%2Fstore%2F..%2F..%2Fapp'
  ]) {
    assert.equal(getValidatedHostReturnTo(search), '');
  }

  let destination = '';
  const handled = replaceWithValidatedHostReturnTo('', hostReturnTo => {
    destination = hostReturnTo;
  });
  if (!handled) destination = '/app';
  assert.equal(destination, '/app');
});

test('customer order login return is exact, authenticated, and uses replace navigation', () => {
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2Forders'), '/orders');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2Forders%2F'), '/orders/');
  for (const search of [
    '?returnTo=%2Forders%2Fanother-order',
    '?returnTo=%2Forders%3FcustomerUid%3Dother-user',
    '?returnTo=https%3A%2F%2Fevil.example%2Forders',
    '?returnTo=%2F%2Fevil.example%2Forders'
  ]) assert.equal(getValidatedPublicAccountReturnTo(search), '');

  let destination = '';
  assert.equal(replaceWithValidatedPublicAccountReturnTo('?returnTo=%2Forders', value => { destination = value; }), true);
  assert.equal(destination, '/orders');
});

test('Host Center is the single compact dashboard with Create, summaries, Share and Manage', () => {
  for (const label of [
    'Host Center',
    'Your group orders &amp; rewards',
    'Active Groups',
    'Group Sales',
    'Estimated Rewards',
    '+ Start a Group Order',
    'Create &amp; Share',
    'My Hosted Groups',
    'Qualifying paid orders',
    'Close Group',
    'Cancel Group'
  ]) assert.match(hostPage, new RegExp(label.replace(/[+]/g, '\\+')));
  assert.match(groupService, /getMyMiseChefGroupOrder/);
  assert.match(groupService, /updateMyMiseChefGroupOrderStatus/);
  assert.match(hostPage, /currentUser\?\.displayName\?\.trim\(\)/);
  assert.match(hostPage, /currentUser\?\.email\?\.split\('@'\)\[0\]\?\.trim\(\)/);
  assert.match(hostPage, /Signed in as \{hostIdentity\}/);
  assert.doesNotMatch(hostPage, /cash.?out|wallet/i);
});

test('customer Group context stays compact and contains no Host management UI', () => {
  assert.match(publicStorePage, /Ordering with \{groupOrder\.name\}/);
  assert.match(publicStorePage, /Order before \{new Date\(groupOrder\.closesAt\)\.toLocaleString\(\)\} · Pickup/);
  assert.doesNotMatch(publicStorePage, /joining \{groupOrder\.hostName\}/);
  assert.match(publicStorePage, /groupOrder\.status === 'open'/);
});

test('Group lifecycle is owner-only and revalidated inside order creation transaction', () => {
  assert.match(backend, /readString\(group\.hostId\) !== uid/);
  assert.match(backend, /currentStatus === nextStatus/);
  assert.match(backend, /currentStatus !== 'open'/);
  assert.match(backend, /data\?\.status === 'closed'/);
  assert.match(backend, /data\?\.status === 'cancelled'/);
  assert.match(storePayments, /runTransaction\(async transaction => \{\s+const currentGroupOrder = await revalidateCheckoutGroupInTransaction/);
  assert.match(storePayments, /groupOrder: currentGroupOrder/);
});

test('Group ownership, tenant values, reward configuration, and totals are server-derived', () => {
  assert.match(backend, /hostId: uid/);
  assert.match(backend, /workspaceId: readString\(store\.workspaceId\) \|\| store\.id/);
  assert.match(backend, /rewardPercent = Math\.min/);
  assert.match(backend, /calculateRewardContribution/);
  assert.match(backend, /db\.collection\('hostRewardLedger'\)\.doc\(orderId\)/);
  assert.match(rules, /match \/groupOrders\/\{groupId\}/);
  assert.match(rules, /resource\.data\.hostId == request\.auth\.uid/);
  assert.match(rules, /allow create, update, delete: if false/);
});
