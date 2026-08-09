import assert from 'node:assert/strict';
import test from 'node:test';
import { selectClientProvisioningDisplayName, shouldShowWorkspaceSetup } from './newUserProvisioningModel';

test('registration uses the entered name while Auth displayName is still empty', () => {
  assert.equal(selectClientProvisioningDisplayName({
    enteredName: 'Nur Iman',
    authDisplayName: null,
    email: 'nur@example.test'
  }), 'Nur Iman');
});

test('protected app stays behind neutral setup state until provisioning is ready', () => {
  assert.equal(shouldShowWorkspaceSetup({
    hasUser: true,
    isGuestMode: false,
    isAppPath: true,
    status: 'loading'
  }), true);
  assert.equal(shouldShowWorkspaceSetup({
    hasUser: true,
    isGuestMode: false,
    isAppPath: true,
    status: 'error'
  }), true);
  assert.equal(shouldShowWorkspaceSetup({
    hasUser: true,
    isGuestMode: false,
    isAppPath: true,
    status: 'ready'
  }), false);
});
