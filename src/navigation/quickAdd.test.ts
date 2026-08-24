import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  QUICK_ADD_ACTIONS,
  getAvailableQuickAddActions,
  getQuickAddAction
} from './quickAdd';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const idsFor = (role: Parameters<typeof getAvailableQuickAddActions>[0]) => (
  getAvailableQuickAddActions(role).map(action => action.id)
);

test('Global Quick Add exposes the four canonical actions and destinations', () => {
  assert.deepEqual(QUICK_ADD_ACTIONS.map(({ id, label, subtitle, targetTab }) => ({ id, label, subtitle, targetTab })), [
    { id: 'invoice', label: 'Add Invoice', subtitle: 'Upload supplier invoice', targetTab: 'costingInvoices' },
    { id: 'recipe', label: 'Add Recipe', subtitle: 'Create a new recipe', targetTab: 'search' },
    { id: 'ingredient', label: 'Add Ingredient', subtitle: 'Add to ingredient library', targetTab: 'costingIngredients' },
    { id: 'supplier', label: 'Add Supplier', subtitle: 'Create supplier record', targetTab: 'businessSuppliers' }
  ]);
  assert.equal(getQuickAddAction('invoice')?.targetTab, 'costingInvoices');
});

test('Owner sees every action while workspace roles only see actions they can create', () => {
  assert.deepEqual(idsFor('Owner'), ['invoice', 'recipe', 'ingredient', 'supplier']);
  assert.deepEqual(idsFor('Chef'), ['recipe']);
  assert.deepEqual(idsFor('Purchasing'), ['invoice', 'ingredient', 'supplier']);
  assert.deepEqual(idsFor('Finance'), []);
  assert.deepEqual(idsFor('Viewer'), []);
  assert.deepEqual(getAvailableQuickAddActions('Viewer', true).map(action => action.id), ['invoice', 'recipe', 'ingredient', 'supplier']);
});

test('desktop popover and mobile sheet share Escape, outside-click, and selection behavior', () => {
  const component = source('../components/GlobalQuickAdd.tsx');
  assert.match(component, /data-testid="quick-add-desktop-menu"/);
  assert.match(component, /data-testid="quick-add-mobile-sheet"/);
  assert.match(component, /sm:block/);
  assert.match(component, /sm:hidden/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /aria-label="Close Quick Add"/);
  assert.match(component, /setIsOpen\(false\);\s*onSelect\(action\)/);
});

test('the FAB and Home Quick Actions use the same canonical handler', () => {
  const app = source('../App.tsx');
  const home = source('../components/HomeTab.tsx');
  assert.match(app, /quickAddActions=\{availableQuickAddActions\}/);
  assert.match(app, /onQuickAdd=\{handleQuickAdd\}/);
  assert.match(app, /<GlobalQuickAdd actions=\{availableQuickAddActions\} onSelect=\{handleQuickAdd\}/);
  assert.match(home, /quickAddActions\.map/);
  assert.match(home, /onQuickAdd\?\.\(action\.id\)/);
});

test('canonical actions open existing module controls instead of duplicating forms', () => {
  assert.match(source('../modules/costing/pages/Invoices/index.tsx'), /singleUploadInputRef\.current\?\.click\(\)/);
  assert.match(source('../modules/costing/pages/Ingredients/index.tsx'), /openCreateDrawer\(\);\s*onQuickAddHandled\?\.\(openCreateRequest\)/);
  assert.match(source('../modules/suppliers/pages/Supplier/index.tsx'), /openAddSupplier\(\);\s*onQuickAddHandled\?\.\(openCreateRequest\)/);
  assert.match(source('../App.tsx'), /if \(actionId === 'recipe'\) \{\s*setAddingRecipe\(true\)/);
});

test('integrated module routes remain present alongside Quick Add', () => {
  const app = source('../App.tsx');
  for (const marker of [
    "personalExpenses: FINANCE_NAVIGATION.path",
    "costingInvoices: '/app/costing/invoices'",
    "search: '/app/recipes'",
    "store: '/app/store'",
    "team: '/app/team'"
  ]) assert.ok(app.includes(marker), `Missing integrated route marker: ${marker}`);
  assert.match(source('../modules/store/index.ts'), /Host|host/i);
});
