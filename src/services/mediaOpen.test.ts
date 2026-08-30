import test from 'node:test';
import assert from 'node:assert/strict';
import { openResolvedMedia, type MediaPreviewWindow } from './mediaOpen';

const makePreview = () => {
  const state = { replacedWith: '', closed: false };
  const preview: MediaPreviewWindow = {
    opener: {},
    location: { replace: url => { state.replacedWith = url; } },
    close: () => { state.closed = true; }
  };
  return { preview, state };
};

test('a valid stored resume replaces the temporary tab with the real PDF URL', async () => {
  const { preview, state } = makePreview();
  const url = await openResolvedMedia(
    async () => 'https://firebasestorage.googleapis.com/resume.pdf',
    () => preview
  );
  assert.equal(url, 'https://firebasestorage.googleapis.com/resume.pdf');
  assert.equal(state.replacedWith, url);
  assert.equal(state.closed, false);
  assert.equal(preview.opener, null);
});

test('download URL rejection closes the temporary blank tab', async () => {
  const { preview, state } = makePreview();
  const missing = Object.assign(new Error('Object missing'), { code: 'storage/object-not-found' });
  await assert.rejects(openResolvedMedia(async () => { throw missing; }, () => preview), missing);
  assert.equal(state.replacedWith, '');
  assert.equal(state.closed, true);
});
