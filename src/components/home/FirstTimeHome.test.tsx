import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import FirstTimeHome from './FirstTimeHome';
import { OwnerHomeHeader } from './OwnerHomeWidgets';
import { getAuthenticatedGreeting, getChefProfileStorageKey } from '../../utils/authenticatedUser';

const renderWelcome = (displayName: string | null) => renderToStaticMarkup(
  <FirstTimeHome greeting={getAuthenticatedGreeting('Welcome to MiseChef', { displayName })} />
);

const renderDashboard = (displayName: string | null) => renderToStaticMarkup(
  <OwnerHomeHeader
    date="Friday, 24 July 2026"
    greeting={getAuthenticatedGreeting('Good Morning', { displayName })}
    purchaseRatio="No data available"
    purchaseRatioLabel="No data"
    purchaseRatioClassName=""
  />
);

test('Getting Started switches from Account A to Account B without leaking names', () => {
  const firstMarkup = renderWelcome('Alice Tan');
  const secondMarkup = renderWelcome('Bob Lee');

  assert.match(firstMarkup, />Welcome to MiseChef, Alice Tan</);
  assert.doesNotMatch(firstMarkup, /Bob Lee|Ce Lim/);
  assert.match(secondMarkup, />Welcome to MiseChef, Bob Lee</);
  assert.doesNotMatch(secondMarkup, /Alice Tan|Ce Lim/);
});

test('established Dashboard switches from Account A to Account B without leaking names', () => {
  const firstMarkup = renderDashboard('Alice Tan');
  const secondMarkup = renderDashboard('Bob Lee');

  assert.match(firstMarkup, />Good Morning, Alice Tan</);
  assert.doesNotMatch(firstMarkup, /Bob Lee|Ce Lim/);
  assert.match(secondMarkup, />Good Morning, Bob Lee</);
  assert.doesNotMatch(secondMarkup, /Alice Tan|Ce Lim/);
});

test('an account without a display name gets generic Home greetings', () => {
  const unnamedWelcomeMarkup = renderWelcome('   ');
  const unnamedDashboardMarkup = renderDashboard(null);

  assert.match(unnamedWelcomeMarkup, />Welcome to MiseChef</);
  assert.doesNotMatch(unnamedWelcomeMarkup, /Welcome to MiseChef,/);
  assert.doesNotMatch(unnamedWelcomeMarkup, /Ce Lim/);
  assert.match(unnamedDashboardMarkup, />Good Morning</);
  assert.doesNotMatch(unnamedDashboardMarkup, /Good Morning,/);
  assert.doesNotMatch(unnamedDashboardMarkup, /Ce Lim/);
});

test('profile caches are isolated by authenticated user id', () => {
  assert.equal(getChefProfileStorageKey('account-a'), 'ce_lims_kitchen_chef_profile_v1_account-a');
  assert.equal(getChefProfileStorageKey('account-b'), 'ce_lims_kitchen_chef_profile_v1_account-b');
  assert.notEqual(getChefProfileStorageKey('account-a'), getChefProfileStorageKey('account-b'));
});
