import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CostingIngredient, CostingInvoiceExtractedItem } from '../types';
import {
  createInvoiceReviewItems,
  matchInvoiceItemsToIngredients,
  normalizeIngredientName,
  validateInvoiceImportMatches
} from './invoiceImportReview';

const ingredient = (id: string, name: string, workspaceId = 'workspace-a'): CostingIngredient => ({
  id,
  name,
  category: '',
  purchaseUnit: 'kg',
  recipeUnit: 'kg',
  conversionFactor: 1,
  currentPrice: 1,
  currency: 'MYR',
  supplierId: '',
  yieldPercentage: 100,
  wastePercentage: 0,
  status: 'Active',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'owner-a',
  workspaceId
});

const ocrItem: CostingInvoiceExtractedItem = {
  name: 'V/S SHORTENING (250GM)',
  quantity: 24,
  unit: 'pack',
  unitPrice: 2.5,
  total: 60
};

describe('invoice ingredient review', () => {
  it('keeps the immutable supplier description separate from the editable Ingredient Name', () => {
    const [review] = createInvoiceReviewItems([ocrItem]);
    review.ingredientName = 'Shortening';

    assert.equal(review.supplierDescription, 'V/S SHORTENING (250GM)');
    assert.equal(review.ingredientName, 'Shortening');
    assert.equal(ocrItem.name, 'V/S SHORTENING (250GM)');
  });

  it('suggests an exact existing Ingredient without selecting it automatically', () => {
    const [review] = createInvoiceReviewItems([ocrItem]);
    review.ingredientName = 'Shortening';
    const [match] = matchInvoiceItemsToIngredients([review], [ingredient('shortening', 'Shortening')], 'workspace-a');

    assert.equal(match.suggestedIngredientId, 'shortening');
    assert.equal(match.matchedIngredientId, undefined);
    assert.equal(match.decision, undefined);
    assert.equal(match.status, 'Possible Match');
  });

  it('normalizes punctuation and spacing for deterministic suggestions', () => {
    assert.equal(normalizeIngredientName(" Kawan  Tortilla 10\" "), 'kawan tortilla 10');
    assert.equal(normalizeIngredientName('Kawan Tortilla 10'), 'kawan tortilla 10');
  });

  it('never suggests an Ingredient from another Workspace', () => {
    const [review] = createInvoiceReviewItems([ocrItem]);
    review.ingredientName = 'Shortening';
    const [match] = matchInvoiceItemsToIngredients(
      [review],
      [ingredient('foreign', 'Shortening', 'workspace-b')],
      'workspace-a'
    );

    assert.equal(match.suggestedIngredientId, undefined);
    assert.equal(match.decision, 'Create New');
  });

  it('requires an explicit decision for a possible match', () => {
    const [review] = createInvoiceReviewItems([ocrItem]);
    review.ingredientName = 'Shortening';
    const [match] = matchInvoiceItemsToIngredients([review], [ingredient('shortening', 'Shortening')], 'workspace-a');

    assert.match(validateInvoiceImportMatches([match]), /choose Use Existing or Create New/);
    match.decision = 'Use Existing';
    match.matchedIngredientId = 'shortening';
    match.status = 'Use Existing';
    assert.equal(validateInvoiceImportMatches([match]), '');
  });

  it('validates editable quantity, unit, price, and total before import', () => {
    const [review] = createInvoiceReviewItems([ocrItem]);
    const [match] = matchInvoiceItemsToIngredients([review], [], 'workspace-a');

    review.quantity = 0;
    assert.match(validateInvoiceImportMatches([match]), /Quantity must be greater than zero/);
    review.quantity = 2;
    review.unit = '';
    assert.match(validateInvoiceImportMatches([match]), /Unit is required/);
    review.unit = 'pack';
    review.unitPrice = -1;
    assert.match(validateInvoiceImportMatches([match]), /Unit Price cannot be negative/);
    review.unitPrice = 5;
    review.total = -1;
    assert.match(validateInvoiceImportMatches([match]), /Line Total cannot be negative/);
  });

  it('blocks duplicate new Ingredient names within the same invoice import', () => {
    const reviews = createInvoiceReviewItems([ocrItem, { ...ocrItem, name: 'SHORTENING 250G' }]);
    reviews[0].ingredientName = 'Shortening';
    reviews[1].ingredientName = 'Shortening';
    const matches = matchInvoiceItemsToIngredients(reviews, [], 'workspace-a');

    assert.match(validateInvoiceImportMatches(matches), /another new Ingredient uses this name/);
  });
});
