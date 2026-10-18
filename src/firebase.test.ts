import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { FIREBASE_EMULATOR_APP_NAME, getExpectedFirebaseAppName, shouldMigrateEmulatorAuthUser } from './firebaseRuntime';

const source = readFileSync(new URL('./firebase.ts', import.meta.url), 'utf8');

function startup({ emulator = false, existing = false, failure = '', ready = Promise.resolve() } = {}) {
  const calls: string[] = [];
  const app = { name: getExpectedFirebaseAppName(emulator) };
  const staleUser = { uid: 'emulator-user' };
  const auth = { currentUser: null as null | typeof staleUser, authStateReady: () => ready };
  const persistence = {};
  const resolver = {};
  const env = {
    DEV: emulator, VITE_USE_FIREBASE_EMULATORS: String(emulator),
    VITE_FIREBASE_API_KEY: 'test-key', VITE_FIREBASE_AUTH_DOMAIN: 'test.invalid',
    VITE_FIREBASE_PROJECT_ID: 'test-project', VITE_FIREBASE_STORAGE_BUCKET: 'test-bucket',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: 'test-app'
  };
  const code = transformSync(source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];\n/g, ''), {
    loader: 'ts', format: 'cjs', define: { 'import.meta.env': JSON.stringify(env) }
  }).code;
  const module = { exports: {} as { auth: typeof auth; authPersistenceReady: Promise<void> } };
  runInNewContext(code, {
    module, exports: module.exports,
    FIREBASE_EMULATOR_APP_NAME, getExpectedFirebaseAppName, shouldMigrateEmulatorAuthUser,
    browserLocalPersistence: persistence, browserPopupRedirectResolver: resolver,
    getApps: () => existing ? [app, ...(emulator ? [{ name: '[DEFAULT]' }] : [])] : [],
    initializeApp: () => app,
    initializeAuth: (target: unknown, options: { persistence: unknown; popupRedirectResolver: unknown }) => {
      calls.push('initializeAuth');
      assert.equal(target, app);
      assert.equal(options.persistence, persistence);
      assert.equal(options.popupRedirectResolver, resolver);
      if (failure) throw Object.assign(new Error(failure), { code: failure });
      return auth;
    },
    getAuth: (target: { name: string }) => { calls.push('getAuth'); return target === app ? auth : { currentUser: staleUser }; },
    // A startup persistence migration would remove shared auth storage in another tab.
    setPersistence: () => { throw new Error('Startup must not migrate shared auth storage'); },
    getFirestore: () => ({}), getFunctions: () => ({}), getStorage: () => ({}),
    connectAuthEmulator: () => { calls.push('authEmulator'); },
    connectFirestoreEmulator: () => { calls.push('firestoreEmulator'); },
    connectFunctionsEmulator: () => { calls.push('functionsEmulator'); },
    connectStorageEmulator: () => { calls.push('storageEmulator'); },
    updateCurrentUser: async (_auth: unknown, user: typeof staleUser) => { calls.push('migrateUser'); auth.currentUser = user; }
  });
  return { ...module.exports, calls, instance: auth };
}

test('each tab starts directly with shared local persistence and popup/redirect support', async () => {
  for (let tab = 0; tab < 2; tab += 1) {
    const result = startup();
    await result.authPersistenceReady;
    assert.equal(result.auth, result.instance);
    assert.deepEqual(result.calls, ['initializeAuth']);
  }
  assert.doesNotMatch(source, /\bsetPersistence\b/);
});

test('hot reload reuses existing Auth without switching persistence', async () => {
  const result = startup({ existing: true, failure: 'auth/already-initialized' });
  await result.authPersistenceReady;
  assert.equal(result.auth, result.instance);
  assert.deepEqual(result.calls, ['initializeAuth', 'getAuth']);
});

test('unexpected Auth initialization errors are not hidden', () => {
  assert.throws(() => startup({ failure: 'auth/invalid-api-key' }), /auth\/invalid-api-key/);
});

test('fresh emulator app still connects all Firebase emulators', async () => {
  const result = startup({ emulator: true });
  await result.authPersistenceReady;
  assert.deepEqual(result.calls, ['initializeAuth', 'authEmulator', 'firestoreEmulator', 'functionsEmulator', 'storageEmulator']);
});

test('existing emulator app waits for hydrated Auth before migrating a stale user', async () => {
  let resolve!: () => void;
  const ready = new Promise<void>(done => { resolve = done; });
  const result = startup({ emulator: true, existing: true, ready });
  assert.deepEqual(result.calls, ['initializeAuth']);
  resolve();
  await result.authPersistenceReady;
  assert.deepEqual(result.calls, ['initializeAuth', 'getAuth', 'migrateUser']);
  assert.equal(result.auth.currentUser?.uid, 'emulator-user');
});
