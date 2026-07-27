import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIREBASE_EMULATOR_APP_NAME,
  getExpectedFirebaseAppName,
  shouldMigrateEmulatorAuthUser
} from './firebaseRuntime';

test('local emulators use an isolated Firebase app instead of a stale default app', () => {
  assert.equal(getExpectedFirebaseAppName(true), FIREBASE_EMULATOR_APP_NAME);
  assert.notEqual(getExpectedFirebaseAppName(true), '[DEFAULT]');
  assert.equal(getExpectedFirebaseAppName(false), '[DEFAULT]');
});

test('hot reload migrates an existing authenticated user into the emulator app', () => {
  assert.equal(shouldMigrateEmulatorAuthUser({
    useFirebaseEmulators: true,
    hasCurrentUser: false,
    hasStaleDefaultUser: true
  }), true);

  assert.equal(shouldMigrateEmulatorAuthUser({
    useFirebaseEmulators: true,
    hasCurrentUser: true,
    hasStaleDefaultUser: true
  }), false);
});
