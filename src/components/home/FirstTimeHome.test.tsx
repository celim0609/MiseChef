import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import FirstTimeHome from './FirstTimeHome';
import { getAuthenticatedDisplayName, getChefProfileStorageKey } from '../../utils/authenticatedUser';

const renderWelcome = (displayName: string) => renderToStaticMarkup(
  <FirstTimeHome displayName={displayName} />
);

test('switching accounts uses only each authenticated user display name', () => {
  const firstAccount = { uid: 'account-a', displayName: 'Alice Tan' };
  const secondAccount = { uid: 'account-b', displayName: 'Bob Lee' };

  const firstMarkup = renderWelcome(getAuthenticatedDisplayName(firstAccount));
  const secondMarkup = renderWelcome(getAuthenticatedDisplayName(secondAccount));

  assert.match(firstMarkup, /Welcome to MiseChef, Alice Tan/);
  assert.doesNotMatch(firstMarkup, /Bob Lee|Ce Lim/);
  assert.match(secondMarkup, /Welcome to MiseChef, Bob Lee/);
  assert.doesNotMatch(secondMarkup, /Alice Tan|Ce Lim/);
});

test('switching to an account without a display name renders the generic welcome', () => {
  const firstAccount = { uid: 'account-a', displayName: 'Alice Tan' };
  const unnamedAccount = { uid: 'account-b', displayName: '   ' };

  renderWelcome(getAuthenticatedDisplayName(firstAccount));
  const unnamedMarkup = renderWelcome(getAuthenticatedDisplayName(unnamedAccount));

  assert.match(unnamedMarkup, />Welcome to MiseChef</);
  assert.doesNotMatch(unnamedMarkup, /Welcome to MiseChef,/);
  assert.doesNotMatch(unnamedMarkup, /Alice Tan|Ce Lim/);
});

test('profile caches are isolated by authenticated user id', () => {
  assert.equal(getChefProfileStorageKey('account-a'), 'ce_lims_kitchen_chef_profile_v1_account-a');
  assert.equal(getChefProfileStorageKey('account-b'), 'ce_lims_kitchen_chef_profile_v1_account-b');
  assert.notEqual(getChefProfileStorageKey('account-a'), getChefProfileStorageKey('account-b'));
});
