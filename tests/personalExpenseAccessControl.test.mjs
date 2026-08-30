import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-misechef-personal-expense-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const workspaceA = 'workspace-a';
const workspaceB = 'workspace-b';
const ownerA = 'owner-a';
const ownerB = 'owner-b';
const memberAId = `${workspaceA}_member-a`;
const financeA = 'finance-a';
const financeAId = `${workspaceA}_${financeA}`;
const receiptPath = `personal-expenses/${workspaceA}/${ownerA}/expense-with-receipt/receipt.pdf`;

let testEnv;

const context = userId => testEnv.authenticatedContext(userId, { email: `${userId}@example.test` });
const expense = (id, overrides = {}) => ({
  workspaceId: workspaceA,
  memberId: memberAId,
  amount: 100,
  expenseDate: '2026-08-15',
  description: 'Team supplies',
  category: 'Office',
  createdBy: ownerA,
  createdAt: '2026-08-15T00:00:00.000Z',
  ...(id === 'expense-with-receipt' ? {
    receiptPath,
    receiptUrl: 'https://storage.example/receipt.pdf',
    receiptFileName: 'receipt.pdf'
  } : {}),
  ...overrides
});

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules }
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

after(async () => {
  await testEnv.cleanup();
});

const seedWorkspaces = async () => testEnv.withSecurityRulesDisabled(async rulesDisabled => {
  const db = rulesDisabled.firestore();
  await Promise.all([
    setDoc(doc(db, 'workspaces', workspaceA), { ownerId: ownerA, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
    setDoc(doc(db, 'workspaces', workspaceB), { ownerId: ownerB, subscriptionPlan: 'professional', subscriptionStatus: 'active' }),
    setDoc(doc(db, 'workspaceMembers', `${workspaceA}_${ownerA}`), { workspaceId: workspaceA, userId: ownerA, role: 'Owner', status: 'Active' }),
    setDoc(doc(db, 'workspaceMembers', memberAId), { workspaceId: workspaceA, userId: 'member-a', role: 'Chef', status: 'Active' }),
    setDoc(doc(db, 'workspaceMembers', financeAId), { workspaceId: workspaceA, userId: financeA, role: 'Finance', status: 'Active' }),
    setDoc(doc(db, 'workspaceMembers', `${workspaceB}_${ownerB}`), { workspaceId: workspaceB, userId: ownerB, role: 'Owner', status: 'Active' })
  ]);
});

describe('personal expense integrity and workspace isolation', () => {
  test('an active workspace member records the selected payer and can read the saved expense', async () => {
    await seedWorkspaces();
    const memberDb = context('member-a').firestore();
    const reference = doc(memberDb, 'personalExpenses', 'member-expense');

    await assertSucceeds(setDoc(reference, expense('member-expense', {
      createdBy: 'member-a',
      memberId: financeAId
    })));
    const saved = await assertSucceeds(getDoc(reference));

    assert.equal(saved.data().memberId, financeAId);
    assert.equal(saved.data().workspaceId, workspaceA);
    assert.equal(saved.data().amount, 100);
  });

  test('Owner can read workspace records while Finance keeps member-only visibility and cannot forge settlements', async () => {
    await seedWorkspaces();
    await testEnv.withSecurityRulesDisabled(async rulesDisabled => {
      const db = rulesDisabled.firestore();
      await setDoc(doc(db, 'personalExpenses', 'existing-expense'), expense('existing-expense'));
      await setDoc(doc(db, 'personalExpenseSettlements', 'existing-settlement'), {
        workspaceId: workspaceA,
        memberId: memberAId,
        amount: 25,
        settledAt: '2026-08-16T00:00:00.000Z',
        createdBy: ownerA,
        createdAt: '2026-08-16T00:00:00.000Z'
      });
    });

    await assertSucceeds(getDoc(doc(context(ownerA).firestore(), 'personalExpenses', 'existing-expense')));
    await assertSucceeds(getDoc(doc(context(ownerA).firestore(), 'personalExpenseSettlements', 'existing-settlement')));
    const ownerDb = context(ownerA).firestore();
    const expenseList = await assertSucceeds(getDocs(query(collection(ownerDb, 'personalExpenses'), where('workspaceId', '==', workspaceA))));
    const settlementList = await assertSucceeds(getDocs(query(collection(ownerDb, 'personalExpenseSettlements'), where('workspaceId', '==', workspaceA))));
    assert.equal(expenseList.size, 1);
    assert.equal(settlementList.size, 1);
    await assertSucceeds(getDoc(doc(context('member-a').firestore(), 'personalExpenseSettlements', 'existing-settlement')));
    await assertFails(getDoc(doc(context(financeA).firestore(), 'personalExpenses', 'existing-expense')));
    await assertFails(getDoc(doc(context(financeA).firestore(), 'personalExpenseSettlements', 'existing-settlement')));
    await assertFails(setDoc(doc(context(financeA).firestore(), 'personalExpenseSettlements', 'forged-by-finance'), {
      workspaceId: workspaceA,
      memberId: financeAId,
      amount: 10,
      settledAt: '2026-08-16T00:00:00.000Z',
      createdBy: financeA,
      createdAt: '2026-08-16T00:00:00.000Z'
    }));
  });

  test('protected financial fields are immutable after creation', async () => {
    await seedWorkspaces();
    const ownerDb = context(ownerA).firestore();
    const reference = doc(ownerDb, 'personalExpenses', 'immutable-expense');
    await assertSucceeds(setDoc(reference, expense('immutable-expense')));

    await assertFails(updateDoc(reference, { amount: 101 }));
    await assertFails(updateDoc(reference, { memberId: `${workspaceA}_${ownerA}` }));
    await assertFails(updateDoc(reference, { workspaceId: workspaceB }));
  });

  test('expense creation rejects invalid amounts and payer references outside the Workspace', async () => {
    await seedWorkspaces();
    const ownerDb = context(ownerA).firestore();

    await assertFails(setDoc(doc(ownerDb, 'personalExpenses', 'negative-expense'), expense('negative-expense', { amount: -1 })));
    await assertFails(setDoc(doc(ownerDb, 'personalExpenses', 'foreign-payer'), expense('foreign-payer', {
      memberId: `${workspaceB}_${ownerB}`
    })));
  });

  test('expense creation rejects contaminated, multiline, HTML, and oversized merchant values', async () => {
    await seedWorkspaces();
    const ownerDb = context(ownerA).firestore();
    const contaminatedMerchant = 'TY PASAR RAYA JIMAT SDN BHDங்களுக்கும், அதேபோல சமூக ஊடக தளங்களான முகநூல், இன்ஸ்டாகிராம் மற்றும் ட்விட்டர் ஆகியவற்றில் அதிகம் பயன்படுத்தப்பட்டு வருகிறது.<h2>மீம்கள் உருவான வரலாறு</h2>';

    await assertSucceeds(setDoc(doc(ownerDb, 'personalExpenses', 'valid-merchant'), expense('valid-merchant', {
      merchant: 'TY PASAR RAYA JIMAT SDN BHD'
    })));
    await assertFails(setDoc(doc(ownerDb, 'personalExpenses', 'contaminated-merchant'), expense('contaminated-merchant', {
      merchant: contaminatedMerchant
    })));
    await assertFails(setDoc(doc(ownerDb, 'personalExpenses', 'multiline-merchant'), expense('multiline-merchant', {
      merchant: 'Merchant Name\nReceipt body'
    })));
    await assertFails(setDoc(doc(ownerDb, 'personalExpenses', 'html-merchant'), expense('html-merchant', {
      merchant: '<h2>Merchant Name</h2>'
    })));
    await assertFails(setDoc(doc(ownerDb, 'personalExpenses', 'oversized-merchant'), expense('oversized-merchant', {
      merchant: 'M'.repeat(121)
    })));
  });

  test('workspace B cannot read, change, or directly settle workspace A records', async () => {
    await seedWorkspaces();
    await testEnv.withSecurityRulesDisabled(async rulesDisabled => {
      await setDoc(doc(rulesDisabled.firestore(), 'personalExpenses', 'expense-a'), expense('expense-a'));
    });
    const attackerDb = context(ownerB).firestore();

    await assertFails(getDoc(doc(attackerDb, 'personalExpenses', 'expense-a')));
    await assertFails(updateDoc(doc(attackerDb, 'personalExpenses', 'expense-a'), { amount: 1 }));
    await assertFails(setDoc(doc(attackerDb, 'personalExpenseSettlements', 'forged-settlement'), {
      workspaceId: workspaceA,
      memberId: memberAId,
      amount: 10,
      createdBy: ownerB,
      createdAt: '2026-08-15T00:00:00.000Z',
      settledAt: '2026-08-15T00:00:00.000Z'
    }));
  });

  test('pending receipt is cancel-deletable, then becomes immutable evidence after Save', async () => {
    await seedWorkspaces();
    const owner = context(ownerA);
    const receiptReference = ref(owner.storage(), receiptPath);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await assertSucceeds(uploadBytes(receiptReference, bytes, { contentType: 'application/pdf' }));
    await assertSucceeds(deleteObject(receiptReference));
    await assertSucceeds(uploadBytes(receiptReference, bytes, { contentType: 'application/pdf' }));
    await assertSucceeds(setDoc(
      doc(owner.firestore(), 'personalExpenses', 'expense-with-receipt'),
      expense('expense-with-receipt')
    ));

    await assertSucceeds(getBytes(receiptReference));
    await assertFails(deleteObject(receiptReference));
    await assertFails(uploadBytes(receiptReference, new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' }));
    await assertFails(getBytes(ref(context(ownerB).storage(), receiptPath)));
  });

  test('receipt metadata must be complete and a canonical Workspace Owner can upload', async () => {
    await seedWorkspaces();
    const owner = context(ownerA);
    await assertFails(setDoc(doc(owner.firestore(), 'personalExpenses', 'partial-receipt'), expense('partial-receipt', {
      receiptUrl: 'https://storage.example/incomplete'
    })));

    await testEnv.withSecurityRulesDisabled(async rulesDisabled => {
      await setDoc(doc(rulesDisabled.firestore(), 'workspaceMembers', `${workspaceA}_${ownerA}`), {
        workspaceId: workspaceA,
        userId: ownerA,
        role: 'Owner',
        status: 'Inactive'
      });
    });
    await assertSucceeds(uploadBytes(
      ref(owner.storage(), `personal-expenses/${workspaceA}/${ownerA}/legacy-owner-expense/receipt.pdf`),
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { contentType: 'application/pdf' }
    ));
  });
});
