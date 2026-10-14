import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecipeSaveDiagnostic } from './recipeSaveDiagnostic';

test('failed shared save reports identities, membership and Firebase error without Recipe contents', () => {
  const original = { id: 'recipe-a', workspaceId: 'workspace-a', companyId: 'workspace-a', userId: 'creator', creatorId: 'creator', createdBy: 'creator', createdByName: 'Original Chef', createdAt: 'old', title: 'PRIVATE TITLE', ingredients: [{ id: 'row', name: 'PRIVATE INGREDIENT', qty: '1', unit: 'g' }], story: 'PRIVATE STORY' };
  const result = getRecipeSaveDiagnostic({
    recipe: { ...original, createdBy: 'editor', workspaceId: 'workspace-b' }, originalRecipe: original,
    workspaceId: 'workspace-a', memberRole: 'Chef', memberStatus: 'Active', operation: 'update', stage: 'firestore',
    error: { code: 'permission-denied', message: 'Missing or insufficient permissions.', privatePayload: original }
  });
  assert.equal(result.recipeDocumentId, 'recipe-a');
  assert.equal(result.workspaceId, 'workspace-a');
  assert.equal(result.memberRole, 'Chef');
  assert.equal(result.memberStatus, 'Active');
  assert.equal(result.code, 'permission-denied');
  assert.equal(result.message, 'Missing or insufficient permissions.');
  assert.deepEqual(result.identityFieldsChanged, { creatorId: false, createdBy: true, createdByName: false, createdAt: false, userId: false, workspaceId: true, companyId: false });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Original Chef|privatePayload|ingredients|story|title/);
});

test('missing metadata is not reported as changed and diagnostics tolerate non-Firebase errors', () => {
  const result = getRecipeSaveDiagnostic({ recipe: { id: 'legacy', createdBy: undefined }, originalRecipe: { id: 'legacy' }, workspaceId: 'a', memberRole: null, memberStatus: null, operation: 'update', stage: 'costing', error: null });
  assert.ok(Object.values(result.identityFieldsChanged!).every(changed => !changed));
  assert.equal(result.code, null);
  assert.equal(result.message, 'Unknown Recipe save error');
});

test('omitted legacy creatorId remains unchanged by a merge save', () => {
  const result = getRecipeSaveDiagnostic({ recipe: { id: 'legacy', title: 'Edited' }, originalRecipe: { id: 'legacy', creatorId: 'original' }, workspaceId: 'a', memberRole: 'Chef', memberStatus: 'Active', operation: 'update', stage: 'firestore', error: new Error('Denied') });
  assert.equal(result.identityFieldsChanged?.creatorId, false);
});
