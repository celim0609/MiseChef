import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ingredient } from '../../../types';
import { normalizeIngredientForDisplay } from '../../../utils/ingredientParser';
import type { CostingIngredient } from '../types';
import {
  getSelectableRecipeLibraryIngredients,
  loadRecipeIngredientLibrary,
  updateRecipeIngredientLibraryLink
} from './recipeIngredientLibrary';

const makeLibraryIngredient = (
  id: string,
  overrides: Partial<CostingIngredient> = {}
): CostingIngredient => ({
  id,
  name: `Ingredient ${id}`,
  category: 'Pantry',
  purchaseUnit: 'kg',
  recipeUnit: 'g',
  conversionFactor: 1000,
  currentPrice: 10,
  currency: 'MYR',
  supplierId: '',
  yieldPercentage: 100,
  wastePercentage: 0,
  status: 'Active',
  notes: '',
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  createdBy: 'user-1',
  workspaceId: 'workspace-current',
  ...overrides
});

test('loads all active Ingredient Library records using the current workspace, not the user id', async () => {
  const queriedWorkspaceIds: Array<string | undefined> = [];
  const records = [
    makeLibraryIngredient('ceylon', { name: '888 TEH CEYLON - YELLOW 1KG' }),
    makeLibraryIngredient('sugar', { name: 'Sugar' })
  ];

  const loaded = await loadRecipeIngredientLibrary(
    'workspace-current',
    'user-1',
    async workspaceId => {
      queriedWorkspaceIds.push(workspaceId);
      return records;
    }
  );

  assert.deepEqual(queriedWorkspaceIds, ['workspace-current']);
  assert.deepEqual(loaded.map(ingredient => ingredient.id), ['ceylon', 'sugar']);
});

test('includes Purchase Unit = Unit and does not filter by a recipe row unit', () => {
  const unitIngredient = makeLibraryIngredient('eggs', {
    name: 'Eggs',
    purchaseUnit: 'Unit',
    recipeUnit: 'Unit'
  });

  const selectable = getSelectableRecipeLibraryIngredients([unitIngredient], 'workspace-current');
  const recipeRow: Ingredient = { id: 'row-1', name: 'Eggs', qty: '2', unit: 'dozen' };
  const linked = updateRecipeIngredientLibraryLink(recipeRow, selectable[0]);

  assert.deepEqual(selectable.map(ingredient => ingredient.id), ['eggs']);
  assert.equal(linked.ingredientId, 'eggs');
  assert.equal(linked.unit, 'dozen');
});

test('excludes inactive and other-workspace records', () => {
  const selectable = getSelectableRecipeLibraryIngredients([
    makeLibraryIngredient('active'),
    makeLibraryIngredient('archived', { status: 'Archived' }),
    makeLibraryIngredient('other-workspace', { workspaceId: 'workspace-other' })
  ], 'workspace-current');

  assert.deepEqual(selectable.map(ingredient => ingredient.id), ['active']);
});

test('selected Ingredient Library id survives save serialization and Edit Recipe hydration', () => {
  const recipeRow: Ingredient = { id: 'row-1', name: 'Ceylon tea', qty: '5', unit: 'g' };
  const linked = updateRecipeIngredientLibraryLink(recipeRow, makeLibraryIngredient('ceylon'));

  const savedPayload = JSON.parse(JSON.stringify({ ingredients: [normalizeIngredientForDisplay(linked)] }));
  const hydrated = savedPayload.ingredients.map(normalizeIngredientForDisplay) as Ingredient[];

  assert.equal(savedPayload.ingredients[0].ingredientId, 'ceylon');
  assert.equal(hydrated[0].ingredientId, 'ceylon');
});

test('Not linked removes the library id while preserving an existing recipe ingredient', () => {
  const linked: Ingredient = {
    id: 'row-1',
    name: 'Ceylon tea',
    qty: '5',
    unit: 'g',
    notes: 'steeped',
    ingredientId: 'ceylon',
    unitCost: 0.02,
    ingredientCost: 0.1,
    costingUnit: 'g'
  };

  const unlinked = updateRecipeIngredientLibraryLink(linked);

  assert.equal(unlinked.ingredientId, undefined);
  assert.equal(unlinked.name, 'Ceylon tea');
  assert.equal(unlinked.qty, '5');
  assert.equal(unlinked.unit, 'g');
  assert.equal(unlinked.notes, 'steeped');
});
