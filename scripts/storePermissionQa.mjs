import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  deleteObject,
  getBytes,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from 'firebase/storage';

const PROJECT_ID = 'demo-misechef-preview';
const WORKSPACE_ID = 'qa-workspace-45e';
const BUCKET = `${PROJECT_ID}.appspot.com`;
const require = createRequire(import.meta.url);
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/app/index.js`
);
const { getFirestore: getAdminFirestore } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/firestore/index.js`
);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJECT_ID;

const createClient = async (name, role) => {
  const app = initializeApp({
    apiKey: 'demo-key',
    projectId: PROJECT_ID,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    storageBucket: BUCKET,
    appId: `demo-${name}`
  }, `store-permission-${name}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  const credential = await createUserWithEmailAndPassword(
    auth,
    `${role}-45e@example.test`,
    'LocalQaOnly-45E!'
  );
  return { app, auth, db, storage, uid: credential.user.uid, role };
};

const assertDenied = async (operation, expectedCode) => {
  await assert.rejects(operation, error => {
    assert.equal(error.code, expectedCode);
    return true;
  });
};

const owner = await createClient('owner', 'owner');
const manager = await createClient('manager', 'manager');
const other = await createClient('other', 'other');
const publicApp = initializeApp({
  apiKey: 'demo-key',
  projectId: PROJECT_ID,
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  storageBucket: BUCKET,
  appId: 'demo-public'
}, 'store-permission-public');
const publicDb = getFirestore(publicApp);
const publicStorage = getStorage(publicApp);
connectFirestoreEmulator(publicDb, '127.0.0.1', 8080);
connectStorageEmulator(publicStorage, '127.0.0.1', 9199);

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'store-permission-admin');
const adminDb = getAdminFirestore(adminApp);
const now = new Date().toISOString();
await Promise.all([
  adminDb.doc(`workspaces/${WORKSPACE_ID}`).set({
    id: WORKSPACE_ID,
    name: '45E Permission QA',
    ownerId: owner.uid,
    country: 'MY'
  }),
  adminDb.doc(`workspaceMembers/${WORKSPACE_ID}_${owner.uid}`).set({
    workspaceId: WORKSPACE_ID,
    userId: owner.uid,
    role: 'Owner',
    status: 'Active'
  }),
  adminDb.doc(`workspaceMembers/${WORKSPACE_ID}_${manager.uid}`).set({
    workspaceId: WORKSPACE_ID,
    userId: manager.uid,
    role: 'Manager',
    status: 'Active'
  }),
  adminDb.doc(`workspaceMembers/${WORKSPACE_ID}_${other.uid}`).set({
    workspaceId: WORKSPACE_ID,
    userId: other.uid,
    role: 'Chef',
    status: 'Active'
  }),
  adminDb.doc(`stores/${WORKSPACE_ID}`).set({
    id: WORKSPACE_ID,
    workspaceId: WORKSPACE_ID,
    slug: 'qa-store-45e',
    name: '45E Permission QA Store',
    logoUrl: '',
    coverImageUrl: '',
    description: 'Local permission verification only.',
    contactInformation: '',
    businessWhatsApp: '',
    businessHours: '',
    country: 'MY',
    currency: 'MYR',
    pickupEnabled: true,
    deliveryEnabled: false,
    pickupSessions: ['Morning'],
    pickupLocations: [{ id: 'counter', name: 'Counter', address: 'QA Address', notes: '' }],
    orderDays: ['monday'],
    earliestPickupDays: 1,
    maximumAdvanceDays: 14,
    unavailableDates: [],
    createdBy: owner.uid,
    createdAt: now,
    updatedAt: now
  }),
  adminDb.doc('storeOrders/order-private-45e').set({
    id: 'order-private-45e',
    workspaceId: WORKSPACE_ID,
    storeId: WORKSPACE_ID,
    fulfilmentStatus: 'Paid',
    customerName: 'Private Customer',
    phone: '+60000000000'
  }),
  adminDb.doc('storeOrderTimeline/order-private-45e_payment-received').set({
    orderId: 'order-private-45e',
    workspaceId: WORKSPACE_ID,
    storeId: WORKSPACE_ID,
    label: 'Payment Received'
  }),
  adminDb.doc('storeNotifications/new-paid-order_order-private-45e').set({
    orderId: 'order-private-45e',
    workspaceId: WORKSPACE_ID,
    storeId: WORKSPACE_ID,
    readAt: null
  })
]);

const optionGroup = {
  id: 'qa-options-45e',
  storeId: WORKSPACE_ID,
  workspaceId: WORKSPACE_ID,
  name: 'Size',
  selectionType: 'single',
  required: true,
  minimumSelections: 1,
  maximumSelections: 1,
  sortOrder: 0,
  available: true,
  options: [{
    id: 'regular',
    name: 'Regular',
    priceAdjustment: 0,
    available: true,
    sortOrder: 0
  }],
  createdBy: owner.uid,
  createdAt: now,
  updatedAt: now
};
await setDoc(doc(owner.db, 'storeOptionGroups', optionGroup.id), optionGroup);
await updateDoc(doc(owner.db, 'storeOptionGroups', optionGroup.id), {
  name: 'Serving Size',
  updatedAt: new Date().toISOString()
});

const productId = 'qa-product-45e';
const storagePath = `stores/${WORKSPACE_ID}/products/${productId}/qa-image.png`;
const imageBytes = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7V8AAAAASUVORK5CYII=',
  'base64'
));
const ownerImage = ref(owner.storage, storagePath);
await uploadBytes(ownerImage, imageBytes, { contentType: 'image/png' });
const photoUrl = await getDownloadURL(ownerImage);

const product = {
  id: productId,
  storeId: WORKSPACE_ID,
  workspaceId: WORKSPACE_ID,
  photoUrl,
  name: 'Permission QA Product',
  description: 'Created by the Owner in the local emulator.',
  price: 5.9,
  available: true,
  optionGroupIds: [optionGroup.id],
  createdBy: owner.uid,
  createdAt: now,
  updatedAt: now
};
await setDoc(doc(owner.db, 'storeProducts', productId), product);
await updateDoc(doc(owner.db, 'storeProducts', productId), {
  name: 'Permission QA Product Edited',
  updatedAt: new Date().toISOString()
});
assert.equal((await getDoc(doc(owner.db, 'storeProducts', productId))).data().name, 'Permission QA Product Edited');
assert.equal((await getDoc(doc(publicDb, 'stores', WORKSPACE_ID))).data().slug, 'qa-store-45e');
assert.equal((await getDoc(doc(publicDb, 'storeProducts', productId))).data().available, true);
assert.ok((await getBytes(ref(publicStorage, storagePath))).byteLength > 0);

const managerPath = `stores/${WORKSPACE_ID}/products/manager-product/manager-image.png`;
await uploadBytes(ref(manager.storage, managerPath), imageBytes, { contentType: 'image/png' });
await deleteObject(ref(manager.storage, managerPath));
const managerProduct = {
  ...product,
  id: 'manager-product-45e',
  photoUrl: 'https://example.test/manager-product.png',
  name: 'Manager Permission QA Product',
  optionGroupIds: [],
  createdBy: manager.uid
};
await setDoc(doc(manager.db, 'storeProducts', managerProduct.id), managerProduct);
await updateDoc(doc(manager.db, 'storeProducts', managerProduct.id), {
  name: 'Manager Permission QA Product Edited',
  updatedAt: new Date().toISOString()
});
await deleteDoc(doc(manager.db, 'storeProducts', managerProduct.id));
assert.equal((await getDoc(doc(owner.db, 'storeOrders', 'order-private-45e'))).exists(), true);
assert.equal((await getDoc(doc(manager.db, 'storeOrders', 'order-private-45e'))).exists(), true);
assert.equal((await getDoc(doc(owner.db, 'storeOrderTimeline', 'order-private-45e_payment-received'))).exists(), true);
assert.equal((await getDoc(doc(manager.db, 'storeNotifications', 'new-paid-order_order-private-45e'))).exists(), true);
await updateDoc(
  doc(owner.db, 'storeNotifications', 'new-paid-order_order-private-45e'),
  { readAt: serverTimestamp() }
);

const deniedStoragePath = `stores/${WORKSPACE_ID}/products/other-product/other-image.png`;
await assertDenied(
  uploadBytes(ref(other.storage, deniedStoragePath), imageBytes, { contentType: 'image/png' }),
  'storage/unauthorized'
);
await assertDenied(
  setDoc(doc(other.db, 'storeProducts', 'other-product'), {
    ...product,
    id: 'other-product',
    createdBy: other.uid
  }),
  'permission-denied'
);
await assertDenied(
  getDoc(doc(other.db, 'storeOrders', 'order-private-45e')),
  'permission-denied'
);
await assertDenied(
  getDoc(doc(other.db, 'storeOrderTimeline', 'order-private-45e_payment-received')),
  'permission-denied'
);
await assertDenied(
  getDoc(doc(other.db, 'storeNotifications', 'new-paid-order_order-private-45e')),
  'permission-denied'
);

await deleteDoc(doc(owner.db, 'storeProducts', productId));
await deleteDoc(doc(owner.db, 'storeOptionGroups', optionGroup.id));
await deleteObject(ownerImage);
assert.equal((await adminDb.doc(`storeProducts/${productId}`).get()).exists, false);
await adminDb.doc('storeNotifications/new-paid-order_order-private-45e').update({ readAt: null });

console.log(JSON.stringify({
  workspaceId: WORKSPACE_ID,
  ownerUid: owner.uid,
  managerUid: manager.uid,
  otherUid: other.uid,
  ownerProductCrud: 'passed',
  ownerOptionGroupCrud: 'passed',
  ownerStorageUploadDelete: 'passed',
  managerStorageUploadDelete: 'passed',
  managerProductCrud: 'passed',
  ownerManagerPrivateOrderRead: 'passed',
  ownerManagerTimelineNotificationRead: 'passed',
  ownerNotificationReadUpdate: 'passed',
  otherFirestoreWrite: 'permission-denied',
  otherOrderRead: 'permission-denied',
  otherTimelineNotificationRead: 'permission-denied',
  otherStorageUpload: 'storage/unauthorized',
  publicStoreRead: 'passed',
  publicProductRead: 'passed',
  publicProductImageRead: 'passed',
  exactStoragePath: storagePath
}, null, 2));

await Promise.all([owner.app, manager.app, other.app, publicApp].map(deleteApp));
await deleteAdminApp(adminApp);
