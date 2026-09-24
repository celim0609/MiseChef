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
  assert.match(appSource, /consumePostRegistrationDestination/);
  assert.match(appSource, /replaceWithPostRegistrationDestination\(\)/);
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
