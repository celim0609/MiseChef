import type { CostingIngredient, CostingInvoiceExtractedItem } from '../types';
import type { Ingredient } from '../../../types';

type MeasurementDimension = 'mass' | 'volume' | 'count';

type MeasurementDefinition = {
  dimension: MeasurementDimension;
  baseQuantity: number;
  displayUnit: string;
};

const MEASUREMENT_UNITS: Record<string, MeasurementDefinition> = {
  mg: { dimension: 'mass', baseQuantity: 0.001, displayUnit: 'mg' },
  milligram: { dimension: 'mass', baseQuantity: 0.001, displayUnit: 'mg' },
  milligrams: { dimension: 'mass', baseQuantity: 0.001, displayUnit: 'mg' },
  g: { dimension: 'mass', baseQuantity: 1, displayUnit: 'g' },
  gram: { dimension: 'mass', baseQuantity: 1, displayUnit: 'g' },
  grams: { dimension: 'mass', baseQuantity: 1, displayUnit: 'g' },
  kg: { dimension: 'mass', baseQuantity: 1000, displayUnit: 'kg' },
  kilogram: { dimension: 'mass', baseQuantity: 1000, displayUnit: 'kg' },
  kilograms: { dimension: 'mass', baseQuantity: 1000, displayUnit: 'kg' },
  oz: { dimension: 'mass', baseQuantity: 28.349523, displayUnit: 'oz' },
  ounce: { dimension: 'mass', baseQuantity: 28.349523, displayUnit: 'oz' },
  ounces: { dimension: 'mass', baseQuantity: 28.349523, displayUnit: 'oz' },
  lb: { dimension: 'mass', baseQuantity: 453.59237, displayUnit: 'lb' },
  lbs: { dimension: 'mass', baseQuantity: 453.59237, displayUnit: 'lb' },
  pound: { dimension: 'mass', baseQuantity: 453.59237, displayUnit: 'lb' },
  pounds: { dimension: 'mass', baseQuantity: 453.59237, displayUnit: 'lb' },
  ml: { dimension: 'volume', baseQuantity: 1, displayUnit: 'ml' },
  millilitre: { dimension: 'volume', baseQuantity: 1, displayUnit: 'ml' },
  millilitres: { dimension: 'volume', baseQuantity: 1, displayUnit: 'ml' },
  milliliter: { dimension: 'volume', baseQuantity: 1, displayUnit: 'ml' },
  milliliters: { dimension: 'volume', baseQuantity: 1, displayUnit: 'ml' },
  l: { dimension: 'volume', baseQuantity: 1000, displayUnit: 'L' },
  litre: { dimension: 'volume', baseQuantity: 1000, displayUnit: 'L' },
  litres: { dimension: 'volume', baseQuantity: 1000, displayUnit: 'L' },
  liter: { dimension: 'volume', baseQuantity: 1000, displayUnit: 'L' },
  liters: { dimension: 'volume', baseQuantity: 1000, displayUnit: 'L' },
  tsp: { dimension: 'volume', baseQuantity: 5, displayUnit: 'tsp' },
  teaspoon: { dimension: 'volume', baseQuantity: 5, displayUnit: 'tsp' },
  teaspoons: { dimension: 'volume', baseQuantity: 5, displayUnit: 'tsp' },
  tbsp: { dimension: 'volume', baseQuantity: 15, displayUnit: 'tbsp' },
  tablespoon: { dimension: 'volume', baseQuantity: 15, displayUnit: 'tbsp' },
  tablespoons: { dimension: 'volume', baseQuantity: 15, displayUnit: 'tbsp' },
  pc: { dimension: 'count', baseQuantity: 1, displayUnit: 'pcs' },
  pcs: { dimension: 'count', baseQuantity: 1, displayUnit: 'pcs' },
  piece: { dimension: 'count', baseQuantity: 1, displayUnit: 'pcs' },
  pieces: { dimension: 'count', baseQuantity: 1, displayUnit: 'pcs' },
  each: { dimension: 'count', baseQuantity: 1, displayUnit: 'pcs' },
  dozen: { dimension: 'count', baseQuantity: 12, displayUnit: 'dozen' },
  dozens: { dimension: 'count', baseQuantity: 12, displayUnit: 'dozen' }
};

export const normalizeMeasurementUnit = (value = '') => (
  value.trim().toLocaleLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')
);

export const getMeasurementDefinition = (unit = '') => MEASUREMENT_UNITS[normalizeMeasurementUnit(unit)];

const getPackMeasurementDefinition = (unit = '') => {
  const normalizedUnit = normalizeMeasurementUnit(unit);
  if (normalizedUnit === 'unit' || normalizedUnit === 'units') {
    return { dimension: 'count', baseQuantity: 1, displayUnit: 'Unit' } as MeasurementDefinition;
  }
  return MEASUREMENT_UNITS[normalizedUnit];
};

export const hasIngredientPackData = (
  ingredient: Pick<CostingIngredient, 'packQuantity' | 'packUnit' | 'packPrice'>
) => ingredient.packQuantity !== undefined || ingredient.packUnit !== undefined || ingredient.packPrice !== undefined;

export type PackValidationInput = {
  packQuantity: number;
  packUnit: string;
  packPrice: number;
  recipeUnit: string;
};

export const validateIngredientPack = (input: PackValidationInput) => {
  if (!Number.isFinite(input.packQuantity) || input.packQuantity <= 0) return 'Pack Quantity must be greater than zero.';
  if (!input.packUnit.trim()) return 'Pack Unit is required.';
  if (!getPackMeasurementDefinition(input.packUnit)) return 'Pack Unit must be a supported mass, volume, or count unit.';
  if (!Number.isFinite(input.packPrice) || input.packPrice < 0) return 'Pack Price cannot be negative.';
  if (!input.recipeUnit.trim()) return 'Recipe Unit is required.';
  if (!getPackMeasurementDefinition(input.recipeUnit)) return 'Recipe Unit must be a supported mass, volume, or count unit.';
  return '';
};

export const calculatePackRecipeUnitCost = (input: PackValidationInput) => {
  const validationError = validateIngredientPack(input);
  if (validationError) return { unitCost: null, warning: validationError };

  const packDefinition = getPackMeasurementDefinition(input.packUnit);
  const recipeDefinition = getPackMeasurementDefinition(input.recipeUnit);
  if (!packDefinition || !recipeDefinition || packDefinition.dimension !== recipeDefinition.dimension) {
    return {
      unitCost: null,
      warning: `Cannot calculate cost: ${input.packUnit || 'pack unit'} and ${input.recipeUnit || 'recipe unit'} are incompatible.`
    };
  }

  return {
    unitCost: input.packPrice * (recipeDefinition.baseQuantity / (input.packQuantity * packDefinition.baseQuantity)),
    warning: ''
  };
};

type UnitCostResult = {
  unitCost: number | null;
  costingUnit: string;
  warning?: string;
  source: 'pack' | 'legacy';
};

const incompatibleUnitWarning = (fromUnit: string, toUnit: string) => (
  `Cannot calculate cost: ${fromUnit || 'purchase unit'} and ${toUnit || 'recipe unit'} are incompatible.`
);

export const calculateIngredientUnitCost = (
  ingredient: CostingIngredient,
  targetUnit: string
): UnitCostResult => {
  const costingUnit = targetUnit || ingredient.recipeUnit || ingredient.packUnit || ingredient.purchaseUnit;
  const targetDefinition = getMeasurementDefinition(costingUnit);

  if (hasIngredientPackData(ingredient)) {
    const packQuantity = Number(ingredient.packQuantity);
    const packPrice = Number(ingredient.packPrice);
    const packUnit = ingredient.packUnit || '';
    const packCost = calculatePackRecipeUnitCost({
      packQuantity,
      packUnit,
      packPrice,
      recipeUnit: costingUnit
    });

    if (packCost.unitCost === null) return { unitCost: null, costingUnit, warning: packCost.warning, source: 'pack' };

    return {
      unitCost: packCost.unitCost,
      costingUnit,
      source: 'pack'
    };
  }

  const purchasePrice = Number(ingredient.currentPrice);
  const purchaseUnit = ingredient.purchaseUnit || '';
  const purchaseDefinition = getMeasurementDefinition(purchaseUnit);
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    return { unitCost: null, costingUnit, warning: 'Cannot calculate cost: the ingredient price is invalid.', source: 'legacy' };
  }

  if (purchaseDefinition && targetDefinition && purchaseDefinition.dimension === targetDefinition.dimension) {
    return {
      unitCost: purchasePrice * (targetDefinition.baseQuantity / purchaseDefinition.baseQuantity),
      costingUnit,
      source: 'legacy'
    };
  }

  if (normalizeMeasurementUnit(costingUnit) === normalizeMeasurementUnit(purchaseUnit) && costingUnit) {
    return { unitCost: purchasePrice, costingUnit, source: 'legacy' };
  }

  const conversionFactor = Number(ingredient.conversionFactor);
  if (
    Number.isFinite(conversionFactor)
    && conversionFactor > 0
    && normalizeMeasurementUnit(costingUnit) === normalizeMeasurementUnit(ingredient.recipeUnit)
  ) {
    return { unitCost: purchasePrice / conversionFactor, costingUnit, source: 'legacy' };
  }

  return {
    unitCost: null,
    costingUnit,
    warning: incompatibleUnitWarning(purchaseUnit, costingUnit),
    source: 'legacy'
  };
};

export const parseRecipeQuantity = (value = '') => {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed) return 0;

  const mixedFraction = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const numerator = Number(mixedFraction[2]);
    const denominator = Number(mixedFraction[3]);
    return denominator ? whole + numerator / denominator : 0;
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator ? numerator / denominator : 0;
  }

  const numericMatch = trimmed.match(/(?:\d+(?:\.\d+)?|\.\d+)/);
  if (!numericMatch) return 0;

  const parsed = Number(numericMatch[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateRecipeIngredientCost = (
  recipeIngredient: Ingredient,
  libraryIngredient: CostingIngredient
) => {
  const quantity = parseRecipeQuantity(recipeIngredient.qty);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { warning: 'Cannot calculate cost: recipe quantity must be greater than zero.' };
  }

  const recipeUnit = recipeIngredient.unit || libraryIngredient.recipeUnit || libraryIngredient.packUnit || libraryIngredient.purchaseUnit;
  const unitCostResult = calculateIngredientUnitCost(libraryIngredient, recipeUnit);
  if (unitCostResult.unitCost === null) return { warning: unitCostResult.warning };

  const normalizedQuantity = Number(quantity.toFixed(6));
  const normalizedUnitCost = Number(unitCostResult.unitCost.toFixed(6));
  return {
    quantity: normalizedQuantity,
    unitCost: normalizedUnitCost,
    ingredientCost: Number((normalizedQuantity * normalizedUnitCost).toFixed(2)),
    costingUnit: unitCostResult.costingUnit
  };
};

export const getLegacyFieldsForPack = (input: PackValidationInput) => {
  const packDefinition = getPackMeasurementDefinition(input.packUnit);
  const recipeDefinition = getPackMeasurementDefinition(input.recipeUnit);
  const conversionFactor = packDefinition && recipeDefinition && packDefinition.dimension === recipeDefinition.dimension
    ? packDefinition.baseQuantity / recipeDefinition.baseQuantity
    : 1;

  return {
    purchaseUnit: input.packUnit,
    currentPrice: input.packPrice / input.packQuantity,
    conversionFactor
  };
};

export const getGenericInvoiceLegacyPricing = (
  item: CostingInvoiceExtractedItem,
  invoiceUnitCost: number
) => ({
  purchaseUnit: item.unit || '',
  recipeUnit: item.unit || '',
  conversionFactor: 1,
  currentPrice: invoiceUnitCost
});

export const shouldApplyGenericInvoicePrice = (ingredient?: CostingIngredient | null) => (
  !ingredient || !hasIngredientPackData(ingredient)
);

export const planGenericInvoicePriceUpdate = (
  ingredient: CostingIngredient | null,
  invoiceUnitCost: number
) => {
  const previousCost = ingredient ? Number(ingredient.currentPrice || 0) : null;
  const priceApplied = shouldApplyGenericInvoicePrice(ingredient);

  return {
    previousCost,
    priceApplied,
    effectiveCost: priceApplied ? invoiceUnitCost : previousCost ?? invoiceUnitCost,
    ingredientCurrentPriceUpdate: priceApplied ? invoiceUnitCost : null
  };
};
