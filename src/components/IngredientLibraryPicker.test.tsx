import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CostingIngredient } from '../modules/costing/types';
import { WorkspaceRegionProvider } from '../regions';
import IngredientLibraryPicker, { IngredientLibraryPickerResults } from './IngredientLibraryPicker';

const ingredient: CostingIngredient = {
  id: 'ceylon',
  name: '888 TEH CEYLON - YELLOW 1KG',
  category: 'Tea',
  purchaseUnit: 'Unit',
  recipeUnit: 'g',
  conversionFactor: 1000,
  currentPrice: 18.5,
  currency: 'MYR',
  supplierId: 'supplier-1',
  yieldPercentage: 100,
  wastePercentage: 0,
  status: 'Active',
  notes: '',
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  createdBy: 'user-1',
  workspaceId: 'workspace-current'
};

test('renders the explicit no-result state', () => {
  const markup = renderToStaticMarkup(
    <IngredientLibraryPickerResults ingredients={[]} onSelect={() => undefined} />
  );
  assert.match(markup, /No ingredients found/);
});

test('hydrates the picker button with the existing linked ingredient name', () => {
  const markup = renderToStaticMarkup(
    <IngredientLibraryPicker
      ingredients={[ingredient]}
      selectedIngredientId="ceylon"
      onSelect={() => undefined}
      ariaLabel="Link Ceylon tea to Ingredient Library"
    />
  );
  assert.match(markup, /888 TEH CEYLON - YELLOW 1KG/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, />Not linked</);
});

test('renders Ingredient Library prices using only the active Workspace currency', () => {
  const renderResults = (country: 'MY' | 'SG') => renderToStaticMarkup(
    <WorkspaceRegionProvider workspace={{ country }}>
      <IngredientLibraryPickerResults ingredients={[ingredient]} onSelect={() => undefined} />
    </WorkspaceRegionProvider>
  );

  assert.match(renderResults('MY'), /Unit · MYR 18\.50/);
  assert.match(renderResults('SG'), /Unit · SGD 18\.50/);
  assert.doesNotMatch(renderResults('SG'), /MYR/);
});

test('renders actual pack quantity and active Workspace currency for pack pricing', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRegionProvider workspace={{ country: 'SG' }}>
      <IngredientLibraryPickerResults
        ingredients={[{ ...ingredient, packQuantity: 50, packUnit: 'g', packPrice: 2.45 }]}
        onSelect={() => undefined}
      />
    </WorkspaceRegionProvider>
  );
  assert.match(markup, /50 g · SGD 2\.45/);
});
