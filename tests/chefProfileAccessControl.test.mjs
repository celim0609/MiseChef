import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { deleteObject, getBytes, listAll, ref, uploadBytes } from 'firebase/storage';
import { buildPublicChefProfileProjection } from '../functions/publicChefProfileProjection.js';

const projectId = 'demo-misechef-chef-profile-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let testEnv;

const profile = (userId, overrides = {}) => ({
  userId,
  basicInfo: {
    fullName: `Chef ${userId}`,
    professionalTitle: 'Sous Chef',
    email: `${userId}@private.example`,
    phone: '+60 123456789',
    summary: 'Professional summary'
  },
  skills: ['Pastry'],
  experiences: [],
  education: [],
  certificates: [],
  awards: [],
  languages: [],
  socialLinks: {},
  portfolio: [],
  visibility: 'private',
  profileSlug: '',
  completionPercentage: 20,
  ...overrides
});

const ownerFirestore = userId => testEnv.authenticatedContext(userId, { email: `${userId}@example.test` }).firestore();
const ownerStorage = userId => testEnv.authenticatedContext(userId, { email: `${userId}@example.test` }).storage();

const reserveAndWriteProfile = async (db, userId, slug, overrides = {}) => {
  const batch = writeBatch(db);
  if (slug) batch.set(doc(db, 'chefProfileSlugs', slug), { userId });
  batch.set(doc(db, 'chefProfiles', userId), profile(userId, { profileSlug: slug, ...overrides }));
  await batch.commit();
};

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

describe('chefProfiles ownership', () => {
  test('signed-in user can create, read, and edit only their own profile', async () => {
    const owner = ownerFirestore('alice');
    const reference = doc(owner, 'chefProfiles', 'alice');
    await assertSucceeds(setDoc(reference, profile('alice')));
    await assertSucceeds(getDoc(reference));
    await assertSucceeds(setDoc(reference, profile('alice', { basicInfo: { ...profile('alice').basicInfo, professionalTitle: 'Executive Chef' } })));
  });

  test('another authenticated user cannot read or edit a private profile', async () => {
    await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'chefProfiles', 'alice'), profile('alice')));
    const bob = ownerFirestore('bob');
    await assertFails(getDoc(doc(bob, 'chefProfiles', 'alice')));
    await assertFails(setDoc(doc(bob, 'chefProfiles', 'alice'), profile('bob')));
  });

  test('anonymous users cannot read private or public canonical profile records', async () => {
    await testEnv.withSecurityRulesDisabled(context => Promise.all([
      setDoc(doc(context.firestore(), 'chefProfiles', 'alice'), profile('alice')),
      setDoc(doc(context.firestore(), 'chefProfiles', 'public-chef'), profile('public-chef', { visibility: 'public', profileSlug: 'public-chef' }))
    ]));
    const anonymous = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, 'chefProfiles', 'alice')));
    await assertFails(getDoc(doc(anonymous, 'chefProfiles', 'public-chef')));
  });

  test('resume import and export-shaped writes cannot bypass ownership', async () => {
    await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'chefProfiles', 'alice'), profile('alice')));
    const attacker = ownerFirestore('mallory');
    await assertFails(setDoc(doc(attacker, 'chefProfiles', 'alice'), profile('alice', {
      basicInfo: { ...profile('alice').basicInfo, summary: 'Imported or export-mutated data' }
    })));
    await assertFails(getDoc(doc(attacker, 'chefProfiles', 'alice')));
  });
});

describe('resume management isolation', () => {
  const resumeRecord = userId => ({
    userId,
    fileName: 'chef-resume.pdf',
    storagePath: `users/${userId}/chef-profile/resume-imports/chef-resume.pdf`,
    contentType: PDF,
    fileSize: 2048,
    importStatus: 'review_required',
    uploadedAt: new Date(),
    draft: { basicInfo: { fullName: 'Draft Chef', professionalTitle: 'Chef' }, experiences: [] }
  });

  test('owner can manage only their private resume metadata and draft', async () => {
    const alice = ownerFirestore('alice');
    const reference = doc(alice, 'chefResumeImports', 'alice');
    await assertSucceeds(setDoc(reference, resumeRecord('alice')));
    await assertSucceeds(getDoc(reference));
    await assertFails(getDoc(doc(ownerFirestore('bob'), 'chefResumeImports', 'alice')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'chefResumeImports', 'alice')));
    await assertFails(setDoc(doc(ownerFirestore('bob'), 'chefResumeImports', 'alice'), resumeRecord('alice')));
  });

  test('resume import status accepts retry-required state with private extracted text', async () => {
    const reference = doc(ownerFirestore('alice'), 'chefResumeImports', 'alice');
    await assertSucceeds(setDoc(reference, resumeRecord('alice')));
    await assertSucceeds(setDoc(reference, {
      ...resumeRecord('alice'),
      importStatus: 'retry_required',
      extractedText: `Professional Summary\n${'Chef experience and responsibilities. '.repeat(4)}`,
      lastError: 'AI service is temporarily busy. Please retry in a few minutes.'
    }));
    await assertSucceeds(setDoc(reference, { ...resumeRecord('alice'), importStatus: 'failed', lastError: 'AI extraction incomplete.', draft: {} }));
    await assertSucceeds(setDoc(reference, { ...resumeRecord('alice'), importStatus: 'imported' }));
    await assertFails(setDoc(reference, { ...resumeRecord('alice'), extractedText: 'too short' }));
    await assertFails(setDoc(reference, { ...resumeRecord('alice'), importStatus: 'processing' }));
  });

  test('deleting resume metadata cannot delete canonical or public profile data', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'chefProfiles', 'alice'), profile('alice'));
      await setDoc(doc(context.firestore(), 'publicChefProfiles', 'chef-alice'), {
        username: 'chef-alice', displayName: 'Chef Alice', professionalTitle: 'Chef',
        skills: [], experience: [], gallery: [], partnerSpotlight: { enabled: false, partners: [] }, publishedAt: ''
      });
    });
    const alice = ownerFirestore('alice');
    const resumeReference = doc(alice, 'chefResumeImports', 'alice');
    await assertSucceeds(setDoc(resumeReference, resumeRecord('alice')));
    await assertSucceeds(deleteDoc(resumeReference));
    await assertSucceeds(getDoc(doc(alice, 'chefProfiles', 'alice')));
    await testEnv.withSecurityRulesDisabled(async context => {
      assert.equal((await getDoc(doc(context.firestore(), 'publicChefProfiles', 'chef-alice'))).exists(), true);
    });
  });
});

describe('public projection privacy', () => {
  test('anonymous users can read only the approved public projection', async () => {
    const approved = {
      username: 'chef-alice',
      displayName: 'Chef Alice',
      professionalTitle: 'Sous Chef',
      skills: ['Pastry'],
      experience: [],
      gallery: [],
      partnerSpotlight: { enabled: false, partners: [] },
      publishedAt: ''
    };
    await testEnv.withSecurityRulesDisabled(context => Promise.all([
      setDoc(doc(context.firestore(), 'chefProfiles', 'alice'), profile('alice', { visibility: 'public', profileSlug: 'chef-alice' })),
      setDoc(doc(context.firestore(), 'publicChefProfiles', 'chef-alice'), approved)
    ]));
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const projection = await assertSucceeds(getDoc(doc(anonymous, 'publicChefProfiles', 'chef-alice')));
    assert.deepEqual(projection.data(), approved);
    await assertFails(getDoc(doc(anonymous, 'chefProfiles', 'alice')));
  });

  test('draft and private fields never appear in the generated projection', () => {
    assert.equal(buildPublicChefProfileProjection(profile('alice')), null);
    const projection = buildPublicChefProfileProjection(profile('alice', {
      visibility: 'public',
      profileSlug: 'chef-alice',
      certificates: [{
        id: 'certificate-1',
        name: 'HACCP',
        issuingOrganisation: 'Training Co',
        attachmentUrl: 'https://storage.example/private.pdf',
        showPublicly: true
      }],
      portfolio: [{
        id: 'portfolio-1',
        title: 'Plated dessert',
        imageUrl: 'https://storage.example/public-image'
      }]
    }));
    const serialized = JSON.stringify(projection);
    assert.ok(projection);
    assert.equal(projection.username, 'chef-alice');
    assert.equal(projection.certificates.length, 1);
    assert.doesNotMatch(serialized, /alice@private[.]example/);
    assert.doesNotMatch(serialized, /[+]60 123456789/);
    assert.doesNotMatch(serialized, /attachmentUrl/);
    assert.doesNotMatch(serialized, /private[.]pdf/);
    assert.doesNotMatch(serialized, /"userId"/);
  });
});

describe('profile slug ownership', () => {
  test('owner can reserve a slug and publish their profile', async () => {
    await assertSucceeds(reserveAndWriteProfile(ownerFirestore('alice'), 'alice', 'chef-alice', { visibility: 'public' }));
  });

  test('slug conflicts are rejected', async () => {
    await assertSucceeds(reserveAndWriteProfile(ownerFirestore('alice'), 'alice', 'shared-slug', { visibility: 'public' }));
    const bob = ownerFirestore('bob');
    await assertFails(setDoc(doc(bob, 'chefProfileSlugs', 'shared-slug'), { userId: 'bob' }));
    await assertFails(setDoc(doc(bob, 'chefProfiles', 'bob'), profile('bob', { visibility: 'public', profileSlug: 'shared-slug' })));
  });

  test('owner cannot change to an unreserved slug and another user cannot change it', async () => {
    await assertSucceeds(reserveAndWriteProfile(ownerFirestore('alice'), 'alice', 'chef-alice', { visibility: 'public' }));
    const alice = ownerFirestore('alice');
    await assertFails(setDoc(doc(alice, 'chefProfiles', 'alice'), profile('alice', { visibility: 'public', profileSlug: 'unreserved' })));
    await assertFails(setDoc(doc(ownerFirestore('bob'), 'chefProfiles', 'alice'), profile('alice', { visibility: 'public', profileSlug: 'chef-bob' })));
  });
});

describe('private Storage attachments', () => {
  test('original resume is readable only by its owner', async () => {
    const path = 'users/alice/chef-profile/resume-imports/unique-resume.pdf';
    await assertSucceeds(uploadBytes(ref(ownerStorage('alice'), path), new Uint8Array([0x25, 0x50, 0x44, 0x46]), { contentType: PDF }));
    await assertSucceeds(getBytes(ref(ownerStorage('alice'), path)));
    await assertFails(getBytes(ref(ownerStorage('bob'), path)));
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
  });

  test('valid DOCX resume is accepted for its owner', async () => {
    const path = 'users/alice/chef-profile/resume-imports/unique-resume.docx';
    await assertSucceeds(uploadBytes(ref(ownerStorage('alice'), path), new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { contentType: DOCX }));
  });

  test('unsupported resume types and oversized resumes are rejected', async () => {
    const storage = ownerStorage('alice');
    await assertFails(uploadBytes(ref(storage, 'users/alice/chef-profile/resume-imports/resume.txt'), new TextEncoder().encode('resume'), { contentType: 'text/plain' }));
    await assertFails(uploadBytes(ref(storage, 'users/alice/chef-profile/resume-imports/resume.pdf'), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: PDF }));
  });

  test('certificate and portfolio attachments remain private', async () => {
    const aliceStorage = ownerStorage('alice');
    const bobStorage = ownerStorage('bob');
    const certificatePath = 'users/alice/chef-profile/certificates/cert-1/certificate.pdf';
    const portfolioPath = 'users/alice/portfolio/gallery/dish.jpg';
    await assertSucceeds(uploadBytes(ref(aliceStorage, certificatePath), new Uint8Array([0x25, 0x50, 0x44, 0x46]), { contentType: PDF }));
    await assertSucceeds(uploadBytes(ref(aliceStorage, portfolioPath), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' }));
    await assertFails(getBytes(ref(bobStorage, certificatePath)));
    await assertFails(getBytes(ref(bobStorage, portfolioPath)));
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), certificatePath)));
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), portfolioPath)));
  });

  test('another user cannot upload into the owner resume path', async () => {
    await assertFails(uploadBytes(
      ref(ownerStorage('bob'), 'users/alice/chef-profile/resume-imports/attacker.pdf'),
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { contentType: PDF }
    ));
  });

  test('only the owner can delete an uploaded resume', async () => {
    const path = 'users/alice/chef-profile/resume-imports/delete-me.pdf';
    await assertSucceeds(uploadBytes(ref(ownerStorage('alice'), path), new Uint8Array([0x25, 0x50, 0x44, 0x46]), { contentType: PDF }));
    await assertFails(deleteObject(ref(ownerStorage('bob'), path)));
    await assertFails(deleteObject(ref(testEnv.unauthenticatedContext().storage(), path)));
    await assertSucceeds(deleteObject(ref(ownerStorage('alice'), path)));
  });

  test('only the owner can discover existing resume files for metadata migration', async () => {
    const folder = 'users/alice/chef-profile/resume-imports';
    await assertSucceeds(uploadBytes(ref(ownerStorage('alice'), `${folder}/existing.pdf`), new Uint8Array([0x25, 0x50, 0x44, 0x46]), { contentType: PDF }));
    const ownerListing = await assertSucceeds(listAll(ref(ownerStorage('alice'), folder)));
    assert.ok(ownerListing.items.some(item => item.name === 'existing.pdf'));
    await assertFails(listAll(ref(ownerStorage('bob'), folder)));
    await assertFails(listAll(ref(testEnv.unauthenticatedContext().storage(), folder)));
  });
});

describe('public enquiries', () => {
  test('public enquiry accepts only safe sender fields and remains unreadable publicly', async () => {
    await testEnv.withSecurityRulesDisabled(context => Promise.all([
      setDoc(doc(context.firestore(), 'publicChefProfileOwnership', 'chef-alice'), { ownerId: 'alice', sourceKey: 'server-only' }),
      setDoc(doc(context.firestore(), 'publicChefProfiles', 'chef-alice'), {
        username: 'chef-alice', displayName: 'Chef Alice', professionalTitle: 'Sous Chef',
        skills: [], experience: [], gallery: [], partnerSpotlight: { enabled: false, partners: [] }, publishedAt: ''
      })
    ]));
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const safeEnquiry = {
      username: 'chef-alice',
      name: 'Potential client',
      email: 'client@example.test',
      message: 'Private event enquiry',
      createdAt: new Date(0).toISOString(),
      status: 'New'
    };
    await assertSucceeds(setDoc(doc(anonymous, 'chefEnquiries', 'safe'), safeEnquiry));
    await assertFails(setDoc(doc(anonymous, 'chefEnquiries', 'leaking'), {
      ...safeEnquiry,
      chefPrivateEmail: 'alice@private.example',
      ownerId: 'alice'
    }));
    await assertFails(getDoc(doc(anonymous, 'chefEnquiries', 'safe')));
  });
});
