import { after, afterEach, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-misechef-store-sets-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
let testEnv;
const now = '2026-08-26T00:00:00.000Z';
const setRecord = (available = true, overrides = {}) => ({
  id: 'breakfast', storeId: 'workspace', workspaceId: 'workspace', name: 'Breakfast Set', description: '',
  photoUrl: 'https://example.test/set.jpg', category: 'Breakfast', price: 7.9, available, sortOrder: 0,
  groups: [{ id: 'main', name: 'Main', required: true, selectionCount: 1, sortOrder: 0, options: [{ productId: 'nasi', priceAdjustment: 0, sortOrder: 0 }] }],
  createdBy: 'owner', createdAt: now, updatedAt: now, ...overrides
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
after(async () => testEnv.cleanup());

const authDb = (uid) => testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
const seedWorkspace = async () => testEnv.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await setDoc(doc(db, 'stores', 'workspace'), { id: 'workspace', workspaceId: 'workspace' });
  await Promise.all([
    setDoc(doc(db, 'workspaceMembers', 'workspace_owner'), { workspaceId: 'workspace', userId: 'owner', role: 'Owner', status: 'Active' }),
    setDoc(doc(db, 'workspaceMembers', 'workspace_manager'), { workspaceId: 'workspace', userId: 'manager', role: 'Manager', status: 'Active' }),
    setDoc(doc(db, 'workspaceMembers', 'workspace_headchef'), { workspaceId: 'workspace', userId: 'headchef', role: 'Head Chef', status: 'Active' }),
    setDoc(doc(db, 'workspaceMembers', 'workspace_chef'), { workspaceId: 'workspace', userId: 'chef', role: 'Chef', status: 'Active' })
  ]);
});

test('owners, managers, and Head Chefs follow the existing product-management authorization model', async () => {
  await seedWorkspace();
  const ownerRef = doc(authDb('owner'), 'storeSets', 'breakfast');
  await assertSucceeds(setDoc(ownerRef, setRecord()));
  await assertSucceeds(setDoc(ownerRef, setRecord(true, { description: 'Owner updated', updatedAt: '2026-08-26T00:30:00.000Z' })));
  await assertSucceeds(setDoc(doc(authDb('manager'), 'storeSets', 'breakfast'), setRecord(true, { price: 8.5, updatedAt: '2026-08-26T01:00:00.000Z' })));
  await assertSucceeds(setDoc(doc(authDb('headchef'), 'storeSets', 'breakfast'), setRecord(false, { price: 8.5, updatedAt: '2026-08-26T01:30:00.000Z' })));
  await assertFails(setDoc(doc(authDb('chef'), 'storeSets', 'breakfast'), setRecord(true, { price: 1 })));
  await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'storeSets', 'guest'), setRecord()));
  await assertSucceeds(deleteDoc(doc(authDb('owner'), 'storeSets', 'breakfast')));
});

test('guests can read active sets but not inactive owner configuration', async () => {
  await seedWorkspace();
  await testEnv.withSecurityRulesDisabled(context => Promise.all([
    setDoc(doc(context.firestore(), 'storeSets', 'breakfast'), setRecord(true)),
    setDoc(doc(context.firestore(), 'storeSets', 'draft'), setRecord(false, { id: 'draft', name: 'Draft Set' }))
  ]));
  const guest = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(guest, 'storeSets', 'breakfast')));
  await assertFails(getDoc(doc(guest, 'storeSets', 'draft')));
  await assertSucceeds(getDoc(doc(authDb('owner'), 'storeSets', 'draft')));
});

test('set updates cannot move ownership to another workspace', async () => {
  await seedWorkspace();
  await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'storeSets', 'breakfast'), setRecord()));
  await assertFails(setDoc(doc(authDb('owner'), 'storeSets', 'breakfast'), setRecord(true, { workspaceId: 'other', storeId: 'other' })));
});

test('set images follow the same Store product-manager boundary and remain publicly readable', async () => {
  await seedWorkspace();
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const path = 'stores/workspace/sets/breakfast/image.png';
  const ownerStorage = testEnv.authenticatedContext('owner').storage();
  const managerStorage = testEnv.authenticatedContext('manager').storage();
  const headChefStorage = testEnv.authenticatedContext('headchef').storage();
  await assertSucceeds(uploadBytes(ref(ownerStorage, path), bytes, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(managerStorage, path), bytes, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(headChefStorage, path), bytes, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(testEnv.authenticatedContext('chef').storage(), path), bytes, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(testEnv.unauthenticatedContext().storage(), path), bytes, { contentType: 'image/png' }));
  await assertSucceeds(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
});
