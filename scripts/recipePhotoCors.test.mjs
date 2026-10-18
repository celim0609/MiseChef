import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PRODUCTION_ORIGIN, PRODUCTION_DEFAULT_ORIGIN } from './productionDeploymentSafety.mjs';

test('Production photo CORS allows only canonical approved Production origins', () => {
  const policy = JSON.parse(readFileSync(new URL('../config/storage/production-cors.json', import.meta.url), 'utf8'));
  assert.equal(policy.length, 1);
  assert.deepEqual(policy[0].origin, [PRODUCTION_ORIGIN, PRODUCTION_DEFAULT_ORIGIN]);
  assert.ok(policy[0].method.includes('GET'));
  assert.ok(policy[0].method.includes('HEAD'));
  assert.ok(policy[0].method.includes('POST'));
  assert.ok(policy[0].responseHeader.includes('x-goog-resumable'));
});
