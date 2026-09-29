export type NutritionUnitDimension = 'mass' | 'volume' | 'count';

export type NutritionUnit = {
  dimension: NutritionUnitDimension;
  baseQuantity: number;
};

const UNITS: Record<string, NutritionUnit> = {
  mg: { dimension: 'mass', baseQuantity: 0.001 },
  milligram: { dimension: 'mass', baseQuantity: 0.001 },
  milligrams: { dimension: 'mass', baseQuantity: 0.001 },
  g: { dimension: 'mass', baseQuantity: 1 },
  gram: { dimension: 'mass', baseQuantity: 1 },
  grams: { dimension: 'mass', baseQuantity: 1 },
  kg: { dimension: 'mass', baseQuantity: 1000 },
  kilogram: { dimension: 'mass', baseQuantity: 1000 },
  kilograms: { dimension: 'mass', baseQuantity: 1000 },
  oz: { dimension: 'mass', baseQuantity: 28.349523125 },
  ounce: { dimension: 'mass', baseQuantity: 28.349523125 },
  ounces: { dimension: 'mass', baseQuantity: 28.349523125 },
  lb: { dimension: 'mass', baseQuantity: 453.59237 },
  lbs: { dimension: 'mass', baseQuantity: 453.59237 },
  pound: { dimension: 'mass', baseQuantity: 453.59237 },
  pounds: { dimension: 'mass', baseQuantity: 453.59237 },
  ml: { dimension: 'volume', baseQuantity: 1 },
  millilitre: { dimension: 'volume', baseQuantity: 1 },
  millilitres: { dimension: 'volume', baseQuantity: 1 },
  milliliter: { dimension: 'volume', baseQuantity: 1 },
  milliliters: { dimension: 'volume', baseQuantity: 1 },
  l: { dimension: 'volume', baseQuantity: 1000 },
  litre: { dimension: 'volume', baseQuantity: 1000 },
  litres: { dimension: 'volume', baseQuantity: 1000 },
  liter: { dimension: 'volume', baseQuantity: 1000 },
  liters: { dimension: 'volume', baseQuantity: 1000 },
  tsp: { dimension: 'volume', baseQuantity: 5 },
  teaspoon: { dimension: 'volume', baseQuantity: 5 },
  teaspoons: { dimension: 'volume', baseQuantity: 5 },
  tbsp: { dimension: 'volume', baseQuantity: 15 },
  tablespoon: { dimension: 'volume', baseQuantity: 15 },
  tablespoons: { dimension: 'volume', baseQuantity: 15 },
  pcs: { dimension: 'count', baseQuantity: 1 },
  pc: { dimension: 'count', baseQuantity: 1 },
  piece: { dimension: 'count', baseQuantity: 1 },
  pieces: { dimension: 'count', baseQuantity: 1 },
  no: { dimension: 'count', baseQuantity: 1 },
  nos: { dimension: 'count', baseQuantity: 1 }
};

export const getNutritionUnit = (unit = '') => UNITS[unit.trim().toLocaleLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')];
