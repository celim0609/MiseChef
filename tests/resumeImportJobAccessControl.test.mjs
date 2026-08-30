import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const projectId = 'demo-misechef-resume-import-jobs';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules }
  });
  await testEnv.withSecurityRulesDisabled(context => setDoc(
    doc(context.firestore(), 'users', 'alice', 'resumeImportJobs', 'job-1'),
    { uid: 'alice', status: 'pending' }
  ));
});

after(async () => testEnv.cleanup());

test('only the matching authenticated owner can read and listen to resume import jobs', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const anonymous = testEnv.unauthenticatedContext().firestore();
  const path = ['users', 'alice', 'resumeImportJobs', 'job-1'];

  await assertSucceeds(getDoc(doc(alice, ...path)));
  await assertSucceeds(getDocs(collection(alice, 'users', 'alice', 'resumeImportJobs')));
  await assertFails(getDoc(doc(bob, ...path)));
  await assertFails(getDoc(doc(anonymous, ...path)));
});

test('clients cannot create or modify server-owned resume import jobs', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(
    doc(alice, 'users', 'alice', 'resumeImportJobs', 'job-2'),
    { uid: 'alice', status: 'done' }
  ));
});
