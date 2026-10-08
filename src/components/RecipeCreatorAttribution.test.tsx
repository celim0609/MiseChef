import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Recipe, WorkspaceMemberSummary } from '../types';
import RecipeDetailModal from './RecipeDetailModal';
import SearchTab, { RecipeLibraryCard } from './SearchTab';

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

test('Recipe Library card preserves complete nutrition and hides incomplete calories', () => {
  const completeMarkup = renderToStaticMarkup(
    <RecipeLibraryCard recipe={tehIce} nutrition={{ status: 'COMPLETE', totalKcal: 451.2, kcalPerServing: 225.6, incompleteReasons: [] }} workspaceMembers={[sara]} onSelectRecipe={() => undefined} onToggleFavorite={() => undefined} />
  );
  const incompleteMarkup = renderToStaticMarkup(
    <RecipeLibraryCard recipe={tehIce} nutrition={{ status: 'INCOMPLETE', incompleteReasons: ['Egg: nutrition profile is required.'] }} workspaceMembers={[sara]} onSelectRecipe={() => undefined} onToggleFavorite={() => undefined} />
  );

  assert.match(completeMarkup, /Total Calories: 451 kcal · 226 kcal per serving/);
  assert.doesNotMatch(completeMarkup, /451\.2|total kcal/);
  assert.doesNotMatch(incompleteMarkup, /kcal/);
  assert.match(incompleteMarkup, /Incomplete/);
});


test('Recipe Library card shows only estimated per-serving calories and ingredient coverage', () => {
  const markup = renderToStaticMarkup(
    <RecipeLibraryCard recipe={tehIce} nutrition={{
      status: 'ESTIMATED', totalKcal: 451.2, kcalPerServing: 225.6,
      calculatedIngredientCount: 8, totalIngredientCount: 9,
      incompleteReasons: ['Ginger nutrition data unavailable', 'Garlic nutrition data unavailable']
    }} workspaceMembers={[sara]} onSelectRecipe={() => undefined} onToggleFavorite={() => undefined} />
  );

  assert.match(markup, /Partial Total: 451 kcal · Partial 226 kcal per serving/);
  assert.match(markup, /8 \/ 9 ingredients calculated/);
  assert.doesNotMatch(markup, /Ginger|Garlic|nutrition data unavailable/);
  assert.match(markup, /Created by Sara/);
  assert.match(markup, /5 mins/);
});

test('Recipe Library card displays a valid zero calorie estimate', () => {
  const markup = renderToStaticMarkup(
    <RecipeLibraryCard recipe={tehIce} nutrition={{
      status: 'ESTIMATED', totalKcal: 0, kcalPerServing: 0,
      calculatedIngredientCount: 1, totalIngredientCount: 2,
      incompleteReasons: ['Ginger nutrition data unavailable']
    }} workspaceMembers={[sara]} onSelectRecipe={() => undefined} onToggleFavorite={() => undefined} />
  );

  assert.match(markup, /Partial Total: 0 kcal · Partial 0 kcal per serving/);
  assert.match(markup, /1 \/ 2 ingredients calculated/);
  assert.doesNotMatch(markup, /Ginger|nutrition data unavailable/);
});
