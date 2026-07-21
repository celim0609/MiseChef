import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Ingredient, Recipe, RecipeCostBreakdownItem } from '../../../types';
import type { CostingIngredient } from '../types';
import { ingredientService } from './ingredientService';
import type { IngredientCostChange } from './costIntelligenceService';

const normalizeName = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');

const parseQuantity = (value = '') => {
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

const roundMoney = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
const roundUnitCost = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(6));
const roundQuantity = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(6));
const roundPercent = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(1));

type MeasurementDefinition = {
  dimension: 'mass' | 'volume' | 'count';
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

const normalizeMeasurementUnit = (value = '') => value.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');

const removeCalculatedIngredientCost = (ingredient: Ingredient): Ingredient => {
  const {
    unitCost: _unitCost,
    ingredientCost: _ingredientCost,
    costingUnit: _costingUnit,
    costLastCalculatedAt: _costLastCalculatedAt,
    ...uncostedIngredient
  } = ingredient;
  return uncostedIngredient;
};

const calculateNormalizedIngredientCost = (
  recipeIngredient: Ingredient,
  matchedIngredient: CostingIngredient
) => {
  const quantity = parseQuantity(recipeIngredient.qty);
  const purchasePrice = Number(matchedIngredient.currentPrice);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(purchasePrice) || purchasePrice < 0) {
    return null;
  }

  const recipeUnitKey = normalizeMeasurementUnit(
    recipeIngredient.unit || matchedIngredient.recipeUnit || matchedIngredient.purchaseUnit
  );
  const purchaseUnitKey = normalizeMeasurementUnit(matchedIngredient.purchaseUnit);
  const configuredRecipeUnitKey = normalizeMeasurementUnit(matchedIngredient.recipeUnit);
  const recipeUnitDefinition = MEASUREMENT_UNITS[recipeUnitKey];
  const purchaseUnitDefinition = MEASUREMENT_UNITS[purchaseUnitKey];

  let unitCost: number | null = null;
  let costingUnit = recipeIngredient.unit || matchedIngredient.recipeUnit || matchedIngredient.purchaseUnit;

  if (
    recipeUnitDefinition
    && purchaseUnitDefinition
    && recipeUnitDefinition.dimension === purchaseUnitDefinition.dimension
  ) {
    unitCost = purchasePrice * (recipeUnitDefinition.baseQuantity / purchaseUnitDefinition.baseQuantity);
    costingUnit = recipeIngredient.unit || recipeUnitDefinition.displayUnit;
  } else if (recipeUnitKey && recipeUnitKey === purchaseUnitKey) {
    unitCost = purchasePrice;
  } else {
    const conversionFactor = Number(matchedIngredient.conversionFactor);
    const canUseConfiguredConversion = Number.isFinite(conversionFactor)
      && conversionFactor > 0
      && recipeUnitKey
      && recipeUnitKey === configuredRecipeUnitKey;
    if (canUseConfiguredConversion) {
      unitCost = purchasePrice / conversionFactor;
      costingUnit = recipeIngredient.unit || matchedIngredient.recipeUnit;
    }
  }

  if (unitCost === null || !Number.isFinite(unitCost) || unitCost < 0) return null;

  const normalizedQuantity = roundQuantity(quantity);
  const normalizedUnitCost = roundUnitCost(unitCost);
  return {
    quantity: normalizedQuantity,
    unitCost: normalizedUnitCost,
    ingredientCost: roundMoney(normalizedQuantity * normalizedUnitCost),
    costingUnit
  };
};

const findIngredientMatch = (recipeIngredient: Ingredient, ingredients: CostingIngredient[]) => {
  if (recipeIngredient.ingredientId) {
    const byId = ingredients.find(ingredient => ingredient.id === recipeIngredient.ingredientId);
    if (byId) return byId;
  }

  const recipeIngredientName = normalizeName(recipeIngredient.name);
  return ingredients.find(ingredient => normalizeName(ingredient.name) === recipeIngredientName) || null;
};

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

export const recipeCostService = {
  calculateRecipeCosting(recipe: Recipe, ingredients: CostingIngredient[], calculatedAt = new Date().toISOString()): Recipe {
    const activeIngredients = ingredients.filter(ingredient => ingredient.status === 'Active');
    const costedIngredients = recipe.ingredients.map(recipeIngredient => {
      const matchedIngredient = findIngredientMatch(recipeIngredient, activeIngredients);
      if (!matchedIngredient) return removeCalculatedIngredientCost(recipeIngredient);
      const calculatedCost = calculateNormalizedIngredientCost(recipeIngredient, matchedIngredient);
      if (!calculatedCost) return removeCalculatedIngredientCost(recipeIngredient);

      return {
        ...recipeIngredient,
        ingredientId: matchedIngredient.id,
        unitCost: calculatedCost.unitCost,
        ingredientCost: calculatedCost.ingredientCost,
        costingUnit: calculatedCost.costingUnit,
        costLastCalculatedAt: calculatedAt
      };
    });

    const totalRecipeCost = roundMoney(costedIngredients.reduce((total, ingredient) => total + Number(ingredient.ingredientCost || 0), 0));
    const servings = Number(recipe.servings || 0);
    const costPerPortion = servings > 0 ? roundMoney(totalRecipeCost / servings) : 0;
    const sellingPrice = Number(recipe.sellingPrice ?? recipe.costing?.sellingPrice ?? 0);
    const foodCostPercentage = sellingPrice > 0 ? roundPercent((costPerPortion / sellingPrice) * 100) : 0;
    const grossProfitPercentage = sellingPrice > 0 ? roundPercent(((sellingPrice - costPerPortion) / sellingPrice) * 100) : 0;
    const breakdown: RecipeCostBreakdownItem[] = costedIngredients
      .filter(ingredient => Number(ingredient.ingredientCost || 0) > 0)
      .map(ingredient => ({
        recipeIngredientId: ingredient.id,
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        quantity: roundQuantity(parseQuantity(ingredient.qty)),
        unit: ingredient.costingUnit || ingredient.unit,
        unitCost: Number(ingredient.unitCost || 0),
        ingredientCost: Number(ingredient.ingredientCost || 0),
        percentageOfTotalRecipeCost: totalRecipeCost > 0
          ? roundPercent((Number(ingredient.ingredientCost || 0) / totalRecipeCost) * 100)
          : 0
      }));

    return {
      ...recipe,
      ingredients: costedIngredients,
      sellingPrice,
      costing: {
        totalRecipeCost,
        costPerPortion,
        sellingPrice,
        foodCostPercentage,
        grossProfitPercentage,
        breakdown,
        lastCalculatedAt: calculatedAt
      },
      recipeCostLastCalculatedAt: calculatedAt
    };
  },

  async applyCosting(recipe: Recipe, userId: string, workspaceId = userId): Promise<Recipe> {
    const ingredients = await ingredientService.listIngredients(workspaceId);
    return this.calculateRecipeCosting(recipe, ingredients);
  },

  async recalculateRecipesForCostChanges({
    costChanges,
    userId,
    workspaceId = userId
  }: {
    costChanges: IngredientCostChange[];
    userId: string;
    workspaceId?: string;
  }) {
    if (!db || costChanges.length === 0) return [];

    const changedIngredientIds = new Set(costChanges.map(change => change.ingredientId));
    const changedIngredientNames = new Set(costChanges.map(change => normalizeName(change.ingredientName)));
    const [ingredients, recipesSnapshot] = await Promise.all([
      ingredientService.listIngredients(workspaceId),
      getDocs(query(collection(db, 'recipes'), where('workspaceId', '==', workspaceId)))
    ]);

    const updatedRecipes: Recipe[] = [];
    const updatePromises = recipesSnapshot.docs.map(async recipeDoc => {
      const recipe = { id: recipeDoc.id, ...recipeDoc.data() } as Recipe;
      const usesChangedIngredient = (recipe.ingredients || []).some(ingredient => (
        (ingredient.ingredientId && changedIngredientIds.has(ingredient.ingredientId)) ||
        changedIngredientNames.has(normalizeName(ingredient.name))
      ));

      if (!usesChangedIngredient) return;

      const costedRecipe = this.calculateRecipeCosting(recipe, ingredients);
      updatedRecipes.push(costedRecipe);
      await updateDoc(doc(db, 'recipes', recipe.id), removeUndefinedFields({
        ingredients: costedRecipe.ingredients,
        sellingPrice: costedRecipe.sellingPrice,
        costing: costedRecipe.costing,
        recipeCostLastCalculatedAt: costedRecipe.recipeCostLastCalculatedAt,
        updatedAt: new Date().toISOString()
      }) as unknown as Record<string, unknown>);
    });

    await Promise.all(updatePromises);
    return updatedRecipes;
  }
};
