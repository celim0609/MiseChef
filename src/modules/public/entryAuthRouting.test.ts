import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getValidatedPublicAccountReturnTo,
  resolvePostRegistrationDestination,
  resolveRegistrationIntent
} from './hostReturnNavigation';

const loginSource = readFileSync(new URL('../../components/LoginTab.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const menuSource = readFileSync(new URL('./PublicAccountMenu.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('./PublicLayout.tsx', import.meta.url), 'utf8');

test('public registration returns only to same-origin allowlisted destinations', () => {
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2Fstore%2Fchef-s-store'), '/store/chef-s-store');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=https%3A%2F%2Fevil.example%2Fstore%2Fchef-s-store'), '');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2F%2Fevil.example%2Fstore%2Fchef-s-store'), '');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2F%2Fevil.com'), '');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2F%5Cevil.com'), '');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=javascript%3Aalert%281%29'), '');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=https%3A%2F%2Fmisechef.ai.evil.com'), '');
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2Fstore%2Fchef-s-store%3Fnext%3Dhttps%3A%2F%2Fevil.example'), '');
});

test('public Login always starts with the two account paths', () => {
  assert.equal(resolveRegistrationIntent('?returnTo=%2Fstore%2Fchef-s-store'), 'ordering');
  assert.equal(resolveRegistrationIntent(''), 'chef');
  assert.match(loginSource, /const \[view, setView\] = useState<AuthView>\('registration-intent'\);/);
  assert.doesNotMatch(loginSource, /'welcome'|'guest'/);
  assert.match(loginSource, /I&apos;m a chef/);
  assert.match(loginSource, /I&apos;m just ordering/);
  const registrationChoiceSource = loginSource.slice(
    loginSource.indexOf("{view === 'registration-intent'"),
    loginSource.indexOf("{view === 'auth-options'")
  );
  assert.match(registrationChoiceSource, /I&apos;m a chef/);
  assert.match(registrationChoiceSource, /I&apos;m just ordering/);
  assert.doesNotMatch(registrationChoiceSource, /Continue as Guest/);
  assert.match(registrationChoiceSource, /setRegistrationIntent\('chef'\);\s*switchView\('auth-options'\)/);
  assert.match(registrationChoiceSource, /setRegistrationIntent\('ordering'\);\s*switchView\('auth-options'\)/);
});

test('Chef path offers authentication only and retains the Professional destination', () => {
  const authOptionsSource = loginSource.slice(
    loginSource.indexOf("{view === 'auth-options'"),
    loginSource.indexOf("{view === 'create-account'")
  );
  const createHandlerSource = loginSource.slice(
    loginSource.indexOf('const handleCreateAccount'),
    loginSource.indexOf('const handlePasswordReset')
  );

  assert.match(authOptionsSource, /Sign In/);
  assert.match(authOptionsSource, /Create Account/);
  assert.match(authOptionsSource, /registrationIntent === 'ordering'[\s\S]*Continue as Guest/);
  assert.match(createHandlerSource, /registrationIntent === 'chef' && !isValidPublicAccountReturnTo\(returnTo\)[\s\S]*ensureNewUserProvisioned/);
  assert.equal(resolvePostRegistrationDestination('', 'chef'), '/app');
});

test('Ordering path keeps Store returnTo and never provisions a Professional account', () => {
  const emailHandlerSource = loginSource.slice(
    loginSource.indexOf('const handleSignIn'),
    loginSource.indexOf('const handleGoogleSignIn')
  );
  const googleHandlerSource = loginSource.slice(
    loginSource.indexOf('const handleGoogleSignIn'),
    loginSource.indexOf('const handleCreateAccount')
  );
  const rememberIndex = googleHandlerSource.indexOf('rememberPostRegistrationDestination(window.location.search, registrationIntent || resolveRegistrationIntent(window.location.search))');
  const popupIndex = googleHandlerSource.indexOf('signInWithPopup(auth, provider)');
  const emailRememberIndex = emailHandlerSource.indexOf('rememberPostRegistrationDestination(window.location.search, registrationIntent || resolveRegistrationIntent(window.location.search))');
  const emailSignInIndex = emailHandlerSource.indexOf('signInWithEmailAndPassword(auth, signInEmail.trim(), signInPassword)');
  const createHandlerSource = loginSource.slice(
    loginSource.indexOf('const handleCreateAccount'),
    loginSource.indexOf('const handlePasswordReset')
  );
  const createAccountViewSource = loginSource.slice(
    loginSource.indexOf("{view === 'create-account'"),
    loginSource.indexOf("{view === 'forgot-password'")
  );
  assert.ok(rememberIndex >= 0 && rememberIndex < popupIndex);
  assert.ok(emailRememberIndex >= 0 && emailRememberIndex < emailSignInIndex);
  assert.equal(resolvePostRegistrationDestination('', 'ordering'), '/orders');
  assert.equal(
    resolvePostRegistrationDestination('?returnTo=%2Fstore%2Fchef-s-store', 'ordering'),
    '/store/chef-s-store'
  );
  assert.equal((googleHandlerSource.match(/onAuthenticated\(\)/g) || []).length, 1);
  assert.doesNotMatch(googleHandlerSource, /ensureNewUserProvisioned/);
  assert.match(createHandlerSource, /registrationIntent === 'chef' && !isValidPublicAccountReturnTo\(returnTo\)[\s\S]*ensureNewUserProvisioned/);
  assert.doesNotMatch(createHandlerSource, /registrationIntent === 'ordering'[\s\S]*ensureNewUserProvisioned/);
  assert.doesNotMatch(createAccountViewSource, /Continue as Guest/);
});

test('Ordering guest continuation returns to its Store or the public Store index', () => {
  const guestHandlerSource = appSource.slice(
    appSource.indexOf('const handleContinueAsGuest = async () =>'),
    appSource.indexOf('const handleStartBusinessTrial')
  );

  assert.equal(
    getValidatedPublicAccountReturnTo('?returnTo=%2Fstore%2Fmisechef-s-grab-go-store'),
    '/store/misechef-s-grab-go-store'
  );
  assert.match(guestHandlerSource, /replaceWithValidatedPublicAccountReturnTo\([\s\S]*returnTo => window\.location\.replace\(returnTo\)[\s\S]*window\.location\.replace\('\/store'\)/);
  assert.doesNotMatch(guestHandlerSource, /window\.location\.replace\('\/'\)/);
});

test('authenticated Store returns keep the Professional shell hidden while redirecting', () => {
  const redirectGuardStart = appSource.indexOf('const pendingPublicStoreReturnTo');
  const redirectGuardSource = appSource.slice(
    redirectGuardStart,
    appSource.indexOf('if (isPublicExperiencePath', redirectGuardStart)
  );

  assert.match(redirectGuardSource, /window\.location\.pathname === '\/login'/);
  assert.match(redirectGuardSource, /getValidatedPublicAccountReturnTo\(window\.location\.search\)/);
  assert.match(redirectGuardSource, /pendingPublicStoreReturnTo\.startsWith\('\/store\/'\)/);
  assert.match(redirectGuardSource, /return <BrandLoadingScreen \/>;/);
  assert.doesNotMatch(redirectGuardSource, /HomeTab|Create Recipe/);
});

test('Store post-auth completion is idempotent when auth state wins the Google popup race', () => {
  const authStateSource = appSource.slice(
    appSource.indexOf('unsubscribeAuth = onAuthStateChanged'),
    appSource.indexOf("setCurrentUserRole('user');")
  );
  const authenticatedEffectSource = appSource.slice(
    appSource.indexOf('useEffect(() => {\n    if (currentUser && activeTab === \'login\')'),
    appSource.indexOf('\n  useEffect(() => {', appSource.indexOf('useEffect(() => {\n    if (currentUser && activeTab === \'login\')') + 1)
  );
  const authenticatedHandlerSource = appSource.slice(
    appSource.indexOf('const handleAuthenticated = () =>'),
    appSource.indexOf('const handleContinueAsGuest')
  );

  assert.match(appSource, /const postAuthenticationNavigationInFlightRef = useRef\(false\);/);
  assert.match(appSource, /if \(postAuthenticationNavigationInFlightRef\.current\) return true;[\s\S]*consumePostRegistrationDestination\(\)[\s\S]*postAuthenticationNavigationInFlightRef\.current = true;[\s\S]*window\.location\.replace\(destination\)/);
  assert.match(appSource, /const completePostAuthenticationNavigation = \(\) => \([\s\S]*replaceWithPostRegistrationDestination\(\) \|\| replaceWithPostAuthenticationReturnTo\(\)/);
  assert.match(authStateSource, /pathname === '\/login' && completePostAuthenticationNavigation\(\)/);
  assert.match(authenticatedEffectSource, /if \(completePostAuthenticationNavigation\(\)\) return;[\s\S]*handleRootNavigate\('home'\)/);
  assert.match(authenticatedHandlerSource, /if \(completePostAuthenticationNavigation\(\)\) return;[\s\S]*handleRootNavigate\('home'\)/);
});

test('a stale post-registration destination is cleared before a later plain sign-in', () => {
  assert.match(loginSource, /useEffect\(\(\) => \{\s*forgetPostRegistrationDestination\(\);\s*return forgetPostRegistrationDestination;/);
  assert.match(loginSource, /view === 'create-account' && nextView !== 'create-account'[\s\S]*forgetPostRegistrationDestination\(\)/);
  assert.match(loginSource, /return forgetPostRegistrationDestination;/);
});

test('public order intent renders My Orders before chef destinations', () => {
  const orderItemIndex = menuSource.indexOf('{orderIntent && ordersItem}');
  const chefItemIndex = menuSource.indexOf('href="/app"');
  assert.ok(orderItemIndex >= 0 && orderItemIndex < chefItemIndex);
  assert.match(menuSource, /\{!orderIntent && ordersItem\}/);
  assert.match(layoutSource, /const orderIntent = route\.page === 'store'/);
  assert.match(layoutSource, /route\.page === 'store-product'/);
  assert.match(layoutSource, /<PublicAccountMenu hostAction=\{hostAction\} orderIntent=\{orderIntent\}/);
});
