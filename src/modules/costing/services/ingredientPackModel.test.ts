import assert from 'node:assert/strict';
import test from 'node:test';
import type { CostingIngredient, CostingInvoiceExtractedItem } from '../types';
import {
  calculateIngredientUnitCost,
  calculatePackRecipeUnitCost,
  calculateRecipeIngredientCost,
  getGenericInvoiceLegacyPricing,
  getLegacyFieldsForPack,
  planGenericInvoicePriceUpdate,
  shouldApplyGenericInvoicePrice,
  validateIngredientPack
} from './ingredientPackModel';

const makeIngredient = (overrides: Partial<CostingIngredient> = {}): CostingIngredient => ({
  id: 'ingredient-1',
  name: 'Ingredient',
  category: '',
  purchaseUnit: 'g',
  recipeUnit: 'g',
  conversionFactor: 1,
  currentPrice: 2.45,
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

test('50g at MYR 2.45 derives MYR 0.049 per g and MYR 0.49 for 10g', () => {
  const ingredient = makeIngredient({ packQuantity: 50, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' });
  const result = calculatePackRecipeUnitCost({ packQuantity: 50, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' });
  const recipeCost = calculateRecipeIngredientCost(
    { id: 'row-1', name: 'BOH Black Tea', ingredientId: ingredient.id, qty: '10', unit: 'g' },
    ingredient
  );

  assert.equal(result.unitCost, 0.049);
  assert.equal('unitCost' in recipeCost && recipeCost.unitCost, 0.049);
  assert.equal('ingredientCost' in recipeCost && recipeCost.ingredientCost, 0.49);
  assert.deepEqual(
    getLegacyFieldsForPack({ packQuantity: 50, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' }),
    { purchaseUnit: 'g', currentPrice: 0.049, conversionFactor: 1 }
  );
});

test('1kg at MYR 17.30 derives MYR 0.0173 per g and MYR 0.519 / displayed MYR 0.52 for 30g', () => {
  const ingredient = makeIngredient({ packQuantity: 1, packUnit: 'kg', packPrice: 17.3, recipeUnit: 'g' });
  const result = calculateIngredientUnitCost(ingredient, 'g');
  const rawIngredientCost = 30 * Number(result.unitCost);
  const recipeCost = calculateRecipeIngredientCost(
    { id: 'row-1', name: 'Ceylon Tea', ingredientId: ingredient.id, qty: '30', unit: 'g' },
    ingredient
  );

  assert.equal(result.unitCost, 0.0173);
  assert.equal(rawIngredientCost, 0.519);
  assert.equal(Number(rawIngredientCost.toFixed(2)), 0.52);
  assert.equal('ingredientCost' in recipeCost && recipeCost.ingredientCost, 0.52);
});

test('390ml at MYR 3 derives the correct ml unit and 100ml ingredient costs', () => {
  const result = calculatePackRecipeUnitCost({ packQuantity: 390, packUnit: 'ml', packPrice: 3, recipeUnit: 'ml' });

  assert.ok(Math.abs(Number(result.unitCost) - (3 / 390)) < 1e-12);
  assert.equal(Number((100 * Number(result.unitCost)).toFixed(2)), 0.77);
});

test('supports kg to g and recipe quantities expressed back in kg', () => {
  const ceylon = makeIngredient({ packQuantity: 1, packUnit: 'kg', packPrice: 17.3, recipeUnit: 'g' });
  const boh = makeIngredient({ packQuantity: 50, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' });

  assert.equal(calculateIngredientUnitCost(ceylon, 'g').unitCost, 0.0173);
  assert.equal(calculateIngredientUnitCost(boh, 'kg').unitCost, 49);
  assert.equal(Number((0.01 * Number(calculateIngredientUnitCost(boh, 'kg').unitCost)).toFixed(2)), 0.49);
});

test('supports L and ml conversion in both directions', () => {
  const oil = makeIngredient({ packQuantity: 1, packUnit: 'L', packPrice: 8, recipeUnit: 'ml' });

  assert.equal(calculateIngredientUnitCost(oil, 'ml').unitCost, 0.008);
  assert.equal(calculateIngredientUnitCost(oil, 'L').unitCost, 8);
});

test('rejects incompatible mass and volume units with a clear warning', () => {
  const tea = makeIngredient({ packQuantity: 50, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' });
  const result = calculateIngredientUnitCost(tea, 'ml');
  const recipeCost = calculateRecipeIngredientCost(
    { id: 'row-1', name: 'Tea', ingredientId: tea.id, qty: '10', unit: 'ml' },
    tea
  );

  assert.equal(result.unitCost, null);
  assert.match(result.warning || '', /g and ml are incompatible/i);
  assert.match('warning' in recipeCost ? recipeCost.warning || '' : '', /g and ml are incompatible/i);
});

test('rejects zero and negative pack quantities and negative pack prices', () => {
  assert.match(validateIngredientPack({ packQuantity: 0, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' }), /greater than zero/i);
  assert.match(validateIngredientPack({ packQuantity: -50, packUnit: 'g', packPrice: 2.45, recipeUnit: 'g' }), /greater than zero/i);
  assert.match(validateIngredientPack({ packQuantity: 50, packUnit: 'g', packPrice: -2.45, recipeUnit: 'g' }), /cannot be negative/i);
});

test('legacy ingredients without pack fields retain the previous costing behavior', () => {
  const legacyIngredient = makeIngredient({ currentPrice: 2.45, purchaseUnit: 'g', recipeUnit: 'g' });
  const result = calculateIngredientUnitCost(legacyIngredient, 'g');
  const legacyOunceIngredient = makeIngredient({ currentPrice: 1, purchaseUnit: 'oz', recipeUnit: 'g' });

  assert.equal(result.source, 'legacy');
  assert.equal(result.unitCost, 2.45);
  assert.ok(Math.abs(Number(calculateIngredientUnitCost(legacyOunceIngredient, 'g').unitCost) - (1 / 28.349523)) < 1e-12);
});

test('legacy Unit conversionFactor remains authoritative exactly as before', () => {
  const legacyUnitIngredient = makeIngredient({
    currentPrice: 24,
    purchaseUnit: 'Unit',
    recipeUnit: 'dozen',
    conversionFactor: 12
  });

  const result = calculateIngredientUnitCost(legacyUnitIngredient, 'dozen');

  assert.equal(result.source, 'legacy');
  assert.equal(result.unitCost, 2);
});

test('new pack-priced Unit records use count conversion without changing the legacy path', () => {
  const result = calculatePackRecipeUnitCost({
    packQuantity: 12,
    packUnit: 'Unit',
    packPrice: 12,
    recipeUnit: 'dozen'
  });

  assert.equal(result.unitCost, 12);
});

test('generic multiple-pack invoice data never becomes an Ingredient pack definition', () => {
  const item: CostingInvoiceExtractedItem = {
    name: 'BOH Tea 50g',
    quantity: 2,
    unit: 'pcs',
    unitPrice: 2.45,
    total: 4.9
  };

  const pricing = getGenericInvoiceLegacyPricing(item, item.unitPrice);
  assert.equal('packQuantity' in pricing, false);
  assert.equal('packUnit' in pricing, false);
  assert.equal('packPrice' in pricing, false);
});

test('does not parse pack size from an invoice item description', () => {
  const item: CostingInvoiceExtractedItem = {
    name: 'BOH BLACK TEA 50G',
    quantity: 1,
    unit: 'pcs',
    unitPrice: 2.45,
    total: 2.45
  };

  const pricing = getGenericInvoiceLegacyPricing(item, item.unitPrice);
  assert.equal('packQuantity' in pricing, false);
  assert.equal('packUnit' in pricing, false);
  assert.equal('packPrice' in pricing, false);
});

test('does not treat an extended invoice total as a physical pack definition', () => {
  const item: CostingInvoiceExtractedItem = {
    name: 'BOH BLACK TEA 50G',
    quantity: 3,
    unit: 'pcs',
    unitPrice: 2.45,
    total: 7.35
  };

  const pricing = getGenericInvoiceLegacyPricing(item, item.unitPrice);
  assert.deepEqual(pricing, {
    purchaseUnit: 'pcs',
    recipeUnit: 'pcs',
    conversionFactor: 1,
    currentPrice: 2.45
  });
  assert.equal('packQuantity' in pricing, false);
  assert.equal('packPrice' in pricing, false);
});

test('ambiguous invoice pricing preserves an existing pack-priced Ingredient', () => {
  const packIngredient = makeIngredient({
    packQuantity: 50,
    packUnit: 'g',
    packPrice: 2.45,
    currentPrice: 0.049,
    purchaseUnit: 'g',
    recipeUnit: 'g'
  });
  const before = calculateRecipeIngredientCost(
    { id: 'row-1', name: 'BOH Black Tea', ingredientId: packIngredient.id, qty: '10', unit: 'g' },
    packIngredient
  );

  assert.equal(shouldApplyGenericInvoicePrice(packIngredient), false);
  assert.deepEqual(planGenericInvoicePriceUpdate(packIngredient, 2.45), {
    previousCost: 0.049,
    priceApplied: false,
    effectiveCost: 0.049,
    ingredientCurrentPriceUpdate: null
  });
  assert.equal('ingredientCost' in before && before.ingredientCost, 0.49);
  assert.deepEqual(
    { packQuantity: packIngredient.packQuantity, packUnit: packIngredient.packUnit, packPrice: packIngredient.packPrice },
    { packQuantity: 50, packUnit: 'g', packPrice: 2.45 }
  );
});

test('generic invoice pricing continues updating legacy and new Ingredients only', () => {
  assert.equal(shouldApplyGenericInvoicePrice(makeIngredient()), true);
  assert.equal(shouldApplyGenericInvoicePrice(null), true);
});
