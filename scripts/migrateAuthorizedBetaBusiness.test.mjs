import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESTINATION,
  EXCLUDED_COLLECTIONS,
  EXCLUDED_DANGLING_PRICE_HISTORY,
  EXPECTED_COUNTS,
  FIRESTORE_ALLOWLIST,
  SOURCE,
  STORAGE_ALLOWLIST
} from './authorizedBetaBusinessMigrationManifest.mjs';
import {
  getDestinationPath,
  getFirestoreCount,
  transformDocument,
  validateTransformedDocument
} from './migrateAuthorizedBetaBusiness.mjs';

test('fixed manifests have exact counts and unique source/destination keys', () => {
  assert.equal(getFirestoreCount(), EXPECTED_COUNTS.firestoreSource);
  assert.equal(STORAGE_ALLOWLIST.length, EXPECTED_COUNTS.storageSource);
  const firestorePaths = Object.entries(FIRESTORE_ALLOWLIST)
    .flatMap(([collection, ids]) => ids.map(id => `${collection}/${id}`));
  assert.equal(new Set(firestorePaths).size, firestorePaths.length);
  assert.equal(new Set(STORAGE_ALLOWLIST.map(item => item.sourcePath)).size, STORAGE_ALLOWLIST.length);
  assert.equal(new Set(STORAGE_ALLOWLIST.map(item => item.destinationPath)).size, STORAGE_ALLOWLIST.length);
});

test('only the two unrecoverable dangling price histories are explicitly excluded', () => {
  assert.deepEqual(EXCLUDED_DANGLING_PRICE_HISTORY, [
    'Ne332R6FT3ugSpHbiooz',
    'sxltBmx7WQQg95zpx68m'
  ]);
  assert.equal(FIRESTORE_ALLOWLIST.ingredientPriceHistory.length, 60);
  for (const id of EXCLUDED_DANGLING_PRICE_HISTORY) {
    assert(!FIRESTORE_ALLOWLIST.ingredientPriceHistory.includes(id), `${id} must not be migrated`);
  }
  assert.equal(EXPECTED_COUNTS.firestoreSource, 208);
  assert.equal(EXPECTED_COUNTS.firestoreCreates, 207);
  assert.equal(EXPECTED_COUNTS.firestoreUpdates, 2);
});

test('store and Host Profile document IDs are deterministically re-homed', () => {
  assert.equal(
    getDestinationPath(`stores/${SOURCE.workspaceId}`),
    `stores/${DESTINATION.workspaceId}`
  );
  assert.equal(
    getDestinationPath(`hostProfiles/${SOURCE.ownerUid}`),
    `hostProfiles/${DESTINATION.ownerUid}`
  );
});

test('recipe canonical ownership is valid while historical authorship stays in provenance', () => {
  const sourcePath = 'recipes/recipe_test';
  const transformed = transformDocument(sourcePath, {
    fields: {
      workspaceId: { stringValue: SOURCE.workspaceId },
      companyId: { stringValue: SOURCE.workspaceId },
      userId: { stringValue: SOURCE.otherRecipeAuthorUid },
      createdBy: { stringValue: SOURCE.otherRecipeAuthorUid },
      createdByName: { stringValue: 'Historical Chef' },
      imageUrl: {
        stringValue: `https://firebasestorage.googleapis.com/v0/b/${SOURCE.bucket}/o/recipes%2F${SOURCE.workspaceId}%2Frecipe_test%2Fcover.jpg?alt=media`
      }
    }
  });

  assert.equal(transformed.fields.userId.stringValue, DESTINATION.ownerUid);
  assert.equal(transformed.fields.createdBy.stringValue, DESTINATION.ownerUid);
  assert.equal(transformed.fields.createdByName.stringValue, 'Historical Chef');
  const provenance = transformed.fields.migrationProvenance.mapValue.fields;
  assert.equal(provenance.originalUserId.stringValue, SOURCE.otherRecipeAuthorUid);
  assert.equal(provenance.originalCreatedBy.stringValue, SOURCE.otherRecipeAuthorUid);
  assert.equal(provenance.originalCreatedByName.stringValue, 'Historical Chef');
  assert.equal(validateTransformedDocument(transformed).length, 0);
  assert.match(transformed.fields.imageUrl.stringValue, new RegExp(DESTINATION.bucket));
  assert.doesNotMatch(transformed.fields.imageUrl.stringValue, new RegExp(SOURCE.workspaceId));
});

test('forbidden identifiers outside migrationProvenance fail validation', () => {
  const transformed = transformDocument('ingredients/example', {
    fields: {
      workspaceId: { stringValue: SOURCE.workspaceId },
      suspiciousAuthor: { stringValue: SOURCE.otherRecipeAuthorUid }
    }
  });
  assert.deepEqual(validateTransformedDocument(transformed), [{
    path: 'fields.suspiciousAuthor.stringValue',
    token: SOURCE.otherRecipeAuthorUid
  }]);
});

test('schema-required ownership fields outside recipes use the same provenance rule', () => {
  for (const [path, field] of [
    ['categories/example', 'userId'],
    ['ingredients/example', 'createdBy']
  ]) {
    const transformed = transformDocument(path, {
      fields: { [field]: { stringValue: SOURCE.otherRecipeAuthorUid } }
    });
    assert.equal(transformed.fields[field].stringValue, DESTINATION.ownerUid);
    assert.equal(
      transformed.fields.migrationProvenance.mapValue.fields[`original${field[0].toUpperCase()}${field.slice(1)}`].stringValue,
      SOURCE.otherRecipeAuthorUid
    );
    assert.equal(validateTransformedDocument(transformed).length, 0);
  }
});

test('denylist contains every prohibited operational/system collection', () => {
  for (const collection of [
    'groupOrders', 'storeOrders', 'storeOrderTimeline', 'storeNotifications',
    'hostRewardLedger', 'resumeImportJobs', 'aiRequestLogs', 'ai_usage',
    'audit_logs', 'invoiceAuditLogs', 'teamInvitations', 'subscriptionUsage',
    'subscriptionQuotaLocks', 'publicRecipes', 'publicRecipeAssetManifests'
  ]) assert(EXCLUDED_COLLECTIONS.includes(collection), `${collection} is not denied`);
});
