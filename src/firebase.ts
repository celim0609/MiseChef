/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  updateCurrentUser,
  type Auth
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import {
  FIREBASE_EMULATOR_APP_NAME,
  getExpectedFirebaseAppName,
  shouldMigrateEmulatorAuthUser
} from './firebaseRuntime';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const useFirebaseEmulators = import.meta.env.DEV
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

const activeFirebaseConfig = useFirebaseEmulators
  ? {
    ...firebaseConfig,
    authDomain: 'demo-misechef-preview.firebaseapp.com',
    projectId: 'demo-misechef-preview',
    storageBucket: 'demo-misechef-preview.appspot.com'
  }
  : firebaseConfig;

const isUsableConfigValue = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== '...' && !trimmed.startsWith('MY_FIREBASE_');
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(isUsableConfigValue);

const expectedFirebaseAppName = getExpectedFirebaseAppName(useFirebaseEmulators);
const existingFirebaseApp = getApps().find(app => app.name === expectedFirebaseAppName);
const staleDefaultFirebaseApp = useFirebaseEmulators
  ? getApps().find(app => app.name === '[DEFAULT]')
  : undefined;

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? existingFirebaseApp
    || (useFirebaseEmulators
      ? initializeApp(activeFirebaseConfig, FIREBASE_EMULATOR_APP_NAME)
      : initializeApp(activeFirebaseConfig))
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
export const functions: Functions | null = firebaseApp ? getFunctions(firebaseApp, 'us-central1') : null;
export const storage: FirebaseStorage | null = firebaseApp ? getStorage(firebaseApp) : null;

if (useFirebaseEmulators && !existingFirebaseApp) {
  if (auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  if (storage) connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export const authPersistenceReady = auth
  ? setPersistence(auth, browserLocalPersistence)
    .then(async () => {
      const staleAuthUser = staleDefaultFirebaseApp
        ? getAuth(staleDefaultFirebaseApp).currentUser
        : null;
      if (!shouldMigrateEmulatorAuthUser({
        useFirebaseEmulators,
        hasCurrentUser: Boolean(auth.currentUser),
        hasStaleDefaultUser: Boolean(staleAuthUser)
      })) return;

      await updateCurrentUser(auth, staleAuthUser);
    })
    .catch(() => {
      // Firebase will fall back to its default persistence if local persistence is unavailable.
    })
  : Promise.resolve();
