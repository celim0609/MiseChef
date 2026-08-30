import type { MemberMoneyOwed, PersonalExpense, PersonalExpenseSettlement } from './types';
import { formatRegionCurrency } from '../../regions/regionService';

const toCents = (value: number) => Math.round(Number(value || 0) * 100);
const fromCents = (value: number) => value / 100;

export const formatPersonalExpenseCurrency = (value: number, currency: string) => (
  currency === 'MYR'
    ? `RM${Number(value || 0).toFixed(2)}`
    : formatRegionCurrency(value, currency)
);

export const deriveMoneyOwed = (
  expenses: PersonalExpense[],
  settlements: PersonalExpenseSettlement[]
): MemberMoneyOwed[] => {
  const memberIds = Array.from(new Set(expenses.map(expense => expense.memberId)));

  return memberIds.map(memberId => {
    const memberExpenses = expenses
      .filter(expense => expense.memberId === memberId)
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt));
    const memberSettlements = settlements
      .filter(settlement => settlement.memberId === memberId)
      .sort((a, b) => b.settledAt.localeCompare(a.settledAt));
    const expenseCents = memberExpenses.reduce((sum, expense) => sum + toCents(expense.amount), 0);
    const settledCents = memberSettlements.reduce((sum, settlement) => sum + toCents(settlement.amount), 0);

    return {
      memberId,
      totalExpenses: fromCents(expenseCents),
      totalSettled: fromCents(settledCents),
      outstanding: fromCents(Math.max(0, expenseCents - settledCents)),
      expenses: memberExpenses,
      settlements: memberSettlements
    };
  });
};

export const getTotalMoneyOwed = (balances: MemberMoneyOwed[]) => (
  balances.reduce((sum, balance) => sum + toCents(balance.outstanding), 0) / 100
);
