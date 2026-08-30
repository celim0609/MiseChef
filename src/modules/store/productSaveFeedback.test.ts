import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  getProductSaveDiagnostic,
  getProductSaveErrorMessage
} from './productSaveFeedback';

test('product validation failures remain visible beside the Save action', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const submitHandler = source.indexOf('onSubmit={handleProductSave}');
  const formStart = source.lastIndexOf('<form', submitHandler);
  const formEnd = source.indexOf('</form>', formStart);
  const form = source.slice(formStart, formEnd);

  assert.ok(submitHandler >= 0);
  assert.ok(formStart >= 0);
  assert.match(form, /role="alert"/);
  assert.match(form, /\{errorMessage\}/);
  assert.match(form, /type="submit"/);
  assert.match(form, /Product Photo <span aria-hidden="true">\*<\/span>/);
});

test('product save failures provide useful, customer-safe messages', () => {
  assert.equal(
    getProductSaveErrorMessage({ code: 'firestore/permission-denied' }, 'product-write'),
    'This product was rejected by the Store security checks. Refresh the page and confirm your Workspace access.'
  );
  assert.equal(
    getProductSaveErrorMessage({ code: 'storage/unauthorized' }, 'photo-upload'),
    'Product photo upload was blocked. Confirm you are the Store Owner, Manager, or Head Chef, then try again.'
  );
  assert.equal(
    getProductSaveErrorMessage(new Error('Product photo is required.'), 'validation'),
    'Product photo is required.'
  );
});

test('subscription and Store data failures are not mislabeled as role failures', () => {
  assert.equal(
    getProductSaveErrorMessage({
      code: 'functions/permission-denied',
      details: { reason: 'subscription-inactive' }
    }, 'authorization'),
    'Your Workspace subscription is not active. Review Subscription before saving products.'
  );
  const malformed = Object.assign(new Error('This Store has stale Workspace information.'), {
    code: 'store/store-identity-mismatch'
  });
  assert.equal(
    getProductSaveErrorMessage(malformed, 'authorization'),
    'This Store has stale Workspace information.'
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
