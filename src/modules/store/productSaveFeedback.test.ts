import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  getProductSaveDiagnostic,
  getProductSaveErrorMessage
} from './productSaveFeedback';

test('product validation failures remain visible beside the Save action', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const formStart = source.indexOf('<form onSubmit={handleProductSave}');
  const formEnd = source.indexOf('</form>', formStart);
  const form = source.slice(formStart, formEnd);

  assert.ok(formStart >= 0);
  assert.match(form, /role="alert"/);
  assert.match(form, /\{errorMessage\}/);
  assert.match(form, /type="submit"/);
  assert.match(form, /Product Photo <span aria-hidden="true">\*<\/span>/);
});

test('product save failures provide useful, customer-safe messages', () => {
  assert.equal(
    getProductSaveErrorMessage({ code: 'firestore/permission-denied' }, 'product-write'),
    'This product could not be saved because you do not have permission for this Store.'
  );
  assert.equal(
    getProductSaveErrorMessage({ code: 'storage/unauthorized' }, 'photo-upload'),
    'Product photo upload was blocked. Confirm you are the Store Owner or Manager, then try again.'
  );
  assert.equal(
    getProductSaveErrorMessage(new Error('Product photo is required.'), 'validation'),
    'Product photo is required.'
  );
});

test('technical diagnostics identify the failed stage without an authenticated UID', () => {
  assert.deepEqual(getProductSaveDiagnostic({
    error: { code: 'firestore/permission-denied' },
    stage: 'product-write',
    workspaceId: 'workspace-a',
    storeId: 'workspace-a',
    operation: 'create'
  }), {
    operation: 'create',
    stage: 'product-write',
    code: 'firestore/permission-denied',
    message: 'Unknown product save failure',
    workspaceId: 'workspace-a',
    storeId: 'workspace-a',
    identifiersMatch: true
  });
});
