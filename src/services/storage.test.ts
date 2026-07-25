import assert from 'node:assert/strict';
import test from 'node:test';
import { FirebaseError } from 'firebase/app';
import { getStorageUploadErrorMessage } from './storageError';

test('Store image permission failures are explained in chef-friendly language', () => {
  const message = getStorageUploadErrorMessage(
    new FirebaseError('storage/unauthorized', 'User does not have permission.'),
    'Product photo'
  );

  assert.equal(
    message,
    'Product photo upload was blocked. Confirm you are the Store Owner or Manager, then try again.'
  );
  assert.doesNotMatch(message, /storage\/unauthorized/);
});

test('unexpected upload failures still identify the failed action', () => {
  assert.equal(
    getStorageUploadErrorMessage(new Error('Network unavailable.'), 'Product photo'),
    'Product photo upload failed. Network unavailable.'
  );
});
