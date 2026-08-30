import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const storePageSource = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
const storeServiceSource = readFileSync(new URL('./services/storeService.ts', import.meta.url), 'utf8');

test('workspace readiness and app startup never provision a Store', () => {
  assert.doesNotMatch(appSource, /ensureWorkspaceStore/);
});

test('Store page loads with a read-only lookup and provisions only from Set Up Store', () => {
  assert.match(storePageSource, /getWorkspaceStore\(workspace\.id\)/);
  assert.match(storePageSource, /Start selling with MiseChef/);
  assert.match(storePageSource, /Create a Store when you're ready to sell food and accept orders\./);
  assert.match(storePageSource, /handleSetUpStore/);
  assert.match(storePageSource, /ensureWorkspaceStore\(\{ \.\.\.workspace, name \}, currentUser\.uid\)/);
});

test('idempotent Store creation returns an existing Store before any create write', () => {
  assert.match(storeServiceSource, /if \(existing\.exists\(\)\) \{\s+return normalizeWorkspaceStore/);
  assert.match(storeServiceSource, /if \(storeSnapshot\.exists\(\)\) \{\s+return normalizeWorkspaceStore/);
});
