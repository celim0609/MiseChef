import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePublicRoute } from '../public/publicRoutes';
import { createDefaultWorkspaceStore, normalizeWorkspaceStore, validateStoreSettings } from './storeModel';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const hostPage = readFileSync(new URL('./HostProgramPage.tsx', import.meta.url), 'utf8');
const paymentService = readFileSync(new URL('./services/paymentService.ts', import.meta.url), 'utf8');
const groupService = readFileSync(new URL('./services/groupOrderService.ts', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../../functions/groupOrders.js', import.meta.url), 'utf8');

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
  assert.match(publicStorePage, /Start a Group Order/);
  assert.match(publicStorePage, /groupShareCode: groupOrder\.shareCode/);
  assert.match(publicStorePage, /disabled=\{Boolean\(groupOrder\)\}/);
  assert.match(paymentService, /createPublicStorePayment/);
});

test('Host activation uses the current account and sharing supports native Share and Copy Link', () => {
  assert.match(groupService, /activateMiseChefHost/);
  assert.match(hostPage, /existing MiseChef account/);
  assert.match(hostPage, /navigator\.share/);
  assert.match(hostPage, /navigator\.clipboard\.writeText/);
  assert.match(hostPage, /Login or Register/);
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
