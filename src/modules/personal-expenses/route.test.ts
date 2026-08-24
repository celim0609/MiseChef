import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canAccessRootTab } from '../team/permissions';

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../../components/NavigationDrawer.tsx', import.meta.url), 'utf8');
const navigationModelSource = readFileSync(new URL('../../navigation/financeNavigation.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./services/personalExpenseService.ts', import.meta.url), 'utf8');

test('Finance navigation exposes the existing Personal Expenses destination', () => {
  assert.match(navigationSource, /FINANCE_NAVIGATION\.label/);
  assert.match(navigationSource, /FINANCE_NAVIGATION\.itemLabel/);
  assert.match(navigationModelSource, /label: 'Finance'/);
  assert.match(navigationModelSource, /itemLabel: 'Personal Expenses'/);
  assert.match(navigationModelSource, /tab: 'personalExpenses'/);
});

test('direct and refreshed app routes resolve to PersonalExpensesPage', () => {
  assert.match(appSource, /personalExpenses: FINANCE_NAVIGATION\.path/);
  assert.match(appSource, /isFinancePath\(pathname\)/);
  assert.match(navigationModelSource, /path: '\/app\/finance\/personal-expenses'/);
  assert.match(navigationModelSource, /legacyPath: '\/finance\/personal-expenses'/);
  assert.match(appSource, /case 'personalExpenses':[\s\S]*<PersonalExpensesPage/);
});

test('Owner navigation cannot silently lose Finance during unrelated feature work', () => {
  assert.equal(canAccessRootTab('personalExpenses', 'Owner'), true);
  assert.match(navigationSource, /financeMenuItems\.length > 0/);
  assert.match(navigationSource, /handleNavigate\(item\.tab\)/);
  assert.match(appSource, /import \{ PersonalExpensesPage \} from '\.\/modules\/personal-expenses'/);
});

test('every active Workspace role can enter the expense page while management remains page-level', () => {
  for (const role of ['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef', 'Purchasing', 'Finance', 'Viewer'] as const) {
    assert.equal(canAccessRootTab('personalExpenses', role), true);
  }
});

test('the recovered service persists payer identity and uses the existing expense and settlement collections', () => {
  assert.match(serviceSource, /memberId: draft\.memberId/);
  assert.match(serviceSource, /collection\(db, 'personalExpenses'\)/);
  assert.match(serviceSource, /collection\(db, 'personalExpenseSettlements'\)/);
  assert.match(serviceSource, /'recordPersonalExpenseSettlement'/);
});
