import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-misechef-store-payment-rules';
const BUCKET_URL = `gs://${PROJECT_ID}.appspot.com`;
const WORKSPACE_A = 'workspace-payment-a';
const WORKSPACE_B = 'workspace-payment-b';
const WORKSPACE_SG = 'workspace-payment-sg';
const ORDER_A = 'order-payment-a';
const RECEIPT_PATH = `store-payment-receipts/${WORKSPACE_A}/${ORDER_A}/receipt.png`;
const STORE_CONTACT = {
  phone: '+60123456789',
  email: 'hello@example.test',
  whatsapp: '+60123456789',
  facebook: '',
  instagram: '',
  tiktok: '',
  website: 'https://example.test'
};
const createProductRecord = (id, createdBy = 'owner-a') => ({
  id,
  storeId: WORKSPACE_A,
  workspaceId: WORKSPACE_A,
  photoUrl: `https://example.test/${id}.jpg`,
  name: 'Beta Product',
  description: 'Store product access test',
  price: 5.9,
  available: true,
  optionGroupIds: [],
  createdBy,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z'
});
const createOptionalGroupRecord = (id, createdBy = 'owner-a') => ({
  id,
  storeId: WORKSPACE_A,
  workspaceId: WORKSPACE_A,
  name: 'Add-ons',
  selectionType: 'multiple',
  required: false,
  minimumSelections: 0,
  maximumSelections: 3,
  sortOrder: 0,
  available: true,
  options: [
    { id: 'egg', name: 'Add Egg', priceAdjustment: 1, available: true, sortOrder: 0 },
    { id: 'chicken', name: 'Add Chicken', priceAdjustment: 3, available: true, sortOrder: 1 },
    { id: 'sambal', name: 'Extra Sambal', priceAdjustment: 0.5, available: true, sortOrder: 2 }
  ],
  createdBy,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z'
});
const createStoreRecord = () => ({
  id: WORKSPACE_A,
  workspaceId: WORKSPACE_A,
  slug: 'workspace-payment-a',
  name: 'Payment Kitchen',
  logoUrl: '',
  coverImageUrl: '',
  description: '',
  contactInformation: '',
  businessWhatsApp: STORE_CONTACT.whatsapp,
  storeContact: STORE_CONTACT,
  businessHours: '',
  pickupEnabled: false,
  deliveryEnabled: false,
  pickupSessions: [],
  pickupLocations: [],
  orderDays: ['monday'],
  earliestPickupDays: 0,
  maximumAdvanceDays: 14,
  unavailableDates: [],
  paymentMethods: [
    { id: 'cash_on_pickup', enabled: false, qrCodeUrl: '', instructions: '' },
    { id: 'touch_n_go_qr', enabled: false, qrCodeUrl: '', instructions: '' },
    { id: 'duitnow_qr', enabled: false, qrCodeUrl: '', instructions: '' },
    { id: 'bank_transfer', enabled: false, qrCodeUrl: '', instructions: '' },
    { id: 'stripe', enabled: true, qrCodeUrl: '', instructions: '' }
  ],
  hostProgram: { enabled: false, rewardPercent: 5, minimumQualifyingSales: 0 },
  country: 'MY',
  currency: 'MYR',
  createdBy: 'owner-a',
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z'
});
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

let environment;
let anonymous;
let ownerA;
let managerA;
let headChefA;
let memberA;
let ownerB;
let managerB;
let ownerSg;
let customerA;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules }
  });
  anonymous = environment.unauthenticatedContext();
  ownerA = environment.authenticatedContext('owner-a', { email: 'owner-a@example.test' });
  managerA = environment.authenticatedContext('manager-a', { email: 'manager-a@example.test' });
  headChefA = environment.authenticatedContext('head-chef-a', { email: 'head-chef-a@example.test' });
  memberA = environment.authenticatedContext('member-a', { email: 'member-a@example.test' });
  ownerB = environment.authenticatedContext('owner-b', { email: 'owner-b@example.test' });
  managerB = environment.authenticatedContext('manager-b', { email: 'manager-b@example.test' });
  ownerSg = environment.authenticatedContext('owner-sg', { email: 'owner-sg@example.test' });
  customerA = environment.authenticatedContext('customer-a', { email: 'customer-a@example.test' });

  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      db.doc(`workspaces/${WORKSPACE_A}`).set({ id: WORKSPACE_A, ownerId: 'owner-a', country: 'MY' }),
      db.doc(`workspaces/${WORKSPACE_B}`).set({ id: WORKSPACE_B, ownerId: 'owner-b', country: 'MY' }),
      db.doc(`workspaces/${WORKSPACE_SG}`).set({ id: WORKSPACE_SG, ownerId: 'owner-sg', country: 'SG' }),
      db.doc(`workspaceMembers/${WORKSPACE_A}_owner-a`).set({
        workspaceId: WORKSPACE_A, userId: 'owner-a', role: 'Owner', status: 'Active'
      }),
      db.doc(`workspaceMembers/${WORKSPACE_A}_manager-a`).set({
        workspaceId: WORKSPACE_A, userId: 'manager-a', role: 'Manager', status: 'Active'
      }),
      db.doc(`workspaceMembers/${WORKSPACE_A}_head-chef-a`).set({
        workspaceId: WORKSPACE_A, userId: 'head-chef-a', role: 'Head Chef', status: 'Active'
      }),
      db.doc(`workspaceMembers/${WORKSPACE_A}_member-a`).set({
        workspaceId: WORKSPACE_A, userId: 'member-a', role: 'Chef', status: 'Active'
      }),
      db.doc(`workspaceMembers/${WORKSPACE_B}_manager-b`).set({
        workspaceId: WORKSPACE_B, userId: 'manager-b', role: 'Manager', status: 'Active'
      }),
      db.doc(`workspaceMembers/${WORKSPACE_B}_owner-b`).set({
        workspaceId: WORKSPACE_B, userId: 'owner-b', role: 'Owner', status: 'Active'
      }),
      db.doc(`workspaceMembers/${WORKSPACE_SG}_owner-sg`).set({
        workspaceId: WORKSPACE_SG, userId: 'owner-sg', role: 'Owner', status: 'Active'
      }),
      db.doc(`stores/${WORKSPACE_A}`).set(createStoreRecord()),
      db.doc(`stores/${WORKSPACE_SG}`).set({
        ...createStoreRecord(),
        id: WORKSPACE_SG,
        workspaceId: WORKSPACE_SG,
        slug: 'workspace-payment-sg',
        country: 'SG',
        currency: 'SGD',
        createdBy: 'owner-sg'
      }),
      db.doc(`storeOrders/${ORDER_A}`).set({
        id: ORDER_A,
        customerUid: 'customer-a',
        workspaceId: WORKSPACE_A,
        storeId: WORKSPACE_A,
        status: 'Pending Verification',
        payment: {
          provider: 'manual',
          status: 'pending_verification',
          receiptPath: RECEIPT_PATH,
          reviewedAt: null,
          reviewedBy: ''
        }
      }),
      db.doc('hostProfiles/host-a').set({ userId: 'host-a', status: 'active' }),
      db.doc('hostProfiles/host-b').set({ userId: 'host-b', status: 'active' }),
      db.doc('groupOrders/group-a').set({ id: 'group-a', hostId: 'host-a', workspaceId: WORKSPACE_A, storeId: WORKSPACE_A }),
      db.doc('hostRewardLedger/reward-a').set({ orderId: 'reward-a', hostId: 'host-a', workspaceId: WORKSPACE_A, storeId: WORKSPACE_A })
    ]);
    await context.storage(BUCKET_URL).ref(RECEIPT_PATH).put(
      Uint8Array.from([137, 80, 78, 71]),
      { contentType: 'image/png' }
    );
  });
});

after(async () => {
  await environment?.cleanup();
});

test('server-controlled receipt exists and matching Owner and Manager can read it', async () => {
  assert.equal((await assertSucceeds(ownerA.storage(BUCKET_URL).ref(RECEIPT_PATH).getDownloadURL())).includes('receipt.png'), true);
  assert.equal((await assertSucceeds(managerA.storage(BUCKET_URL).ref(RECEIPT_PATH).getDownloadURL())).includes('receipt.png'), true);
});

test('anonymous, unrelated, and other-Workspace users cannot read a receipt', async () => {
  await assertFails(anonymous.storage(BUCKET_URL).ref(RECEIPT_PATH).getDownloadURL());
  await assertFails(memberA.storage(BUCKET_URL).ref(RECEIPT_PATH).getDownloadURL());
  await assertFails(ownerB.storage(BUCKET_URL).ref(RECEIPT_PATH).getDownloadURL());
  await assertFails(managerB.storage(BUCKET_URL).ref(RECEIPT_PATH).getDownloadURL());
});

test('no client, including the matching Owner or Manager, can write or delete protected receipts', async () => {
  const replacement = Uint8Array.from([1, 2, 3]);
  await assertFails(anonymous.storage(BUCKET_URL).ref(RECEIPT_PATH).put(replacement, { contentType: 'image/png' }));
  await assertFails(ownerA.storage(BUCKET_URL).ref(RECEIPT_PATH).put(replacement, { contentType: 'image/png' }));
  await assertFails(managerA.storage(BUCKET_URL).ref(RECEIPT_PATH).put(replacement, { contentType: 'image/png' }));
  await assertFails(ownerB.storage(BUCKET_URL).ref(RECEIPT_PATH).delete());
});

test('clients cannot create orders or directly mutate payment and approval fields', async () => {
  await assertFails(anonymous.firestore().doc('storeOrders/customer-created').set({
    id: 'customer-created', workspaceId: WORKSPACE_A, payment: { status: 'paid' }
  }));
  await assertFails(ownerA.firestore().doc(`storeOrders/${ORDER_A}`).update({
    status: 'Paid',
    'payment.status': 'paid',
    'payment.reviewedBy': 'owner-a'
  }));
  await assertFails(managerA.firestore().doc(`storeOrders/${ORDER_A}`).update({
    'payment.status': 'rejected',
    'payment.reviewedBy': 'manager-a'
  }));
  await assertFails(ownerB.firestore().doc(`storeOrders/${ORDER_A}`).update({
    'payment.status': 'paid'
  }));
});

test('Host data is private to its account and all Host writes remain server-only', async () => {
  const hostA = environment.authenticatedContext('host-a');
  const hostB = environment.authenticatedContext('host-b');
  await assertSucceeds(hostA.firestore().doc('hostProfiles/host-a').get());
  await assertFails(hostB.firestore().doc('hostProfiles/host-a').get());
  await assertSucceeds(hostA.firestore().doc('groupOrders/group-a').get());
  await assertFails(hostB.firestore().doc('groupOrders/group-a').get());
  await assertFails(ownerB.firestore().doc('groupOrders/group-a').get());
  await assertSucceeds(hostA.firestore().doc('hostRewardLedger/reward-a').get());
  await assertFails(hostB.firestore().doc('hostRewardLedger/reward-a').get());
  await assertFails(hostA.firestore().doc('groupOrders/client-group').set({ hostId: 'host-a', workspaceId: WORKSPACE_A }));
  await assertFails(hostA.firestore().doc('groupOrders/group-a').update({ eligibleSales: 999999 }));
  await assertFails(hostA.firestore().doc('hostRewardLedger/reward-a').update({ rewardAmount: 999999 }));
});

test('only matching Workspace roles with View Orders can read the protected order', async () => {
  await assertSucceeds(ownerA.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertSucceeds(managerA.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertFails(anonymous.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertSucceeds(memberA.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertFails(ownerB.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertFails(managerB.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertFails(customerA.firestore().doc(`storeOrders/${ORDER_A}`).get());
  await assertFails(customerA.firestore().collection('storeOrders').where('customerUid', '==', 'customer-a').get());
});

test('matching Owner and Manager can update validated Store Contact settings', async () => {
  await assertSucceeds(ownerA.firestore().doc(`stores/${WORKSPACE_A}`).update({
    storeContact: { ...STORE_CONTACT, instagram: 'https://instagram.com/payment-kitchen' },
    updatedAt: '2026-08-03T01:00:00.000Z'
  }));
  await assertSucceeds(managerA.firestore().doc(`stores/${WORKSPACE_A}`).update({
    storeContact: { ...STORE_CONTACT, whatsapp: '+60111222333' },
    businessWhatsApp: '+60111222333',
    updatedAt: '2026-08-03T02:00:00.000Z'
  }));
});

test('MY Store can configure Touch ’n Go while SG Store cannot configure or enable it', async () => {
  const malaysiaMethods = createStoreRecord().paymentMethods.map(method => method.id === 'touch_n_go_qr'
    ? { ...method, enabled: true, qrCodeUrl: 'https://storage.test/tng.png', instructions: 'Pay exactly.' }
    : method);
  await assertSucceeds(ownerA.firestore().doc(`stores/${WORKSPACE_A}`).update({
    paymentMethods: malaysiaMethods,
    updatedAt: '2026-08-16T03:00:00.000Z'
  }));

  const singaporeMethods = createStoreRecord().paymentMethods.map(method => method.id === 'touch_n_go_qr'
    ? { ...method, enabled: true, qrCodeUrl: 'https://storage.test/tng.png', instructions: 'Pay exactly.' }
    : method);
  await assertFails(ownerSg.firestore().doc(`stores/${WORKSPACE_SG}`).update({
    paymentMethods: singaporeMethods,
    updatedAt: '2026-08-16T03:00:00.000Z'
  }));
});

test('unrelated users and invalid Store Contact data remain denied', async () => {
  await assertFails(ownerB.firestore().doc(`stores/${WORKSPACE_A}`).update({
    storeContact: { ...STORE_CONTACT, phone: '+6599999999' },
    updatedAt: '2026-08-03T03:00:00.000Z'
  }));
  await assertFails(ownerA.firestore().doc(`stores/${WORKSPACE_A}`).update({
    storeContact: { ...STORE_CONTACT, privateInternalNote: 'must not be stored here' },
    updatedAt: '2026-08-03T03:00:00.000Z'
  }));
});

test('matching Owner can create and Manager can edit a persisted Store product', async () => {
  const productRef = ownerA.firestore().doc('storeProducts/beta-product');
  await assertSucceeds(productRef.set(createProductRecord('beta-product')));
  assert.equal((await assertSucceeds(productRef.get())).data().name, 'Beta Product');

  await assertSucceeds(managerA.firestore().doc('storeProducts/beta-product').update({
    name: 'Beta Product Updated',
    updatedAt: '2026-08-16T01:00:00.000Z'
  }));
  assert.equal((await assertSucceeds(productRef.get())).data().name, 'Beta Product Updated');
});

test('Head Chef can manage products but cannot change Store, payment, or Host settings', async () => {
  await assertSucceeds(headChefA.firestore().doc('storeProducts/head-chef-product').set(
    createProductRecord('head-chef-product', 'head-chef-a')
  ));
  await assertFails(headChefA.firestore().doc(`stores/${WORKSPACE_A}`).update({
    name: 'Unauthorized Settings Change',
    updatedAt: '2026-08-16T04:00:00.000Z'
  }));

  const productPhoto = headChefA.storage(BUCKET_URL)
    .ref(`stores/${WORKSPACE_A}/products/head-chef-product/photo.png`);
  await assertSucceeds(productPhoto.put(Uint8Array.from([137, 80, 78, 71]), { contentType: 'image/png' }));
  await assertFails(headChefA.storage(BUCKET_URL)
    .ref(`stores/${WORKSPACE_A}/branding/logo.png`)
    .put(Uint8Array.from([137, 80, 78, 71]), { contentType: 'image/png' }));
  await assertFails(headChefA.storage(BUCKET_URL)
    .ref(`stores/${WORKSPACE_A}/payment-methods/duitnow_qr/merchant-qr.png`)
    .put(Uint8Array.from([137, 80, 78, 71]), { contentType: 'image/png' }));
});

test('canonical Workspace ownerId authorizes a legacy Owner without a membership document', async () => {
  const workspaceId = 'legacy-owner-workspace';
  const legacyOwner = environment.authenticatedContext('legacy-owner', { email: 'legacy-owner@example.test' });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await db.doc(`workspaces/${workspaceId}`).set({
      id: workspaceId,
      ownerId: 'legacy-owner',
      country: 'MY'
    });
    await db.doc(`stores/${workspaceId}`).set({
      ...createStoreRecord(),
      id: workspaceId,
      workspaceId,
      slug: workspaceId,
      createdBy: 'legacy-owner'
    });
  });

  await assertSucceeds(legacyOwner.firestore().doc('storeProducts/legacy-owner-product').set({
    ...createProductRecord('legacy-owner-product', 'legacy-owner'),
    storeId: workspaceId,
    workspaceId
  }));
});

test('members and users from another Workspace cannot create or edit Store products', async () => {
  await assertFails(memberA.firestore().doc('storeProducts/member-product').set(
    createProductRecord('member-product', 'member-a')
  ));
  await assertFails(ownerB.firestore().doc('storeProducts/foreign-product').set(
    createProductRecord('foreign-product', 'owner-b')
  ));
  await assertFails(managerB.firestore().doc('storeProducts/beta-product').update({
    name: 'Cross-workspace edit',
    updatedAt: '2026-08-16T02:00:00.000Z'
  }));
});

test('Owner can persist an optional option group while Workspace isolation remains enforced', async () => {
  const groupRef = ownerA.firestore().doc('storeOptionGroups/optional-addons');
  await assertSucceeds(groupRef.set(createOptionalGroupRecord('optional-addons')));
  const persisted = (await assertSucceeds(groupRef.get())).data();
  assert.equal(persisted.required, false);
  assert.equal(persisted.minimumSelections, 0);
  assert.equal(persisted.maximumSelections, 3);

  await assertFails(memberA.firestore().doc('storeOptionGroups/member-addons').set(
    createOptionalGroupRecord('member-addons', 'member-a')
  ));
  await assertFails(ownerB.firestore().doc('storeOptionGroups/foreign-addons').set(
    createOptionalGroupRecord('foreign-addons', 'owner-b')
  ));
  await assertFails(managerB.firestore().doc('storeOptionGroups/optional-addons').update({
    maximumSelections: 1,
    updatedAt: '2026-08-16T02:00:00.000Z'
  }));
});
