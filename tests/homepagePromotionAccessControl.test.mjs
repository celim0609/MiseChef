import { after, afterEach, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-misechef-homepage-promotion-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let testEnv;

const promotion = (userId = 'super-admin', overrides = {}) => ({
  eyebrow: 'Featured',
  title: 'A seasonal MiseChef story',
  description: 'A concise campaign description.',
  ctaLabel: 'Explore',
  href: '/recipes',
  imageUrl: 'https://images.example.test/seasonal.jpg',
  active: true,
  sortOrder: 0,
  createdAt: Timestamp.fromDate(new Date('2026-08-27T00:00:00.000Z')),
  updatedAt: Timestamp.fromDate(new Date('2026-08-27T00:00:00.000Z')),
  createdBy: userId,
  updatedBy: userId,
  ...overrides
});

before(async () => {
  testEnv = await initializeTestEnvironment({ projectId, firestore: { rules: firestoreRules } });
});
afterEach(async () => testEnv.clearFirestore());
after(async () => testEnv.cleanup());

const superAdminDb = () => testEnv.authenticatedContext('super-admin', { email: 'celim0609@gmail.com' }).firestore();
const memberDb = () => testEnv.authenticatedContext('member', { email: 'member@example.test' }).firestore();

test('only the established MiseChef super-admin boundary can manage homepage promotions', async () => {
  const reference = doc(superAdminDb(), 'homepagePromotions', 'seasonal');
  await assertSucceeds(setDoc(reference, promotion()));
  await assertSucceeds(getDoc(reference));
  await assertSucceeds(updateDoc(reference, { active: false, updatedBy: 'super-admin' }));
  await assertFails(getDoc(doc(memberDb(), 'homepagePromotions', 'seasonal')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'homepagePromotions', 'seasonal')));
  await assertFails(setDoc(doc(memberDb(), 'homepagePromotions', 'member-entry'), promotion('member')));
  await assertFails(deleteDoc(reference));
});

test('promotion validation rejects unsafe destinations and ownership changes', async () => {
  const reference = doc(superAdminDb(), 'homepagePromotions', 'safe');
  await assertFails(setDoc(reference, promotion('super-admin', { href: 'javascript:alert(1)' })));
  await assertSucceeds(setDoc(reference, promotion()));
  await assertFails(updateDoc(reference, { createdBy: 'someone-else', updatedBy: 'super-admin' }));
});
