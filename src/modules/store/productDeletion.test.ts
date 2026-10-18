import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteProductWithCleanup } from './productDeletion';

test('legacy photo and option failures do not turn a completed delete into a failure', async () => {
  const calls: string[] = [];
  const warning = await deleteProductWithCleanup(
    async () => { calls.push('document deleted'); },
    [
      async () => { calls.push('legacy photo'); throw new Error('storage/unauthorized'); },
      async () => { calls.push('obsolete option'); throw new Error('permission-denied'); },
      async () => { calls.push('other cleanup'); }
    ]
  );
  assert.equal(warning, true);
  assert.deepEqual(calls, ['document deleted', 'legacy photo', 'obsolete option', 'other cleanup']);
});

test('a denied Firestore delete remains an error and never runs cleanup', async () => {
  const denied = new Error('Missing or insufficient permissions');
  await assert.rejects(deleteProductWithCleanup(
    async () => { throw denied; },
    [async () => { assert.fail('Cleanup must not run after denied deletion'); }]
  ), error => error === denied);
});

test('successful cleanup needs no warning', async () => {
  assert.equal(await deleteProductWithCleanup(async () => {}, [async () => {}]), false);
});
