/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const FIREBASE_EMULATOR_APP_NAME = 'misechef-local-emulators';

export const getExpectedFirebaseAppName = (useFirebaseEmulators: boolean) => (
  useFirebaseEmulators ? FIREBASE_EMULATOR_APP_NAME : '[DEFAULT]'
);

export const shouldMigrateEmulatorAuthUser = ({
  useFirebaseEmulators,
  hasCurrentUser,
  hasStaleDefaultUser
}: {
  useFirebaseEmulators: boolean;
  hasCurrentUser: boolean;
  hasStaleDefaultUser: boolean;
}) => (
  useFirebaseEmulators && !hasCurrentUser && hasStaleDefaultUser
);
