import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';

const PROJECT_ID = 'demo-misechef-preview';
const WORKSPACE_ID = 'qa-ce-lim-workspace';
const OWNER_EMAIL = 'stripe-owner-45e@example.test';
const OWNER_PASSWORD = 'LocalQaOnly-45E!';
const require = createRequire(import.meta.url);
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/app/index.js`
);
const { getFirestore } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/firestore/index.js`
);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJECT_ID;

const clientApp = initializeApp({
  apiKey: 'demo-key',
  projectId: PROJECT_ID,
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  appId: 'stripe-owner-qa'
}, 'stripe-owner-qa');
const auth = getAuth(clientApp);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const credential = await createUserWithEmailAndPassword(auth, OWNER_EMAIL, OWNER_PASSWORD);

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'stripe-owner-qa-admin');
const db = getFirestore(adminApp);
await Promise.all([
  db.doc(`workspaces/${WORKSPACE_ID}`).set({
    id: WORKSPACE_ID,
    name: 'Ce Lim Kitchen — Sandbox',
    ownerId: credential.user.uid,
    country: 'MY'
  }),
  db.doc(`workspaceMembers/${WORKSPACE_ID}_${credential.user.uid}`).set({
    workspaceId: WORKSPACE_ID,
    userId: credential.user.uid,
    role: 'Owner',
    status: 'Active'
  })
]);

console.log(JSON.stringify({
  workspaceId: WORKSPACE_ID,
  ownerUid: credential.user.uid,
  ownerEmail: OWNER_EMAIL
}, null, 2));

await deleteApp(clientApp);
await deleteAdminApp(adminApp);
