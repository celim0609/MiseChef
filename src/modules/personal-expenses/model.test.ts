import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMoneyOwed, formatPersonalExpenseCurrency, getTotalMoneyOwed } from './model';
import type { PersonalExpense, PersonalExpenseSettlement } from './types';

const expense = (id: string, memberId: string, amount: number): PersonalExpense => ({
  id,
  workspaceId: 'workspace-1',
  memberId,
  amount,
  expenseDate: '2026-08-14',
  description: 'Business purchase',
  category: 'Other',
  createdBy: 'user-1',
  createdAt: '2026-08-14T00:00:00.000Z'
});

const settlement = (id: string, memberId: string, amount: number): PersonalExpenseSettlement => ({
  id,
  workspaceId: 'workspace-1',
  memberId,
  amount,
  settledAt: '2026-08-14T01:00:00.000Z',
  createdBy: 'owner-1',
  createdAt: '2026-08-14T01:00:00.000Z'
});

test('derives member balances from expenses minus separate settlements', () => {
  const balances = deriveMoneyOwed(
    [expense('e1', 'm1', 100), expense('e2', 'm1', 50), expense('e3', 'm2', 45.8)],
    [settlement('s1', 'm1', 20)]
  );
  assert.equal(balances.find(item => item.memberId === 'm1')?.outstanding, 130);
  assert.equal(balances.find(item => item.memberId === 'm2')?.outstanding, 45.8);
  assert.equal(getTotalMoneyOwed(balances), 175.8);
});

test('keeps fully settled members visible when they have expense records', () => {
  const balances = deriveMoneyOwed([expense('e1', 'm1', 10)], [settlement('s1', 'm1', 10)]);
  assert.equal(balances.length, 1);
  assert.equal(balances[0].outstanding, 0);
});

test('uses the RM prefix for Malaysian personal expenses only', () => {
  assert.equal(formatPersonalExpenseCurrency(100, 'MYR'), 'RM100.00');
  assert.equal(formatPersonalExpenseCurrency(100, 'SGD'), 'SGD 100.00');
});

test('recalculates both member balances and the outstanding total after an amount and payer edit', () => {
  const expenses = [expense('e1', 'm1', 100), expense('e2', 'm1', 50), expense('e3', 'm2', 40)];
  const repayments = [settlement('s1', 'm2', 25)];
  assert.equal(getTotalMoneyOwed(deriveMoneyOwed(expenses, repayments)), 165);
  const updated = expenses.map(item => item.id === 'e1' ? { ...item, memberId: 'm2', amount: 81.23 } : item);
  const balances = deriveMoneyOwed(updated, repayments);
  assert.equal(balances.find(item => item.memberId === 'm1')?.outstanding, 50);
  assert.equal(balances.find(item => item.memberId === 'm2')?.outstanding, 96.23);
  assert.equal(getTotalMoneyOwed(balances), 146.23);
});
