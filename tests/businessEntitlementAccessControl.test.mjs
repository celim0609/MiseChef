import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-misechef-business-entitlement-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const states = {
  active: { subscriptionPlan: 'professional', subscriptionStatus: 'active' },
  trial: { subscriptionPlan: 'professional', subscriptionStatus: 'trialing', trialEndsAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00.000Z')) },
  free: { subscriptionPlan: 'free', subscriptionStatus: 'active' },
  expired: { subscriptionPlan: 'professional', subscriptionStatus: 'trialing', trialEndsAt: Timestamp.fromDate(new Date('2000-01-01T00:00:00.000Z')) },
  missing: {},
  malformed: { subscriptionPlan: 'professional', subscriptionStatus: 'trialing', trialEndsAt: 'not-a-timestamp' }
};

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules }
  });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [name, entitlement] of Object.entries(states)) {
      const workspaceId = `workspace-${name}`;
      await setDoc(doc(db, 'workspaces', workspaceId), { id: workspaceId, ownerId: `owner-${name}`, ...entitlement });
      await setDoc(doc(db, 'workspaceMembers', `${workspaceId}_owner-${name}`), {
        id: `${workspaceId}_owner-${name}`,
        workspaceId,
        userId: `owner-${name}`,
        role: 'Owner',
        status: 'Active'
      });
      await setDoc(doc(db, 'storeOrders', `order-${name}`), { workspaceId, storeId: workspaceId });
    }
    await setDoc(doc(db, 'storeProducts', 'public-product'), {
      workspaceId: 'workspace-active',
      storeId: 'workspace-active',
      available: true
    });
  });
});

after(async () => environment.cleanup());

const owner = name => environment.authenticatedContext(`owner-${name}`);

test('active paid and unexpired trial owners can access Store operations', async () => {
  for (const name of ['active', 'trial']) {
    await assertSucceeds(getDoc(doc(owner(name).firestore(), 'storeOrders', `order-${name}`)));
    await assertSucceeds(uploadBytes(
      ref(owner(name).storage(), `stores/workspace-${name}/products/product/image.png`),
      new Uint8Array([1]),
      { contentType: 'image/png' }
    ));
  }
});

test('free, expired, missing and malformed entitlement states fail closed', async () => {
  for (const name of ['free', 'expired', 'missing', 'malformed']) {
    await assertFails(getDoc(doc(owner(name).firestore(), 'storeOrders', `order-${name}`)));
    await assertFails(uploadBytes(
      ref(owner(name).storage(), `stores/workspace-${name}/products/product/image.png`),
      new Uint8Array([1]),
      { contentType: 'image/png' }
    ));
  }
});

test('public Store browsing remains subscription-free and customer writes remain server-only', async () => {
  const publicDb = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, 'storeProducts', 'public-product')));
  await assertFails(setDoc(doc(publicDb, 'storeOrders', 'customer-forged-order'), {
    workspaceId: 'workspace-active',
    storeId: 'workspace-active'
  }));
});
