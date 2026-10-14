import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { canAccessRootTab } from '../modules/team/permissions';
import { FINANCE_NAVIGATION } from '../navigation/financeNavigation';

const source = readFileSync(new URL('./NavigationDrawer.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
// Exercise the application's canonical mapping rather than reproducing routes in fixtures.
const paths = new Function('FINANCE_NAVIGATION', `return ${appSource.match(/const ROOT_TAB_PATHS: Record<RootTab, string> = (\{[\s\S]*?\n\});/)![1]}`)(FINANCE_NAVIGATION);
let expanded = true;
let stateIndex = 0;
const hooks = {
  useEffect: () => {}, useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => { const index = stateIndex++; return [index < 5 ? expanded : initial, () => {}]; }
};
const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const module = { exports: {} as any };
const icons = Object.fromEntries(source.match(/import \{([\s\S]*?)\} from 'lucide-react'/)![1].split(',').map(name => [name.trim().split(' as ').pop()!, () => null]));
const code = transformSync(source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];\n/g, ''), { loader: 'tsx', format: 'cjs' }).code;
runInNewContext(code, {
  module, exports: module.exports, React, ...hooks, ...icons,
  AnimatePresence: passthrough,
  motion: new Proxy({}, { get: () => passthrough }), BrandLogo: () => null,
  canAccessRootTab, FINANCE_NAVIGATION,
  subscriptionService: {
    getPlanDefinition: () => ({ id: 'free', name: 'Free' }),
    canPlanUseFeature: () => true,
    getRequiredPlanForFeature: () => 'free'
  }
});
const { NavigationLink, NavigationSection, default: NavigationDrawer } = module.exports;
const noop = () => {};
function drawer(overrides: Record<string, unknown> = {}) {
  stateIndex = 0;
  return renderToStaticMarkup(<NavigationDrawer isOpen categories={[]} activeTab="costingIngredients" selectedCategory={null} isFavoritesFilterActive={false} categoryCounts={{}}
    onClose={noop} onNavigate={noop} getNavigationHref={(tab: string) => paths[tab]} onPublicHome={noop} onRequestBusinessAccess={noop} onSelectCategory={noop} onSelectFavorites={noop}
    currentUser={{ uid: 'qa', displayName: 'QA' }} currentUserRole="super_admin" workspaceRole="Owner" hasBusinessEntitlement onRenameCategory={noop} onDeleteCategory={noop} onSignOut={noop} {...overrides} />);
}

test('destinations render canonical hrefs and retain active styling', () => {
  expanded = true;
  const html = drawer();
  for (const [label, tab] of [['My MiseChef', 'home'], ['Admin', 'admin'], ['Ingredients', 'costingIngredients'], ['Suppliers', 'businessSuppliers'], ['Personal Expenses', 'personalExpenses']]) {
    assert.match(html, new RegExp(`<a[^>]*href="${paths[tab]}"[^>]*>[\\s\\S]*?<span>${label}</span>`));
  }
  assert.match(html, new RegExp(`<a href="${paths.costingIngredients}" class="[^"]*bg-primary text-on-primary shadow-sm`));
  assert.match(html, /<a href="\/host\/groups"/);
});

for (const [name, fields, intercepted] of [
  ['primary click', {}, true], ['Cmd-click', { metaKey: true }, false], ['Ctrl-click', { ctrlKey: true }, false],
  ['Shift-click', { shiftKey: true }, false], ['Alt-click', { altKey: true }, false],
  ['middle click', { button: 1 }, false], ['right click', { button: 2 }, false], ['already prevented', { defaultPrevented: true }, false]
] as const) {
  test(`${name} ${intercepted ? 'uses SPA navigation' : 'is not intercepted'}`, () => {
    let prevented = 0, navigated = 0;
    const link = NavigationLink({ href: paths.home, onNavigate: () => { navigated++; } });
    assert.equal(link.type, 'a');
    assert.equal(link.props.href, paths.home);
    link.props.onClick({ button: 0, defaultPrevented: false, ...fields, preventDefault: () => { prevented++; } });
    assert.equal(prevented, Number(intercepted));
    assert.equal(navigated, Number(intercepted));
  });
}

test('section chevrons expand/collapse independently of their destination link', () => {
  let open = false, navigated = 0;
  const props = { href: paths.costing, onNavigate: () => { navigated++; }, onToggle: () => { open = !open; }, label: 'Costing', className: 'active', children: 'Costing' };
  for (const expected of [false, true, false]) {
    const section = NavigationSection({ ...props, expanded: open });
    const [link, button] = section.props.children;
    assert.equal(link.props.href, paths.costing);
    assert.equal(button.type, 'button');
    assert.equal(button.props['aria-expanded'], expected);
    button.props.onClick();
    assert.equal(navigated, 0);
  }
  expanded = false;
  const closed = drawer();
  assert.doesNotMatch(closed, /<span>Ingredients<\/span>/);
  expanded = true;
  assert.match(drawer(), /<span>Ingredients<\/span>/);
});

test('permission-hidden destinations stay hidden and locked actions remain controls', () => {
  expanded = true;
  const html = drawer({ currentUserRole: 'user', workspaceRole: 'Viewer', hasBusinessEntitlement: false });
  assert.doesNotMatch(html, /href="\/app\/admin"|href="\/app\/costing\/ingredients"|href="\/app\/business\/suppliers"/);
  assert.match(html, /<button[^>]*>[\s\S]*?<span class="flex-1">Workspace<\/span>/);
});

test('drawer and mobile share the existing routes and guarded SPA link component', () => {
  assert.match(appSource, /getNavigationHref=\{tab => ROOT_TAB_PATHS\[tab\]\}/);
  const mobile = appSource.slice(appSource.indexOf('{/* Responsive Bottom Navigation'), appSource.indexOf('{/* Persistent workspace-wide'));
  assert.match(mobile, /<NavigationLink\s+href=\{ROOT_TAB_PATHS.home\}\s+onNavigate=/);
  assert.match(mobile, /<NavigationLink\s+href=\{ROOT_TAB_PATHS.search\}\s+onNavigate=/);
  assert.doesNotMatch(mobile, /<button/);
  assert.match(source, /onClick=\{\(\) => setCategoriesOpen/);
  assert.match(source, /onClick=\{handleAccountSignOut\}/);
});
