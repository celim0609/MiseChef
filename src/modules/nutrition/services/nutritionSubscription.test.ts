import test from 'node:test';
import assert from 'node:assert/strict';
import { createNutritionRefresh } from './nutritionSubscription';

test('cross-account profile updates refresh while stale requests and switched workspaces cannot publish', async () => {
  const requests: Array<(value: number) => void> = []; const published: number[] = []; let loading = 0;
  const refresh = createNutritionRefresh(() => new Promise<number>(resolve => requests.push(resolve)), value => published.push(value), () => assert.fail('unexpected failure'), () => loading++);
  const first = refresh.refresh(); const changed = refresh.refresh();
  requests[1](200); await changed; requests[0](100); await first;
  assert.deepEqual(published, [200]); assert.equal(loading, 2);
  const previousWorkspace = refresh.refresh(); refresh.dispose(); requests[2](999); await previousWorkspace;
  assert.deepEqual(published, [200]);
});

test('service failures remain errors and cannot publish missing data as a zero profile', async () => {
  const failures: unknown[] = [];
  const refresh = createNutritionRefresh(async () => { throw new Error('permission denied'); }, () => assert.fail('must not publish zero'), error => failures.push(error));
  await refresh.refresh(); assert.equal(failures.length, 1);
});
