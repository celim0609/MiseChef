import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EXPECTED_PRODUCT_IDS, PRODUCTION_DATABASE_ID, PRODUCTION_PROJECT_ID, PRODUCTION_WORKSPACE_ID,
  WRITE_FIELD_ALLOWLIST, assertProductionMigrationAuthority, buildMigrationPlan, verifyPostWrite
} from './backfillProductionLegacyStoreProducts.mjs';

const document = (id, fields = {}) => ({ name: `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/storeProducts/${id}`, fields: {
  name: { stringValue: `Product ${id}` }, workspaceId: { stringValue: PRODUCTION_WORKSPACE_ID }, photoUrl: { stringValue: 'https://example.test/photo.jpg' }, ...fields
} });

test('Production legacy Product migration pins its authority and write fields', () => {
  const authority = { projectId: PRODUCTION_PROJECT_ID, databaseId: PRODUCTION_DATABASE_ID, workspaceId: PRODUCTION_WORKSPACE_ID, deploymentTarget: 'production' };
  assert.doesNotThrow(() => assertProductionMigrationAuthority(authority));
  assert.throws(() => assertProductionMigrationAuthority({ ...authority, workspaceId: 'other' }), /workspace/);
  assert.throws(() => assertProductionMigrationAuthority({ ...authority, projectId: 'misechef-beta-fa4bf' }), /pinned/);
  assert.deepEqual(WRITE_FIELD_ALLOWLIST, ['productSlug', 'socialImageUrl']);
});

test('Production migration rejects scope drift, existing values, and slug collisions', () => {
  const documents = EXPECTED_PRODUCT_IDS.map(id => document(id));
  const plan = buildMigrationPlan(documents);
  assert.equal(plan.length, 18);
  assert.equal(new Set(plan.map(item => item.proposedSlug)).size, 18);
  assert.throws(() => buildMigrationPlan(documents.slice(1)), /exactly 18/);
  assert.throws(() => buildMigrationPlan(documents.map((item, index) => index ? item : document(EXPECTED_PRODUCT_IDS[0], { productSlug: { stringValue: 'existing' } }))), /overwrite/);
  assert.throws(() => buildMigrationPlan(documents.map((item, index) => index ? item : document(EXPECTED_PRODUCT_IDS[0], { workspaceId: { stringValue: 'other' } }))), /workspace/);
  const originals = new Map(plan.map(product => [product.id, JSON.stringify({ name: product.protectedFields.name, photoUrl: product.protectedFields.photoUrl, workspaceId: product.protectedFields.workspaceId })]));
  const verified = documents.map(item => ({ ...item, fields: { ...item.fields, productSlug: { stringValue: 'slug' }, socialImageUrl: { stringValue: 'https://example.test/social.jpg' } } }));
  assert.doesNotThrow(() => verifyPostWrite(verified, originals));
});

test('Production migration uses the guarded reader and explicit execute gate', () => {
  const source = readFileSync(new URL('./backfillProductionLegacyStoreProducts.mjs', import.meta.url), 'utf8');
  assert.match(source, /runProductionFirestoreRead/);
  assert.match(source, /requestProductionGoogleApi/);
  assert.doesNotMatch(source, /new GoogleAuth/);
  assert.match(source, /reader => reader\.listCollection\('storeProducts'\)/);
  assert.match(source, /if \(!execute\) return/);
  assert.match(source, /transaction\.update\(ref, \{ productSlug: product\.proposedSlug, socialImageUrl \}\)/);
  assert.doesNotMatch(source, /db\.collection\('storeProducts'\)/);
});

test('Production migration workflow is main-only, environment-gated, and defaults to dry run', () => {
  const workflow = readFileSync(new URL('../.github/workflows/production-legacy-product-migration.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.match(workflow, /default: DRY_RUN/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT_MISECHEF_PRODUCTION/);
  assert.match(workflow, /EXECUTE PRODUCTION PRODUCT MIGRATION/);
  assert.match(workflow, /backfill:legacy-store-products:production -- --execute/);
  assert.doesNotMatch(workflow, /firebase deploy/);
});
