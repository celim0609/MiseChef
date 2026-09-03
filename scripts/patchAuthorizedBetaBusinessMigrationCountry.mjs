#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('scripts/migrateAuthorizedBetaBusiness.mjs');
let source = readFileSync(target, 'utf8');

const replaceOnce = (before, after, label) => {
  const occurrences = source.split(before).length - 1;
  assert.equal(occurrences, 1, `${label}: expected exactly one match, found ${occurrences}.`);
  source = source.replace(before, after);
};

replaceOnce(
  "} from './authorizedBetaBusinessMigrationManifest.mjs';\n",
  "} from './authorizedBetaBusinessMigrationManifest.mjs';\nimport {\n  AUTHORIZED_MIGRATION_MARKET,\n  assertAuthorizedSourceStoreMarket,\n  buildWorkspaceCountryPatch\n} from './authorizedBetaBusinessMigrationCountry.mjs';\n",
  'country helper import'
);

replaceOnce(
  "const getField = (document, name) => readStringValue(document?.fields?.[name]);\nconst effectiveWorkspaceCountry = workspace => getField(workspace, 'country') || 'SG';\n",
  "const getField = (document, name) => readStringValue(document?.fields?.[name]);\n",
  'remove SG fallback'
);

replaceOnce(
  "  const sourceStore = sourceDocuments.find(entry => entry.sourcePath === `stores/${SOURCE.workspaceId}`)?.document;\n\n  const compatibilityBlockers = [];\n",
  "  const sourceStore = sourceDocuments.find(entry => entry.sourcePath === `stores/${SOURCE.workspaceId}`)?.document;\n\n  const compatibilityBlockers = [];\n  let workspaceCountryPatch = null;\n",
  'workspace patch declaration'
);

replaceOnce(
  "  const storeCountry = getField(sourceStore, 'country');\n  const workspaceCountry = effectiveWorkspaceCountry(productionWorkspace);\n  if (storeCountry && workspaceCountry !== storeCountry) {\n    compatibilityBlockers.push(`Production workspace effective country ${workspaceCountry} does not match authorized Beta store country ${storeCountry}.`);\n  }\n",
  "  try {\n    assertAuthorizedSourceStoreMarket(sourceStore);\n  } catch (error) {\n    compatibilityBlockers.push(error.message);\n  }\n  if (getField(productionWorkspace, 'ownerId') === DESTINATION.ownerUid) {\n    try {\n      workspaceCountryPatch = buildWorkspaceCountryPatch(productionWorkspace);\n    } catch (error) {\n      compatibilityBlockers.push(error.message);\n    }\n  }\n  if (phase === 'post-apply' && getField(productionWorkspace, 'country') !== AUTHORIZED_MIGRATION_MARKET.country) {\n    compatibilityBlockers.push(`Production workspace country is not ${AUTHORIZED_MIGRATION_MARKET.country} after migration.`);\n  }\n",
  'market compatibility checks'
);

replaceOnce(
  "  const storageIdenticalExisting = storageInspection.filter(item => item.destinationIdentical).length;\n  const storageCreates = storageInspection.filter(item => !item.destinationExists).length;\n\n  const blockers = [\n",
  "  const storageIdenticalExisting = storageInspection.filter(item => item.destinationIdentical).length;\n  const storageCreates = storageInspection.filter(item => !item.destinationExists).length;\n  const firestoreCreatesPlanned = destinationDocuments.filter(entry => !entry.document).length;\n  const firestoreStoreUpdatesPlanned = destinationDocuments\n    .filter(entry => entry.document && entry.destinationPath === allowedOverwrite).length;\n  const firestoreWorkspaceCountryUpdatesPlanned = workspaceCountryPatch ? 1 : 0;\n  const firestoreUpdatesPlanned = firestoreStoreUpdatesPlanned + firestoreWorkspaceCountryUpdatesPlanned;\n\n  const blockers = [\n",
  'planned Firestore counts'
);

replaceOnce(
  "  if (phase === 'preflight') {\n    if (storageCreates !== EXPECTED_COUNTS.storageCreates) {\n",
  "  if (phase === 'preflight') {\n    if (firestoreCreatesPlanned !== EXPECTED_COUNTS.firestoreCreates) {\n      blockers.push(`Expected ${EXPECTED_COUNTS.firestoreCreates} Firestore creates, found ${firestoreCreatesPlanned}.`);\n    }\n    if (firestoreUpdatesPlanned !== EXPECTED_COUNTS.firestoreUpdates) {\n      blockers.push(`Expected ${EXPECTED_COUNTS.firestoreUpdates} controlled Firestore updates, found ${firestoreUpdatesPlanned}.`);\n    }\n    if (storageCreates !== EXPECTED_COUNTS.storageCreates) {\n",
  'Firestore count blockers'
);

replaceOnce(
  "    production: { productionCompany, productionWorkspace, productionMembership, productionChefProfile },\n",
  "    production: { productionCompany, productionWorkspace, productionMembership, productionChefProfile },\n    workspaceCountryPatch,\n",
  'return workspace patch'
);

replaceOnce(
  "        firestoreCreatesPlanned: phase === 'preflight' ? destinationDocuments.filter(entry => !entry.document).length : 0,\n        firestoreUpdatesPlanned: phase === 'preflight' ? destinationDocuments.filter(entry => entry.document && entry.destinationPath === allowedOverwrite).length : 0,\n",
  "        firestoreCreatesPlanned: phase === 'preflight' ? firestoreCreatesPlanned : 0,\n        firestoreUpdatesPlanned: phase === 'preflight' ? firestoreUpdatesPlanned : 0,\n        firestoreWorkspaceCountryUpdatesPlanned: phase === 'preflight' ? firestoreWorkspaceCountryUpdatesPlanned : 0,\n",
  'report Firestore counts'
);

replaceOnce(
  "  const existingDocuments = inspection.destinationDocuments\n    .filter(entry => entry.document)\n    .map(entry => ({ path: entry.destinationPath, document: entry.document }));\n",
  "  const existingDocuments = inspection.destinationDocuments\n    .filter(entry => entry.document)\n    .map(entry => ({ path: entry.destinationPath, document: entry.document }));\n  if (inspection.production.productionWorkspace) {\n    existingDocuments.push({\n      path: `workspaces/${DESTINATION.workspaceId}`,\n      document: inspection.production.productionWorkspace\n    });\n  }\n",
  'snapshot Production workspace'
);

replaceOnce(
  "  const writes = inspection.transformed.map(entry => {\n    const existing = existingByPath.get(entry.destinationPath);\n    return {\n      update: entry.transformed,\n      currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false }\n    };\n  });\n  const writeResults = await commitWrites(clients.firestore, writes);\n",
  "  const writes = inspection.transformed.map(entry => {\n    const existing = existingByPath.get(entry.destinationPath);\n    return {\n      update: entry.transformed,\n      currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false }\n    };\n  });\n  if (inspection.workspaceCountryPatch) writes.push(inspection.workspaceCountryPatch.write);\n  assert.equal(writes.length, EXPECTED_COUNTS.firestoreCreates + EXPECTED_COUNTS.firestoreUpdates);\n  const writeResults = await commitWrites(clients.firestore, writes);\n",
  'atomic workspace patch write'
);

replaceOnce(
  "  manifest.completedFirestore = inspection.transformed.map((entry, index) => ({\n    path: entry.destinationPath,\n    action: existingByPath.has(entry.destinationPath) ? 'updated' : 'created',\n    updateTime: writeResults[index]?.updateTime\n  }));\n",
  "  manifest.completedFirestore = inspection.transformed.map((entry, index) => ({\n    path: entry.destinationPath,\n    action: existingByPath.has(entry.destinationPath) ? 'updated' : 'created',\n    updateTime: writeResults[index]?.updateTime\n  }));\n  if (inspection.workspaceCountryPatch) {\n    manifest.completedFirestore.push({\n      path: `workspaces/${DESTINATION.workspaceId}`,\n      action: 'updated-country',\n      updateTime: writeResults[inspection.transformed.length]?.updateTime\n    });\n  }\n",
  'rollback tracking for workspace patch'
);

writeFileSync(target, source);
console.log('Patched authorized Beta business migration with MY/MYR guard, workspace country update, count assertions, and rollback tracking.');
