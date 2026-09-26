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

test('post-registration destinations follow entry intent without persisting an account type', () => {
  assert.equal(resolveRegistrationIntent('?returnTo=%2Fstore%2Fchef-s-store'), 'ordering');
  assert.equal(resolveRegistrationIntent(''), 'chef');
  assert.equal(resolvePostRegistrationDestination('?returnTo=%2Fstore%2Fchef-s-store', 'ordering'), '/store/chef-s-store');
  assert.equal(resolvePostRegistrationDestination('', 'ordering'), '/orders');
  assert.equal(resolvePostRegistrationDestination('?returnTo=%2Fstore%2Fchef-s-store', 'chef'), '/app');
  assert.match(loginSource, /I&apos;m a chef/);
  assert.match(loginSource, /I&apos;m just ordering/);
  assert.match(loginSource, /registrationIntent === 'ordering'[\s\S]*Create an account to keep your orders in one place/);
  assert.match(loginSource, /\['chef', 'ordering'\]\.includes\(new URLSearchParams\(window\.location\.search\)\.get\('intent'\)/);
  const registrationChoiceSource = loginSource.slice(
    loginSource.indexOf("{view === 'registration-intent'"),
    loginSource.indexOf("{view === 'create-account'")
  );
  assert.match(registrationChoiceSource, /I&apos;m a chef/);
  assert.match(registrationChoiceSource, /I&apos;m just ordering/);
  assert.doesNotMatch(registrationChoiceSource, /Continue as Guest/);
  const createAccountSource = loginSource.slice(
    loginSource.indexOf("{view === 'create-account'"),
    loginSource.indexOf("{view === 'forgot-password'")
  );
  assert.match(createAccountSource, /onClick=\{handleGoogleSignIn\}/);
  assert.match(createAccountSource, /registrationIntent === 'ordering'[\s\S]*Continue as Guest/);
  assert.match(appSource, /consumePostRegistrationDestination/);
  assert.match(appSource, /replaceWithPostRegistrationDestination\(\)/);
});

test('Google sign-up preserves the selected chef or ordering registration intent', () => {
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
  assert.ok(rememberIndex >= 0 && rememberIndex < popupIndex);
  assert.ok(emailRememberIndex >= 0 && emailRememberIndex < emailSignInIndex);
  assert.equal(resolvePostRegistrationDestination('', 'chef'), '/app');
  assert.equal(resolvePostRegistrationDestination('', 'ordering'), '/orders');
  assert.equal(
    resolvePostRegistrationDestination('?returnTo=%2Fstore%2Fchef-s-store', 'ordering'),
    '/store/chef-s-store'
  );
  assert.equal((googleHandlerSource.match(/onAuthenticated\(\)/g) || []).length, 1);
  assert.doesNotMatch(googleHandlerSource, /ensureNewUserProvisioned/);
});

test('the selected account choice remains available after returning to sign in', () => {
  const signInViewSource = loginSource.slice(
    loginSource.indexOf("{view === 'sign-in'"),
    loginSource.indexOf("{view === 'registration-intent'")
  );
  const registrationChoiceSource = loginSource.slice(
    loginSource.indexOf("{view === 'registration-intent'"),
    loginSource.indexOf("{view === 'create-account'")
  );

  assert.match(signInViewSource, /isRegistrationChoiceFlow \? 'Back to account choice' : 'Create Account'/);
  assert.match(signInViewSource, /onClick=\{\(\) => switchView\('registration-intent'\)\}/);
  assert.match(registrationChoiceSource, /setRegistrationIntent\('chef'\);\s*setIsRegistrationChoiceFlow\(true\);\s*switchView\('create-account'\)/);
  assert.match(registrationChoiceSource, /setRegistrationIntent\('ordering'\);\s*setIsRegistrationChoiceFlow\(true\);\s*switchView\('create-account'\)/);
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
