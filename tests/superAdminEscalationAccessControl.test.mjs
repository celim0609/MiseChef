import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'demo-misechef-super-admin-escalation-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules }
  });

  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();

    await setDoc(doc(db, 'users', 'attacker'), {
      displayName: 'Attacker'
    });

    await setDoc(doc(db, 'users', 'victim'), {
      displayName: 'Victim'
    });
  });
});

after(async () => environment.cleanup());

test('self-written super_admin role does not grant Firestore super-admin access', async () => {
  const attackerDb = environment.authenticatedContext('attacker').firestore();

  // Current profile rules allow a user to write their own document.
  await assertSucceeds(setDoc(doc(attackerDb, 'users', 'attacker'), {
    displayName: 'Attacker',
    role: 'super_admin'
  }));

  // The self-written role must never grant access to another user's document.
  await assertFails(getDoc(doc(attackerDb, 'users', 'victim')));
});
