import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Recipe } from '../types';
import type { CostingIngredient } from '../modules/costing/types';
import { calculateRecipeCosting } from '../modules/costing/services/recipeCostCalculator';
import { calculateRecipeEditorCostPreview } from '../modules/costing/services/recipeEditorCostPreview';
import { WorkspaceRegionProvider } from '../regions';
import RecipeCostAnalysis from './RecipeCostAnalysis';

const calculatedAt = '2026-08-23T08:00:00.000Z';

const makeLibraryIngredient = (overrides: Partial<CostingIngredient>): CostingIngredient => ({
  id: 'boh',
  name: 'BOH Black Tea',
  category: 'Tea',
  purchaseUnit: 'g',
  recipeUnit: 'g',
  conversionFactor: 1,
  currentPrice: 0.049,
  currency: 'MYR',
  supplierId: '',
  yieldPercentage: 100,
  wastePercentage: 0,
  status: 'Active',
  notes: '',
  createdAt: calculatedAt,
  updatedAt: calculatedAt,
  createdBy: 'sara',
  workspaceId: 'workspace-a',
  packQuantity: 50,
  packUnit: 'g',
  packPrice: 2.45,
  ...overrides
});

const boh = makeLibraryIngredient({});
const ceylon = makeLibraryIngredient({
  id: 'ceylon',
  name: '888 TEH CEYLON - YELLOW 1KG',
  packQuantity: 1,
  packUnit: 'kg',
  packPrice: 17.3,
  currentPrice: 0.0173
});
const libraryIngredients = [boh, ceylon];

const recipe: Recipe = {
  id: 'recipe-1',
  workspaceId: 'workspace-a',
  userId: 'sara',
  createdBy: 'sara',
  createdByName: 'Sara',
  title: 'Tea QA',
  coverImage: 'https://example.test/tea.jpg',
  category: 'Drinks',
  prepTime: 5,
  servings: 2,
  yield: '2 servings',
  difficulty: 'Easy',
  story: 'Story',
  chefNotes: 'Notes',
  ingredients: [{ id: 'row-boh', name: 'BOH Black Tea', ingredientId: 'boh', qty: '10', unit: 'g' }],
  method: [{ id: 'step-1', stepNumber: 1, description: 'Brew.' }],
  videoLink: '',
  sellingPrice: 5,
  chefName: 'Sara',
  isSaved: false,
  collections: [],
  createdAt: calculatedAt,
  visibility: 'private'
};

const preview = (overrides: Partial<Parameters<typeof calculateRecipeEditorCostPreview>[0]> = {}) => (
  calculateRecipeEditorCostPreview({
    recipe,
    ingredients: recipe.ingredients,
    libraryIngredients,
    servings: '2',
    sellingPrice: '5',
    calculatedAt,
    ...overrides
  })
);

test('Edit Recipe live preview uses the existing recipe costing service as its source of truth', () => {
  const editorResult = preview();
  const serviceResult = calculateRecipeCosting(recipe, libraryIngredients, calculatedAt);

  assert.deepEqual(editorResult.costing, serviceResult.costing);
  assert.deepEqual(editorResult.ingredients, serviceResult.ingredients);
  assert.equal(editorResult.costing?.totalRecipeCost, 0.49);
  assert.equal(editorResult.costing?.costPerPortion, 0.24);
});

test('quantity, link, add, and remove changes recalculate the draft ingredient costs', () => {
  assert.equal(preview({
    ingredients: [{ ...recipe.ingredients[0], qty: '20' }]
  }).costing?.totalRecipeCost, 0.98);

  assert.equal(preview({
    ingredients: [{ ...recipe.ingredients[0], ingredientId: 'ceylon' }]
  }).costing?.totalRecipeCost, 0.17);

  const withCeylon = [
    ...recipe.ingredients,
    { id: 'row-ceylon', name: 'Ceylon', ingredientId: 'ceylon', qty: '30', unit: 'g' }
  ];
  assert.equal(preview({ ingredients: withCeylon }).costing?.totalRecipeCost, 1.01);
  assert.equal(preview({ ingredients: withCeylon.slice(1) }).costing?.totalRecipeCost, 0.52);
});

test('servings and selling price recalculate per-portion and profit metrics', () => {
  const fourPortions = preview({ servings: '4' });
  assert.equal(fourPortions.costing?.costPerPortion, 0.12);

  const higherPrice = preview({ sellingPrice: '10' });
  assert.equal(higherPrice.costing?.foodCostPercentage, 2.4);
  assert.equal(higherPrice.costing?.grossProfitPercentage, 97.6);

  const experimentalPrice = preview({ sellingPrice: '3.50' });
  const updatedExperimentalPrice = preview({ sellingPrice: '4.00' });
  assert.equal(experimentalPrice.costing?.foodCostPercentage, 6.9);
  assert.equal(experimentalPrice.costing?.grossProfitPercentage, 93.1);
  assert.equal(updatedExperimentalPrice.costing?.foodCostPercentage, 6);
  assert.equal(updatedExperimentalPrice.costing?.grossProfitPercentage, 94);

  const quantityAgainstDraftPrice = preview({
    ingredients: [{ ...recipe.ingredients[0], qty: '20' }],
    sellingPrice: '4.00'
  });
  assert.equal(quantityAgainstDraftPrice.costing?.foodCostPercentage, 12.3);
  assert.equal(quantityAgainstDraftPrice.costing?.grossProfitPercentage, 87.8);
});

test('shared Cost Analysis renders one editable MYR Selling Price in Edit Recipe', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRegionProvider workspace={{ country: 'MY' }}>
      <RecipeCostAnalysis
        recipe={preview()}
        defaultOpen
        livePreview
        sellingPriceValue="5"
        onSellingPriceChange={() => undefined}
      />
    </WorkspaceRegionProvider>
  );

  assert.match(markup, /Cost Analysis/);
  assert.match(markup, /Live preview/);
  assert.match(markup, /Total Cost/);
  assert.match(markup, /Per Portion/);
  assert.match(markup, /Selling Price/);
  assert.match(markup, /aria-label="Selling Price \(MYR\)"/);
  assert.match(markup, /value="5"/);
  assert.match(markup, /MYR 0\.49/);
  assert.match(markup, /Food Cost/);
  assert.match(markup, /Gross Profit/);
  assert.match(markup, /Ingredient Cost/);
  assert.match(markup, /% of Total/);
  assert.match(markup, /min-w-\[620px\]/);
});

test('read-only Recipe Detail shows the saved Selling Price with Workspace currency', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRegionProvider workspace={{ country: 'MY' }}>
      <RecipeCostAnalysis recipe={preview()} defaultOpen />
    </WorkspaceRegionProvider>
  );

  assert.match(markup, /Selling Price/);
  assert.match(markup, /MYR 5\.00/);
  assert.doesNotMatch(markup, /aria-label="Selling Price \(MYR\)"/);
  assert.doesNotMatch(markup, /\$5\.00/);
});

test('Edit Recipe places Cost Analysis before Ingredients and Story/Chef Notes after operational sections', () => {
  const source = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');
  const costIndex = source.indexOf('<RecipeCostAnalysis');
  const ingredientsIndex = source.indexOf('id="ingredients-section"');
  const instructionsIndex = source.indexOf('id="method-section"');
  const recommendedProductsIndex = source.indexOf('aria-controls="recommended-products-editor"');
  const videoIndex = source.indexOf('{/* Video URL section */}');
  const storyIndex = source.indexOf('{/* Secondary narrative details */}');
  const notesIndex = source.indexOf('value={chefNotes}', storyIndex);

  assert.ok(costIndex > 0 && costIndex < ingredientsIndex);
  assert.ok(ingredientsIndex < instructionsIndex);
  assert.ok(instructionsIndex < recommendedProductsIndex);
  assert.ok(recommendedProductsIndex < videoIndex);
  assert.ok(videoIndex < storyIndex && storyIndex < notesIndex);
});

test('Add Recipe remains available without exposing Edit-only live costing', () => {
  const source = readFileSync(new URL('./AddRecipeTab.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isEditing \|\| !initialRecipe\) return null/);
  assert.match(source, /\{liveCostingRecipe && \(/);
  assert.match(source, /\{!isEditing && \([\s\S]*Selling Price/);
  assert.match(source, /sellingPriceValue=\{sellingPrice\}/);
  assert.match(source, /onSellingPriceChange=\{value => \{[\s\S]*setSellingPrice\(value\)/);
  assert.equal(source.split('sellingPriceValue={sellingPrice}').length - 1, 1);
  assert.equal(readFileSync(new URL('./RecipeCostAnalysis.tsx', import.meta.url), 'utf8').split('type="number"').length - 1, 1);
});
