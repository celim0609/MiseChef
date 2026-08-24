import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpsError } from 'firebase-functions/v2/https';
import { recordPersonalExpenseSettlement } from './personalExpenseSettlements.js';

const createFirestore = ({ members = {}, expenses = [], settlements = [] }) => {
  const state = {
    members: new Map(Object.entries(members)),
    expenses: [...expenses],
    settlements: [...settlements]
  };
  let nextSettlementId = 1;

  const collection = name => ({
    kind: 'query',
    name,
    filters: [],
    doc: id => ({ kind: 'doc', name, id: id || `settlement-${nextSettlementId++}` }),
    where(field, operator, value) {
      assert.equal(operator, '==');
      return query(name, [{ field, value }]);
    }
  });
  const query = (name, filters) => ({
    kind: 'query',
    name,
    filters,
    where(field, operator, value) {
      assert.equal(operator, '==');
      return query(name, [...filters, { field, value }]);
    }
  });
  const queryRows = reference => {
    const rows = reference.name === 'personalExpenses' ? state.expenses : state.settlements;
    return rows.filter(row => reference.filters.every(filter => row[filter.field] === filter.value));
  };

  return {
    state,
    db: {
      collection,
      runTransaction: async callback => callback({
        get: async reference => {
          if (reference.kind === 'doc') {
            const data = reference.name === 'workspaceMembers' ? state.members.get(reference.id) : undefined;
            return { exists: Boolean(data), data: () => data };
          }
          return { docs: queryRows(reference).map(data => ({ data: () => data })) };
        },
        create: (reference, data) => {
          assert.equal(reference.name, 'personalExpenseSettlements');
          state.settlements.push({ ...data });
        }
      })
    }
  };
};

const fixture = () => createFirestore({
  members: {
    'workspace-a_member-a': { workspaceId: 'workspace-a', status: 'Active' }
  },
  expenses: [
    { workspaceId: 'workspace-a', memberId: 'workspace-a_member-a', amount: 100 },
    { workspaceId: 'workspace-a', memberId: 'workspace-a_member-a', amount: 50 }
  ],
  settlements: [
    { workspaceId: 'workspace-a', memberId: 'workspace-a_member-a', amount: 60 }
  ]
});

test('Owner records a partial repayment atomically and receives the remaining balance', async () => {
  const { db, state } = fixture();

  const result = await recordPersonalExpenseSettlement({
    db,
    requesterId: 'owner-a',
    workspaceId: 'workspace-a',
    memberId: 'workspace-a_member-a',
    amount: 25,
    resolveWorkspaceAccess: async () => ({ workspaceId: 'workspace-a', role: 'Owner' }),
    now: () => new Date('2026-08-17T00:00:00.000Z')
  });

  assert.equal(result.outstanding, 65);
  assert.equal(result.settlement.amount, 25);
  assert.equal(state.settlements.length, 2);
  assert.equal(state.settlements[1].memberId, 'workspace-a_member-a');
  assert.equal(state.settlements[1].createdBy, 'owner-a');
});

test('Finance and other non-manager roles cannot record repayments', async () => {
  const { db, state } = fixture();
  const before = state.settlements.length;

  await assert.rejects(
    recordPersonalExpenseSettlement({
      db,
      requesterId: 'finance-a',
      workspaceId: 'workspace-a',
      memberId: 'workspace-a_member-a',
      amount: 10,
      resolveWorkspaceAccess: async () => ({ workspaceId: 'workspace-a', role: 'Finance' })
    }),
    error => error.code === 'permission-denied'
  );

  assert.equal(state.settlements.length, before);
});

test('a member reference from another Workspace cannot receive a settlement', async () => {
  const { db, state } = fixture();
  state.members.set('workspace-b_member-b', { workspaceId: 'workspace-b', status: 'Active' });
  const before = state.settlements.length;

  await assert.rejects(
    recordPersonalExpenseSettlement({
      db,
      requesterId: 'owner-a',
      workspaceId: 'workspace-a',
      memberId: 'workspace-b_member-b',
      amount: 10,
      resolveWorkspaceAccess: async () => ({ workspaceId: 'workspace-a', role: 'Owner' })
    }),
    error => error.code === 'not-found'
  );

  assert.equal(state.settlements.length, before);
});

test('overpayment is rejected atomically and creates no settlement', async () => {
  const { db, state } = fixture();
  const before = state.settlements.length;

  await assert.rejects(
    recordPersonalExpenseSettlement({
      db,
      requesterId: 'owner-a',
      workspaceId: 'workspace-a',
      memberId: 'workspace-a_member-a',
      amount: 90.01,
      resolveWorkspaceAccess: async () => ({ workspaceId: 'workspace-a', role: 'Owner' })
    }),
    error => error.code === 'failed-precondition'
  );

  assert.equal(state.settlements.length, before);
});

test('cross-workspace requester cannot settle another workspace balance', async () => {
  const { db, state } = fixture();
  const before = state.settlements.length;

  await assert.rejects(
    recordPersonalExpenseSettlement({
      db,
      requesterId: 'owner-b',
      workspaceId: 'workspace-a',
      memberId: 'workspace-a_member-a',
      amount: 10,
      resolveWorkspaceAccess: async () => {
        throw new HttpsError('permission-denied', 'Workspace access denied.');
      }
    }),
    error => error.code === 'permission-denied'
  );

  assert.equal(state.settlements.length, before);
});
