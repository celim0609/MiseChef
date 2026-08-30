import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getImmediateMediaUrl, getStorageObjectPath, parseStorageReference, resolveStorageUrl, selectResolvedMediaUrl } from './storageReference';

const bucket = 'misechef-beta-fa4bf.firebasestorage.app';
const path = 'users/user-1/profile/avatar.jpg';

test('resolves a stored object path through the configured bucket', async () => {
  const app = initializeApp({ apiKey: 'test', projectId: 'test', storageBucket: bucket }, `storage-path-${Date.now()}`);
  const storage = getStorage(app);
  let resolvedPath = '';
  const url = await resolveStorageUrl(storage, path, async reference => {
    resolvedPath = reference.fullPath;
    return 'https://fresh.example/avatar.jpg';
  });
  assert.equal(resolvedPath, path);
  assert.equal(url, 'https://fresh.example/avatar.jpg');
  await deleteApp(app);
});

test('legacy Firebase download and gs URLs resolve from their stable object path', () => {
  const legacy = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=stale-token`;
  assert.deepEqual(parseStorageReference(legacy), { kind: 'storage', bucket, path });
  assert.equal(getStorageObjectPath(`gs://${bucket}/${path}`, bucket), path);
  assert.equal(getImmediateMediaUrl(legacy), '');
});

test('external and local media URLs remain immediately compatible', () => {
  assert.equal(getImmediateMediaUrl('https://images.example/avatar.jpg'), 'https://images.example/avatar.jpg');
  assert.equal(getImmediateMediaUrl('data:image/jpeg;base64,AA=='), 'data:image/jpeg;base64,AA==');
});

test('Profile page and header can share the same resolved avatar selection', () => {
  const resolved = 'https://fresh.example/avatar.jpg';
  assert.equal(selectResolvedMediaUrl(path, resolved, 'https://auth.example/avatar.jpg'), resolved);
  assert.equal(selectResolvedMediaUrl(path, '', 'https://auth.example/avatar.jpg'), 'https://auth.example/avatar.jpg');
});

test('missing-object errors from download URL resolution remain observable', async () => {
  const app = initializeApp({ apiKey: 'test', projectId: 'test', storageBucket: bucket }, `missing-path-${Date.now()}`);
  const storage = getStorage(app);
  const missing = Object.assign(new Error('Object does not exist.'), { code: 'storage/object-not-found' });
  await assert.rejects(resolveStorageUrl(storage, path, async () => { throw missing; }), error => (
    (error as { code?: string }).code === 'storage/object-not-found'
  ));
  await deleteApp(app);
});

test('rejects cross-environment Storage references', async () => {
  const app = initializeApp({ apiKey: 'test', projectId: 'test', storageBucket: bucket }, `wrong-bucket-${Date.now()}`);
  const storage = getStorage(app);
  await assert.rejects(
    resolveStorageUrl(storage, `gs://misechef-fa4bf.firebasestorage.app/${path}`),
    /different Storage bucket/
  );
  await deleteApp(app);
});
