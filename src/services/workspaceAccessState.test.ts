import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveWorkspaceAccess } from './workspaceAccessState';
import { canEditIngredientLibrary } from '../modules/costing/ingredientLibraryAccess';
import { canAccessRootTab } from '../modules/team/permissions';

const approved = { workspaceId: 'kitchen', allowed: true };

test('direct navigation and refresh wait through workspace, role, and entitlement hydration', () => {
  assert.equal(resolveWorkspaceAccess(undefined, null, null, 'loading'), 'loading');
  assert.equal(resolveWorkspaceAccess('kitchen', null, approved), 'loading');
  assert.equal(resolveWorkspaceAccess('kitchen', 'Owner', null), 'loading');
  assert.equal(resolveWorkspaceAccess('kitchen', 'Owner', { workspaceId: 'old', allowed: true }), 'loading');
  assert.equal(resolveWorkspaceAccess('kitchen', 'Owner', approved, 'loading'), 'loading');
  assert.equal(resolveWorkspaceAccess('kitchen', 'Owner', approved), 'allowed');
});

test('resolved workspace absence denies access while workspace service failures remain errors', () => {
  assert.equal(resolveWorkspaceAccess(undefined, null, null, 'ready'), 'denied');
  assert.equal(resolveWorkspaceAccess(undefined, null, null, 'error'), 'error');
});

test('service failure is distinct from confirmed entitlement denial', () => {
  assert.equal(resolveWorkspaceAccess('kitchen', 'Owner', { ...approved, allowed: false, error: true }), 'error');
  assert.equal(resolveWorkspaceAccess('kitchen', 'Owner', { ...approved, allowed: false }), 'denied');
});

test('Professional Owner retains route and edit capability; unauthorized roles fail closed', () => {
  assert.equal(canAccessRootTab('costingIngredients', 'Owner'), true);
  assert.equal(canEditIngredientLibrary('Owner'), true);
  for (const role of ['Manager', 'Head Chef', 'Purchasing'] as const) assert.equal(canEditIngredientLibrary(role), true);
  for (const role of ['Finance', 'Viewer', 'Chef', 'Sous Chef', null] as const) assert.equal(canEditIngredientLibrary(role), false);
  assert.equal(canAccessRootTab('costingIngredients', 'Viewer'), false);
});

test('app preserves pending route before the redirect and renders loading/service states', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const effect = app.slice(app.indexOf("if (currentUser && BUSINESS_WORKSPACE_TABS.has(activeTab))"), app.indexOf('}, [activeTab, currentUser,'));
  assert.match(effect, /workspaceAccess === 'loading' \|\| workspaceAccess === 'error'\) return/);
  assert.doesNotMatch(effect, /if \(!currentWorkspace\)/);
  assert.match(app, /role="status"[^>]*>Loading workspace access/);
  assert.match(app, /Workspace access could not be verified/);
});

test('Ingredient controls and mutation handlers fail closed during loading or denial', () => {
  const page = readFileSync(new URL('../modules/costing/pages/Ingredients/index.tsx', import.meta.url), 'utf8');
  assert.match(page, /canEditIngredients && !isLoading && !loadFailed/);
  assert.match(page, /disabled=\{!canEdit\} onClick=\{openCreateDrawer\}/);
  assert.match(page, /disabled=\{!canEdit\} onClick=\{\(\) => openEditDrawer/);
  assert.match(page, /if \(!canEdit\) return/);
  assert.match(page, /if \(!canEdit \|\| !selectedIngredient\) return/);
  assert.match(page, /Access denied: you cannot access ingredients/);
  assert.match(page, /Ingredient Library service is unavailable/);
});
