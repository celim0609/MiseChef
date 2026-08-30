import { after, afterEach, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-misechef-homepage-promotion-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
let testEnv;

const promotion = (userId = 'super-admin', overrides = {}) => ({
  eyebrow: 'Featured',
  title: 'A seasonal MiseChef story',
  description: 'A concise campaign description.',
  ctaLabel: 'Explore',
  href: '/recipes',
  linkType: 'internal',
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

const superAdminDb = () => testEnv.authenticatedContext('super-admin', { email: 'celim0609@gmail.com' }).firestore();
const memberDb = () => testEnv.authenticatedContext('member', { email: 'member@example.test' }).firestore();
const superAdminStorage = () => testEnv.authenticatedContext('super-admin', { email: 'celim0609@gmail.com' }).storage();
const memberStorage = () => testEnv.authenticatedContext('member', { email: 'member@example.test' }).storage();

test('only the established MiseChef super-admin boundary can manage homepage promotions', async () => {
  const reference = doc(superAdminDb(), 'homepagePromotions', 'seasonal');
  await assertSucceeds(setDoc(reference, promotion()));
  await assertSucceeds(getDoc(reference));
  await assertSucceeds(updateDoc(reference, { active: false, updatedBy: 'super-admin' }));
  await assertFails(getDoc(doc(memberDb(), 'homepagePromotions', 'seasonal')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'homepagePromotions', 'seasonal')));
  await assertFails(setDoc(doc(memberDb(), 'homepagePromotions', 'member-entry'), promotion('member')));
  await assertFails(deleteDoc(doc(memberDb(), 'homepagePromotions', 'seasonal')));
  await assertSucceeds(deleteDoc(reference));
});

test('promotion validation accepts typed safe destinations and rejects mismatches', async () => {
  const reference = doc(superAdminDb(), 'homepagePromotions', 'safe');
  await assertSucceeds(setDoc(reference, promotion()));
  await assertSucceeds(setDoc(doc(superAdminDb(), 'homepagePromotions', 'external'), promotion('super-admin', {
    href: 'https://misechef.example/campaign', linkType: 'external'
  })));
  await assertSucceeds(setDoc(doc(superAdminDb(), 'homepagePromotions', 'social'), promotion('super-admin', {
    href: 'https://instagram.com/misechef', linkType: 'social', socialPlatform: 'instagram'
  })));
  const legacyPromotion = promotion();
  delete legacyPromotion.linkType;
  await assertSucceeds(setDoc(doc(superAdminDb(), 'homepagePromotions', 'legacy'), legacyPromotion));
  await assertFails(setDoc(doc(superAdminDb(), 'homepagePromotions', 'unsafe'), promotion('super-admin', {
    href: 'javascript:alert(1)', linkType: 'external'
  })));
  await assertFails(setDoc(doc(superAdminDb(), 'homepagePromotions', 'mismatch'), promotion('super-admin', {
    href: 'https://misechef.example', linkType: 'internal'
  })));
  await assertFails(updateDoc(reference, { createdBy: 'someone-else', updatedBy: 'super-admin' }));
});

test('promotion image storage is public-read and super-admin-write only', async () => {
  const path = 'homepage-promotions/seasonal/image-test.jpg';
  const image = new Uint8Array([255, 216, 255, 217]);
  const adminReference = ref(superAdminStorage(), path);
  await assertSucceeds(uploadBytes(adminReference, image, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
  await assertFails(uploadBytes(ref(memberStorage(), 'homepage-promotions/member/image.jpg'), image, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(superAdminStorage(), 'homepage-promotions/seasonal/image.png'), image, { contentType: 'image/png' }));
  await assertFails(deleteObject(ref(memberStorage(), path)));
  await assertSucceeds(deleteObject(adminReference));
});
