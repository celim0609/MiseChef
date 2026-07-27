import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublicRoute } from '../public/publicRoutes';
import {
  getPublicOrderingPath,
  getPublicOrderingUrl,
  getStoreQrFileName
} from './customerEntry';

test('shared links and QR codes open the public Store without entering the authenticated app', () => {
  const path = getPublicOrderingPath('ce-lim-kitchen');

  assert.equal(path, '/store/ce-lim-kitchen');
  assert.deepEqual(resolvePublicRoute(path), {
    page: 'store',
    slug: 'ce-lim-kitchen'
  });
  assert.doesNotMatch(path, /^\/app(?:\/|$)/);
  assert.equal(
    getPublicOrderingUrl('https://misechef.ai', 'ce-lim-kitchen'),
    'https://misechef.ai/store/ce-lim-kitchen'
  );
});

test('QR downloads use a stable Store-specific file name', () => {
  assert.equal(getStoreQrFileName('ce-lim-kitchen'), 'ce-lim-kitchen-order-qr.png');
});
