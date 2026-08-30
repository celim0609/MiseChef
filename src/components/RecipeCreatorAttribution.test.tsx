import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Recipe, WorkspaceMemberSummary } from '../types';
import RecipeDetailModal from './RecipeDetailModal';
import SearchTab from './SearchTab';

const tehIce: Recipe = {
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
  cookTime: 2,
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
  createdAt: '2026-08-23T00:00:00.000Z'
};

const sara: WorkspaceMemberSummary = {
  userId: 'sara',
  email: 'sara@example.test',
  displayName: 'Sara',
  role: 'Chef',
  status: 'Active'
};

const actions = {
  onClose: () => undefined,
  onEdit: () => undefined,
  onDuplicate: () => undefined,
  onShare: () => undefined,
  onDelete: () => undefined,
  onToggleFavorite: () => undefined
};

test('Recipe Library card shows category, title, creator, and time', () => {
  const markup = renderToStaticMarkup(
    <SearchTab
      recipes={[tehIce]}
      categories={[]}
      onSelectRecipe={() => undefined}
      onCreateCategory={() => null}
      onRenameCategory={() => undefined}
      onDeleteCategory={() => undefined}
      onToggleFavorite={() => undefined}
      workspaceMembers={[sara]}
    />
  );

  assert.match(markup, /Drinks/);
  assert.match(markup, /Teh Ice/);
  assert.match(markup, /Created by Sara/);
  assert.match(markup, /5 mins/);
  assert.doesNotMatch(markup, /sara@example\.test/);
});

test('Recipe Detail shows the same creator display name without exposing UID', () => {
  const markup = renderToStaticMarkup(
    <RecipeDetailModal recipe={tehIce} {...actions} workspaceMembers={[sara]} />
  );

  assert.match(markup, /Created by Sara · Aug 23, 2026/);
  assert.doesNotMatch(markup, />sara</);
  assert.doesNotMatch(markup, /sara@example\.test/);
});
