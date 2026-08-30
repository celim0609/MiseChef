import assert from 'node:assert/strict';
import test from 'node:test';
import type { Recipe, WorkspaceMemberSummary } from '../types';
import {
  formatRecipeCreatorLine,
  getRecipeCreatorName,
  preserveOriginalRecipeCreator
} from './recipeCreator';

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'teh-ice',
  workspaceId: 'workspace-a',
  companyId: 'workspace-a',
  userId: 'sara',
  createdBy: 'sara',
  createdByName: 'Sara',
  title: 'Teh Ice',
  coverImage: 'https://example.test/teh-ice.jpg',
  category: 'Drinks',
  prepTime: 5,
  servings: 1,
  yield: '1 glass',
  difficulty: 'Easy',
  story: '',
  ingredients: [],
  method: [],
  videoLink: '',
  chefName: 'Sara',
  isSaved: false,
  collections: [],
  createdAt: '2026-08-23T00:00:00.000Z',
  ...overrides
});

const members: WorkspaceMemberSummary[] = [{
  userId: 'sara',
  email: 'sara@example.test',
  displayName: 'Sara',
  role: 'Chef',
  status: 'Active'
}];

test('Recipe cards and details prefer the stored original creator snapshot', () => {
  assert.equal(getRecipeCreatorName(recipe(), members), 'Sara');
  assert.equal(formatRecipeCreatorLine(recipe(), members), 'Created by Sara · Aug 23, 2026');
});

test('legacy Recipes use the Workspace roster without changing stored attribution', () => {
  const legacy = recipe({ createdByName: undefined });
  assert.equal(getRecipeCreatorName(legacy, members), 'Sara');
  assert.equal(legacy.createdByName, undefined);
  assert.equal(getRecipeCreatorName(recipe({ userId: undefined, createdBy: undefined, createdByName: undefined }), members), 'Unknown member');
});

test('a teammate edit preserves every original creator and Workspace identity field', () => {
  const original = recipe();
  const teammateEdit = recipe({
    title: 'Teh Ice — teammate edit',
    workspaceId: 'workspace-b',
    companyId: 'workspace-b',
    userId: 'owner',
    createdBy: 'owner',
    createdByName: 'Workspace Owner',
    createdAt: '2026-08-24T00:00:00.000Z'
  });
  const preserved = preserveOriginalRecipeCreator(original, teammateEdit);

  assert.equal(preserved.title, 'Teh Ice — teammate edit');
  assert.equal(preserved.workspaceId, 'workspace-a');
  assert.equal(preserved.companyId, 'workspace-a');
  assert.equal(preserved.userId, 'sara');
  assert.equal(preserved.createdBy, 'sara');
  assert.equal(preserved.createdByName, 'Sara');
  assert.equal(preserved.createdAt, '2026-08-23T00:00:00.000Z');
});
