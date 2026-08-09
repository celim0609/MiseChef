import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectClientProvisioningDisplayName,
  selectProvisionedDisplayName,
  shouldShowWorkspaceSetup
} from './newUserProvisioningModel';

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

test('first-session UI falls back to the provisioned profile while the Auth object refreshes', () => {
  assert.equal(selectProvisionedDisplayName({
    authDisplayName: '',
    profileName: 'Nur Iman'
  }), 'Nur Iman');
  assert.equal(selectProvisionedDisplayName({
    authDisplayName: 'Updated Auth Name',
    profileName: 'Nur Iman'
  }), 'Updated Auth Name');
});
