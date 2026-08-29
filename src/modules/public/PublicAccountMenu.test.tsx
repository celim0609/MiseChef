import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePublicHostMenuAction, type PublicHostLookup } from './hostReturnNavigation';

const menuSource = readFileSync(new URL('./PublicAccountMenu.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('./PublicLayout.tsx', import.meta.url), 'utf8');

test('authenticated public account trigger stays Account across every Host lookup state', () => {
  const triggerSource = menuSource.slice(
    menuSource.indexOf('<button\n        ref={triggerRef}'),
    menuSource.indexOf('{isOpen && (')
  );
  assert.match(triggerSource, /Account/);
  assert.doesNotMatch(triggerSource, /Host Center|Workspace|Become a Host|hostAction\.label/);
  assert.match(layoutSource, /currentUser\s*\? <PublicAccountMenu/);
});

test('menu uses exact existing account destinations and logout handler', () => {
  assert.match(menuSource, /href="\/app\/recipes"[\s\S]*My Recipes/);
  assert.match(menuSource, /href=\{hostAction\.href\}[\s\S]*\{hostAction\.label\}/);
  assert.match(menuSource, /href="\/app"[\s\S]*Workspace[\s\S]*Business tools/);
  assert.match(menuSource, /void onSignOut\(\)/);
  assert.match(menuSource, /Log out/);
});

test('Host menu action is backend-result dependent and fails closed while loading or unknown', () => {
  const candidate = 'verified-store';
  const cases: PublicHostLookup[] = [
    { status: 'unavailable', storeSlug: '', userId: 'user-1' },
    { status: 'loading', storeSlug: candidate, userId: 'user-1' },
    { status: 'unknown', storeSlug: candidate, userId: 'user-1' }
  ];
  for (const lookup of cases) assert.equal(resolvePublicHostMenuAction(lookup, candidate, 'user-1'), null);

  assert.deepEqual(resolvePublicHostMenuAction({ status: 'host', storeSlug: candidate, userId: 'user-1' }, candidate, 'user-1'), {
    label: 'Host Center',
    href: '/host/verified-store',
    description: 'Groups & rewards'
  });
  assert.deepEqual(resolvePublicHostMenuAction({ status: 'non-host', storeSlug: candidate, userId: 'user-1' }, candidate, 'user-1'), {
    label: 'Become a Host',
    href: '/host/verified-store',
    description: 'Start group orders'
  });
  assert.equal(resolvePublicHostMenuAction({ status: 'host', storeSlug: candidate, userId: 'user-1' }, '', 'user-1'), null);
  assert.equal(resolvePublicHostMenuAction({ status: 'host', storeSlug: candidate, userId: 'user-1' }, 'another-store', 'user-1'), null);
  assert.equal(resolvePublicHostMenuAction({ status: 'host', storeSlug: candidate, userId: 'user-1' }, candidate, 'user-2'), null);
});

test('Account menu follows existing keyboard, focus, outside-click and ARIA patterns', () => {
  assert.match(menuSource, /aria-haspopup="menu"/);
  assert.match(menuSource, /aria-expanded=\{isOpen\}/);
  assert.match(menuSource, /aria-controls=\{menuId\}/);
  assert.match(menuSource, /role="menu"/);
  assert.ok((menuSource.match(/role="menuitem"/g) || []).length >= 3);
  assert.match(menuSource, /firstItemRef\.current\?\.focus\(\)/);
  assert.match(menuSource, /event\.key !== 'Escape'/);
  assert.match(menuSource, /triggerRef\.current\?\.focus\(\)/);
  assert.match(menuSource, /containerRef\.current\?\.contains/);
  assert.match(menuSource, /addEventListener\('pointerdown'/);
  assert.match(menuSource, /max-h-\[calc\(100dvh-5rem\)\]/);
});

test('PublicLayout verifies Store candidates and never derives Host action directly from the route', () => {
  assert.match(layoutSource, /groupOrderService\.listMine\(hostStoreCandidate\)/);
  assert.match(layoutSource, /status: result\.hostActive \? 'host' : 'non-host'/);
  assert.match(layoutSource, /resolvePublicHostMenuAction\(hostLookup, hostStoreCandidate, currentUser\?\.uid \|\| ''\)/);
  assert.doesNotMatch(layoutSource, /route\.page === 'host'\s*\? 'Host Center'/);
});
