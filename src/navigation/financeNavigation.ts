import type { RootTab } from '../types';

export const FINANCE_NAVIGATION = {
  label: 'Finance',
  itemLabel: 'Personal Expenses',
  tab: 'personalExpenses' as RootTab,
  path: '/app/finance/personal-expenses',
  legacyPath: '/finance/personal-expenses'
} as const;

export const isFinancePath = (pathname: string) => (
  pathname === FINANCE_NAVIGATION.path || pathname === FINANCE_NAVIGATION.legacyPath
);
