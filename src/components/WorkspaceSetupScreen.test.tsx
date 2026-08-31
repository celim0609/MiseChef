import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkspaceSetupScreen from './WorkspaceSetupScreen';

test('workspace readiness gate is neutral and does not render permission errors', () => {
  const markup = renderToStaticMarkup(<WorkspaceSetupScreen />);

  assert.match(markup, /Setting up My MiseChef/);
  assert.match(markup, /Preparing your personal profile and recipes/);
  assert.doesNotMatch(markup, /Owner access|Professional trial/);
  assert.doesNotMatch(markup, /Permission denied|Missing or insufficient permissions/);
});
