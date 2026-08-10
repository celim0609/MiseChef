import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import IntentOnboarding from './IntentOnboarding';

test('intent onboarding offers all three multi-select goals and skip', () => {
  const markup = renderToStaticMarkup(<IntentOnboarding onContinue={() => undefined} onSkip={() => undefined} />);
  assert.match(markup, /What would you like to do with MiseChef/);
  assert.match(markup, /Build my Chef Profile/);
  assert.match(markup, /Create &amp; Manage Recipes/);
  assert.match(markup, /Sell Food/);
  assert.match(markup, /Skip for now/);
  assert.equal((markup.match(/aria-pressed="false"/g) || []).length, 3);
});
