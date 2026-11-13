import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { editPersonalExpense } from '../functions/personalExpenseEdits.js';
import { recordPersonalExpenseSettlement } from '../functions/personalExpenseSettlements.js';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

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
let adminApp;
let adminDb;

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
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Tests require the Firestore emulator');
  adminApp = initializeApp({ projectId });
  adminDb = getFirestore(adminApp);
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
  await deleteApp(adminApp);
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
  test('Starter Owners and Managers can list active teammates and save expenses for them', async () => {
    await seedWorkspaces();
    const manager = 'manager-a';
    await testEnv.withSecurityRulesDisabled(async rulesDisabled => {
      const db = rulesDisabled.firestore();
      await updateDoc(doc(db, 'workspaces', workspaceA), { subscriptionPlan: 'starter' });
      await setDoc(doc(db, 'workspaceMembers', `${workspaceA}_${manager}`), {
        workspaceId: workspaceA, userId: manager, role: 'Manager', status: 'Active'
      });
      await setDoc(doc(db, 'workspaceMembers', `${workspaceA}_removed`), {
        workspaceId: workspaceA, userId: 'removed', role: 'Chef', status: 'Removed'
      });
    });

    const activeTeam = (db, workspaceId) => query(collection(db, 'workspaceMembers'),
      where('workspaceId', '==', workspaceId), where('status', '==', 'Active'));
    for (const userId of [ownerA, manager]) {
      const db = context(userId).firestore();
      const roster = await assertSucceeds(getDocs(activeTeam(db, workspaceA)));
      assert.deepEqual(roster.docs.map(member => member.id).sort(),
        [memberAId, financeAId, `${workspaceA}_${ownerA}`, `${workspaceA}_${manager}`].sort());
      await assertFails(getDocs(activeTeam(db, workspaceB)));
      const id = `expense-by-${userId}`;
      const reference = doc(db, 'personalExpenses', id);
      await assertSucceeds(setDoc(reference, expense(id, { createdBy: userId, memberId: financeAId })));
      assert.equal((await assertSucceeds(getDoc(reference))).data().memberId, financeAId);
    }
    await assertFails(getDocs(activeTeam(context('member-a').firestore(), workspaceA)));
  });

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

  test('clients cannot bypass the expense edit callable', async () => {
    await seedWorkspaces();
    const ownerDb = context(ownerA).firestore();
    const reference = doc(ownerDb, 'personalExpenses', 'immutable-expense');
    await assertSucceeds(setDoc(reference, expense('immutable-expense')));

    await assertFails(updateDoc(reference, { amount: 101 }));
    await assertFails(updateDoc(reference, { description: 'Bypassed the callable' }));
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

describe('personal expense edit transactions', () => {
  const expenseId = 'expense-with-receipt';
  const reference = () => adminDb.collection('personalExpenses').doc(expenseId);
  const original = expense(expenseId);
  const edit = (overrides = {}) => editPersonalExpense({
    db: adminDb,
    requesterId: ownerA,
    workspaceId: workspaceA,
    expenseId,
    expectedVersion: '',
    draft: original,
    ...overrides
  });

  test('Starter Manager edits an existing record with an atomic audit and idempotent retries', async () => {
    await seedWorkspaces();
    await adminDb.collection('workspaces').doc(workspaceA).update({ subscriptionPlan: 'starter' });
    const manager = 'manager-a';
    await adminDb.collection('workspaceMembers').doc(`${workspaceA}_${manager}`).set({
      workspaceId: workspaceA, userId: manager, role: 'Manager', status: 'Active'
    });
    await reference().set(original);
    const draft = { ...original, amount: 70.23, memberId: financeAId, expenseDate: '2026-08-17',
      description: 'Corrected description', category: 'Equipment' };
    const submit = () => edit({ requesterId: manager, draft });
    await Promise.all([submit(), submit()]);
    const edited = (await reference().get()).data();
    assert.deepEqual(edited, { ...draft, editVersion: edited.editVersion });
    const history = await reference().collection('editHistory').get();
    assert.equal(history.size, 1);
    const audit = history.docs[0].data();
    assert.equal(audit.editedBy, manager);
    assert.equal(audit.previous.amount, 100);
    assert.equal(audit.updated.amount, 70.23);
    assert.equal(audit.previous.memberId, memberAId);
    assert.equal(audit.updated.memberId, financeAId);
    await assert.rejects(edit({ draft: { ...draft, amount: 99 } }), { code: 'failed-precondition' });
    await edit({ expectedVersion: edited.editVersion, draft: { ...draft, description: 'Second edit' } });
    await submit();
    assert.equal((await reference().get()).data().description, 'Second edit');
    assert.equal((await reference().collection('editHistory').get()).size, 2);

    const clientAudit = doc(context(ownerA).firestore(), 'personalExpenses', expenseId, 'editHistory', 'original');
    await assertFails(updateDoc(clientAudit, { editedBy: ownerA }));
    await assertFails(setDoc(clientAudit, { editedBy: ownerA }));
  });

  test('denies Finance, foreign workspaces, invalid paying members and invalid dates', async () => {
    await seedWorkspaces();
    await reference().set(original);
    await assert.rejects(edit({ requesterId: financeA }), { code: 'permission-denied' });
    await assert.rejects(edit({ requesterId: ownerB }), { code: 'permission-denied' });
    await assert.rejects(edit({ requesterId: ownerB, workspaceId: workspaceB }), { code: 'not-found' });
    await assert.rejects(edit({ draft: { ...original, memberId: `${workspaceB}_${ownerB}` } }),
      { code: 'failed-precondition' });
    await assert.rejects(edit({ draft: { ...original, expenseDate: '2026-02-30' } }), { code: 'invalid-argument' });
    await assert.rejects(edit({ draft: { ...original, amount: -1 } }), { code: 'invalid-argument' });
    assert.deepEqual((await reference().get()).data(), original);
    assert.equal((await reference().collection('editHistory').get()).size, 0);
  });

  for (const amount of [25, 100]) {
    test(`protects financial fields after a ${amount === 100 ? 'full' : 'partial'} repayment`, async () => {
      await seedWorkspaces();
      await reference().set(original);
      await recordPersonalExpenseSettlement({ db: adminDb, requesterId: ownerA, workspaceId: workspaceA, memberId: memberAId, amount });
      for (const change of [{ amount: 70 }, { expenseDate: '2026-08-17' }, { memberId: financeAId }]) {
        await assert.rejects(edit({ draft: { ...original, ...change } }), { code: 'failed-precondition' });
      }
      await edit({ draft: { ...original, description: 'New description', category: 'Equipment' } });
      const saved = (await reference().get()).data();
      assert.equal(saved.description, 'New description');
      assert.equal(saved.category, 'Equipment');
      assert.equal(saved.amount, original.amount);
      assert.equal(saved.expenseDate, original.expenseDate);
      assert.equal(saved.memberId, original.memberId);
    });
  }

  test('concurrent edits and repayments cannot create an overpayment', async () => {
    await seedWorkspaces();
    await reference().set(original);
    const results = await Promise.allSettled([
      edit({ draft: { ...original, amount: 40 } }),
      recordPersonalExpenseSettlement({ db: adminDb, requesterId: ownerA, workspaceId: workspaceA, memberId: memberAId, amount: 80 })
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'failed-precondition');
    const saved = (await reference().get()).data();
    const repayments = await adminDb.collection('personalExpenseSettlements').get();
    assert.ok(repayments.docs.reduce((sum, item) => sum + item.data().amount, 0) <= saved.amount);
  });
});
