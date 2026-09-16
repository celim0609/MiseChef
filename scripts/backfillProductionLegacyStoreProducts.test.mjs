import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EXPECTED_PRODUCT_IDS, PRODUCTION_DATABASE_ID, PRODUCTION_PROJECT_ID, PRODUCTION_WORKSPACE_ID,
  WRITE_FIELD_ALLOWLIST, assertProductionMigrationAuthority, buildMigrationPlan, inspectMigrationScope, verifyPostWrite
} from './backfillProductionLegacyStoreProducts.mjs';

const COMPLETE_ID = 'rjxOE4E8vCVBUeNXYko2';
const document = (id, fields = {}) => ({ name: `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/storeProducts/${id}`, fields: {
  name: { stringValue: `Product ${id}` }, workspaceId: { stringValue: PRODUCTION_WORKSPACE_ID }, photoUrl: { stringValue: 'https://example.test/photo.jpg' }, ...fields
} });
const currentDocuments = () => EXPECTED_PRODUCT_IDS.map(id => id === COMPLETE_ID
  ? document(id, { productSlug: { stringValue: 'creamy-matcha-cloud-latte-rjxOE4E8vCVBUeNXYko2' }, socialImageUrl: { stringValue: 'https://example.test/social.jpg' } })
  : document(id));

test('Production legacy Product migration pins its authority and write fields', () => {
  const authority = { projectId: PRODUCTION_PROJECT_ID, databaseId: PRODUCTION_DATABASE_ID, workspaceId: PRODUCTION_WORKSPACE_ID, deploymentTarget: 'production' };
  assert.doesNotThrow(() => assertProductionMigrationAuthority(authority));
  assert.throws(() => assertProductionMigrationAuthority({ ...authority, workspaceId: 'other' }), /workspace/);
  assert.throws(() => assertProductionMigrationAuthority({ ...authority, projectId: 'misechef-beta-fa4bf' }), /pinned/);
  assert.deepEqual(WRITE_FIELD_ALLOWLIST, ['productSlug', 'socialImageUrl']);
});

test('Production migration matches the guarded current 19-Product workspace snapshot and migrates only 18 incomplete Products', () => {
  const targetDocuments = currentDocuments();
  const otherWorkspaceDocuments = ['other-1', 'other-2', 'other-3'].map(id => document(id, { workspaceId: { stringValue: 'other-workspace' } }));
  const documents = [...targetDocuments, ...otherWorkspaceDocuments];
  const plan = buildMigrationPlan(documents);
  assert.equal(EXPECTED_PRODUCT_IDS.length, 19);
  assert.equal(documents.length, 22);
  assert.equal(plan.length, 18);
  assert.equal(plan.some(item => item.id === COMPLETE_ID), false);
  assert.equal(plan.some(item => item.workspaceId !== PRODUCTION_WORKSPACE_ID), false);
  assert.equal(EXPECTED_PRODUCT_IDS.includes('3I9ULaUuMLz4Xc1YAYfx'), true);
  assert.equal(EXPECTED_PRODUCT_IDS.includes('4UgQ7qHDHAaKGz88fGgT'), true);
  assert.equal(EXPECTED_PRODUCT_IDS.includes('NE43JgofeVpd2uQOwdqm'), false);
  assert.equal(EXPECTED_PRODUCT_IDS.includes('sRwaeRC5OCYxxNdtkvRd'), false);
});

test('Production migration diagnostics distinguish complete and migration-candidate Products', () => {
  const documents = currentDocuments();
  const diagnostic = inspectMigrationScope(documents);
  assert.equal(diagnostic.workspaceCount, 19);
  assert.equal(diagnostic.expectedCount, 19);
  assert.deepEqual(diagnostic.unexpected, []);
  assert.deepEqual(diagnostic.missingExpectedIds, []);
  assert.equal(diagnostic.alreadyComplete.length, 1);
  assert.equal(diagnostic.alreadyComplete[0].id, COMPLETE_ID);
  assert.equal(diagnostic.migrationCandidates.length, 18);
});

test('Production migration remains fail-closed for scope drift and partial Share state', () => {
  const documents = currentDocuments();
  assert.throws(() => buildMigrationPlan(documents.slice(1)), /exactly 19/);
  assert.throws(() => buildMigrationPlan([...documents, document('unexpected-target-product')]), /exactly 19/);
  const wrongId = documents.map((item, index) => index ? item : document('wrong-current-id'));
  assert.throws(() => buildMigrationPlan(wrongId), /do not exactly match/);
  const partial = documents.map(item => item.name.endsWith('/3I9ULaUuMLz4Xc1YAYfx')
    ? document('3I9ULaUuMLz4Xc1YAYfx', { productSlug: { stringValue: 'partial-only' } }) : item);
  assert.throws(() => buildMigrationPlan(partial), /partial Product Share state/);
});

test('Post-write verification accepts pre-existing complete Product and verifies migrated protected fields', () => {
  const before = currentDocuments();
  const plan = buildMigrationPlan(before);
  const originals = new Map(plan.map(product => [product.id, JSON.stringify({ name: product.protectedFields.name, photoUrl: product.protectedFields.photoUrl, workspaceId: product.protectedFields.workspaceId })]));
  const after = before.map(item => item.name.endsWith(`/${COMPLETE_ID}`) ? item : ({ ...item, fields: { ...item.fields, productSlug: { stringValue: 'slug' }, socialImageUrl: { stringValue: 'https://example.test/social.jpg' } } }));
  const withOtherWorkspace = [...after, document('other-1', { workspaceId: { stringValue: 'other-workspace' } })];
  assert.doesNotThrow(() => verifyPostWrite(withOtherWorkspace, originals));
});

test('Production migration uses the guarded reader and explicit execute gate', () => {
  const source = readFileSync(new URL('./backfillProductionLegacyStoreProducts.mjs', import.meta.url), 'utf8');
  assert.match(source, /runProductionFirestoreRead/);
  assert.match(source, /requestProductionGoogleApi/);
  assert.doesNotMatch(source, /new GoogleAuth/);
  assert.match(source, /reader => reader\.listCollection\('storeProducts'\)/);
  assert.match(source, /production_product_migration_scope_diagnostic/);
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
