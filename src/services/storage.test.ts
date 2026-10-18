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

test('embedded meal uploads keep immutable filenames within the existing Store product permission path', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
  const upload = source.slice(source.indexOf('export const uploadHealthyLunchMealPhoto'), source.indexOf('export const uploadStoreProductSocialImage'));
  assert.match(upload, /stores\/\$\{workspaceId\}\/products\/\$\{productId\}\/meal-\$\{crypto.randomUUID\(\)\}/);
  const deletion = source.slice(source.indexOf('export const deleteStoreProductPhoto'), source.indexOf('export const uploadRecipeCoverImage'));
  assert.ok(deletion.indexOf("startsWith('meal-')") < deletion.indexOf('await deleteObject'));
  assert.match(deletion, /objectPath.startsWith\(expectedPrefix\)/);
});
