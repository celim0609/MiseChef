#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/migrateAuthorizedBetaBusiness.mjs';
let source = readFileSync(path, 'utf8');

const before = `  if (phase === 'post-apply' && getField(productionWorkspace, 'country') !== AUTHORIZED_MIGRATION_MARKET.country) {
    compatibilityBlockers.push(\`Production workspace country is not \${AUTHORIZED_MIGRATION_MARKET.country} after migration.\`);
  }
`;

const after = `  if (phase === 'post-apply' && getField(productionWorkspace, 'country') !== AUTHORIZED_MIGRATION_MARKET.country) {
    compatibilityBlockers.push(\`Production workspace country is not \${AUTHORIZED_MIGRATION_MARKET.country} after migration.\`);
  }
  if (phase === 'post-apply') {
    const destinationStore = destinationDocuments
      .find(entry => entry.destinationPath === \`stores/\${DESTINATION.workspaceId}\`)?.document;
    try {
      assertAuthorizedSourceStoreMarket(destinationStore);
    } catch (error) {
      compatibilityBlockers.push(\`Production store market verification failed: \${error.message}\`);
    }
  }
`;

const occurrences = source.split(before).length - 1;
assert.equal(occurrences, 1, `Expected one post-apply workspace market block, found ${occurrences}.`);
source = source.replace(before, after);
writeFileSync(path, source);
console.log('Added Production Store MY/MYR post-apply verification.');
