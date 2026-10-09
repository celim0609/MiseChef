// src/modules/nutrition/services/nutritionUnits.ts
var UNITS = {
  mg: { dimension: "mass", baseQuantity: 1e-3 },
  milligram: { dimension: "mass", baseQuantity: 1e-3 },
  milligrams: { dimension: "mass", baseQuantity: 1e-3 },
  g: { dimension: "mass", baseQuantity: 1 },
  gram: { dimension: "mass", baseQuantity: 1 },
  grams: { dimension: "mass", baseQuantity: 1 },
  kg: { dimension: "mass", baseQuantity: 1e3 },
  kilogram: { dimension: "mass", baseQuantity: 1e3 },
  kilograms: { dimension: "mass", baseQuantity: 1e3 },
  oz: { dimension: "mass", baseQuantity: 28.349523125 },
  ounce: { dimension: "mass", baseQuantity: 28.349523125 },
  ounces: { dimension: "mass", baseQuantity: 28.349523125 },
  lb: { dimension: "mass", baseQuantity: 453.59237 },
  lbs: { dimension: "mass", baseQuantity: 453.59237 },
  pound: { dimension: "mass", baseQuantity: 453.59237 },
  pounds: { dimension: "mass", baseQuantity: 453.59237 },
  ml: { dimension: "volume", baseQuantity: 1 },
  millilitre: { dimension: "volume", baseQuantity: 1 },
  millilitres: { dimension: "volume", baseQuantity: 1 },
  milliliter: { dimension: "volume", baseQuantity: 1 },
  milliliters: { dimension: "volume", baseQuantity: 1 },
  l: { dimension: "volume", baseQuantity: 1e3 },
  litre: { dimension: "volume", baseQuantity: 1e3 },
  litres: { dimension: "volume", baseQuantity: 1e3 },
  liter: { dimension: "volume", baseQuantity: 1e3 },
  liters: { dimension: "volume", baseQuantity: 1e3 },
  tsp: { dimension: "volume", baseQuantity: 5 },
  teaspoon: { dimension: "volume", baseQuantity: 5 },
  teaspoons: { dimension: "volume", baseQuantity: 5 },
  tbsp: { dimension: "volume", baseQuantity: 15 },
  tablespoon: { dimension: "volume", baseQuantity: 15 },
  tablespoons: { dimension: "volume", baseQuantity: 15 },
  pcs: { dimension: "count", baseQuantity: 1 },
  pc: { dimension: "count", baseQuantity: 1 },
  piece: { dimension: "count", baseQuantity: 1 },
  pieces: { dimension: "count", baseQuantity: 1 },
  no: { dimension: "count", baseQuantity: 1 },
  nos: { dimension: "count", baseQuantity: 1 }
};
var getNutritionUnit = (unit = "") => UNITS[unit.trim().toLocaleLowerCase().replace(/\./g, "").replace(/\s+/g, " ")];

// src/modules/costing/services/linkedRecipeUsage.ts
var resolveLinkedRecipeUsage = (child, quantity, unit = "portion") => {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ratio: null, reason: "A positive linked quantity is required." };
  if (unit === "portion") {
    if (!Number.isInteger(child.servings) || child.servings <= 0) return { ratio: null, reason: "Valid child servings are required for portion links." };
    return { ratio: quantity / child.servings };
  }
  const usedUnit = getNutritionUnit(unit);
  const finished = child.nutritionYield;
  const finishedUnit = finished && getNutritionUnit(finished.unit);
  if (!finished || !Number.isFinite(finished.quantity) || finished.quantity <= 0 || !usedUnit || !finishedUnit || usedUnit.dimension !== finishedUnit.dimension) {
    return { ratio: null, reason: "A compatible, explicitly confirmed finished yield is required." };
  }
  const ratio = quantity * usedUnit.baseQuantity / (finished.quantity * finishedUnit.baseQuantity);
  return Number.isFinite(ratio) && ratio > 0 ? { ratio } : { ratio: null, reason: "Linked quantity conversion is out of range." };
};

// src/modules/costing/services/ingredientPackModel.ts
var MEASUREMENT_UNITS = {
  mg: { dimension: "mass", baseQuantity: 1e-3, displayUnit: "mg" },
  milligram: { dimension: "mass", baseQuantity: 1e-3, displayUnit: "mg" },
  milligrams: { dimension: "mass", baseQuantity: 1e-3, displayUnit: "mg" },
  g: { dimension: "mass", baseQuantity: 1, displayUnit: "g" },
  gram: { dimension: "mass", baseQuantity: 1, displayUnit: "g" },
  grams: { dimension: "mass", baseQuantity: 1, displayUnit: "g" },
  kg: { dimension: "mass", baseQuantity: 1e3, displayUnit: "kg" },
  kilogram: { dimension: "mass", baseQuantity: 1e3, displayUnit: "kg" },
  kilograms: { dimension: "mass", baseQuantity: 1e3, displayUnit: "kg" },
  oz: { dimension: "mass", baseQuantity: 28.349523, displayUnit: "oz" },
  ounce: { dimension: "mass", baseQuantity: 28.349523, displayUnit: "oz" },
  ounces: { dimension: "mass", baseQuantity: 28.349523, displayUnit: "oz" },
  lb: { dimension: "mass", baseQuantity: 453.59237, displayUnit: "lb" },
  lbs: { dimension: "mass", baseQuantity: 453.59237, displayUnit: "lb" },
  pound: { dimension: "mass", baseQuantity: 453.59237, displayUnit: "lb" },
  pounds: { dimension: "mass", baseQuantity: 453.59237, displayUnit: "lb" },
  ml: { dimension: "volume", baseQuantity: 1, displayUnit: "ml" },
  millilitre: { dimension: "volume", baseQuantity: 1, displayUnit: "ml" },
  millilitres: { dimension: "volume", baseQuantity: 1, displayUnit: "ml" },
  milliliter: { dimension: "volume", baseQuantity: 1, displayUnit: "ml" },
  milliliters: { dimension: "volume", baseQuantity: 1, displayUnit: "ml" },
  l: { dimension: "volume", baseQuantity: 1e3, displayUnit: "L" },
  litre: { dimension: "volume", baseQuantity: 1e3, displayUnit: "L" },
  litres: { dimension: "volume", baseQuantity: 1e3, displayUnit: "L" },
  liter: { dimension: "volume", baseQuantity: 1e3, displayUnit: "L" },
  liters: { dimension: "volume", baseQuantity: 1e3, displayUnit: "L" },
  tsp: { dimension: "volume", baseQuantity: 5, displayUnit: "tsp" },
  teaspoon: { dimension: "volume", baseQuantity: 5, displayUnit: "tsp" },
  teaspoons: { dimension: "volume", baseQuantity: 5, displayUnit: "tsp" },
  tbsp: { dimension: "volume", baseQuantity: 15, displayUnit: "tbsp" },
  tablespoon: { dimension: "volume", baseQuantity: 15, displayUnit: "tbsp" },
  tablespoons: { dimension: "volume", baseQuantity: 15, displayUnit: "tbsp" },
  pc: { dimension: "count", baseQuantity: 1, displayUnit: "pcs" },
  pcs: { dimension: "count", baseQuantity: 1, displayUnit: "pcs" },
  piece: { dimension: "count", baseQuantity: 1, displayUnit: "pcs" },
  pieces: { dimension: "count", baseQuantity: 1, displayUnit: "pcs" },
  each: { dimension: "count", baseQuantity: 1, displayUnit: "pcs" },
  dozen: { dimension: "count", baseQuantity: 12, displayUnit: "dozen" },
  dozens: { dimension: "count", baseQuantity: 12, displayUnit: "dozen" }
};
var normalizeMeasurementUnit = (value = "") => value.trim().toLocaleLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
var getMeasurementDefinition = (unit = "") => MEASUREMENT_UNITS[normalizeMeasurementUnit(unit)];
var getPackMeasurementDefinition = (unit = "") => {
  const normalizedUnit = normalizeMeasurementUnit(unit);
  if (normalizedUnit === "unit" || normalizedUnit === "units") {
    return { dimension: "count", baseQuantity: 1, displayUnit: "Unit" };
  }
  return MEASUREMENT_UNITS[normalizedUnit];
};
var hasIngredientPackData = (ingredient) => ingredient.packQuantity !== void 0 || ingredient.packUnit !== void 0 || ingredient.packPrice !== void 0;
var validateIngredientPack = (input) => {
  if (!Number.isFinite(input.packQuantity) || input.packQuantity <= 0) return "Pack Quantity must be greater than zero.";
  if (!input.packUnit.trim()) return "Pack Unit is required.";
  if (!getPackMeasurementDefinition(input.packUnit)) return "Pack Unit must be a supported mass, volume, or count unit.";
  if (!Number.isFinite(input.packPrice) || input.packPrice < 0) return "Pack Price cannot be negative.";
  if (!input.recipeUnit.trim()) return "Recipe Unit is required.";
  if (!getPackMeasurementDefinition(input.recipeUnit)) return "Recipe Unit must be a supported mass, volume, or count unit.";
  return "";
};
var calculatePackRecipeUnitCost = (input) => {
  const validationError = validateIngredientPack(input);
  if (validationError) return { unitCost: null, warning: validationError };
  const packDefinition = getPackMeasurementDefinition(input.packUnit);
  const recipeDefinition = getPackMeasurementDefinition(input.recipeUnit);
  if (!packDefinition || !recipeDefinition || packDefinition.dimension !== recipeDefinition.dimension) {
    return {
      unitCost: null,
      warning: `Cannot calculate cost: ${input.packUnit || "pack unit"} and ${input.recipeUnit || "recipe unit"} are incompatible.`
    };
  }
  return {
    unitCost: input.packPrice * (recipeDefinition.baseQuantity / (input.packQuantity * packDefinition.baseQuantity)),
    warning: ""
  };
};
var incompatibleUnitWarning = (fromUnit, toUnit) => `Cannot calculate cost: ${fromUnit || "purchase unit"} and ${toUnit || "recipe unit"} are incompatible.`;
var calculateIngredientUnitCost = (ingredient, targetUnit) => {
  const costingUnit = targetUnit || ingredient.recipeUnit || ingredient.packUnit || ingredient.purchaseUnit;
  const targetDefinition = getMeasurementDefinition(costingUnit);
  if (hasIngredientPackData(ingredient)) {
    const packQuantity = Number(ingredient.packQuantity);
    const packPrice = Number(ingredient.packPrice);
    const packUnit = ingredient.packUnit || "";
    const packCost = calculatePackRecipeUnitCost({
      packQuantity,
      packUnit,
      packPrice,
      recipeUnit: costingUnit
    });
    if (packCost.unitCost === null) return { unitCost: null, costingUnit, warning: packCost.warning, source: "pack" };
    return {
      unitCost: packCost.unitCost,
      costingUnit,
      source: "pack"
    };
  }
  const purchasePrice = Number(ingredient.currentPrice);
  const purchaseUnit = ingredient.purchaseUnit || "";
  const purchaseDefinition = getMeasurementDefinition(purchaseUnit);
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    return { unitCost: null, costingUnit, warning: "Cannot calculate cost: the ingredient price is invalid.", source: "legacy" };
  }
  if (purchaseDefinition && targetDefinition && purchaseDefinition.dimension === targetDefinition.dimension) {
    return {
      unitCost: purchasePrice * (targetDefinition.baseQuantity / purchaseDefinition.baseQuantity),
      costingUnit,
      source: "legacy"
    };
  }
  if (normalizeMeasurementUnit(costingUnit) === normalizeMeasurementUnit(purchaseUnit) && costingUnit) {
    return { unitCost: purchasePrice, costingUnit, source: "legacy" };
  }
  const conversionFactor = Number(ingredient.conversionFactor);
  if (Number.isFinite(conversionFactor) && conversionFactor > 0 && normalizeMeasurementUnit(costingUnit) === normalizeMeasurementUnit(ingredient.recipeUnit)) {
    return { unitCost: purchasePrice / conversionFactor, costingUnit, source: "legacy" };
  }
  return {
    unitCost: null,
    costingUnit,
    warning: incompatibleUnitWarning(purchaseUnit, costingUnit),
    source: "legacy"
  };
};
var parseRecipeQuantity = (value = "") => {
  const trimmed = value.trim().replace(/,/g, "");
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
var calculateRecipeIngredientCost = (recipeIngredient, libraryIngredient) => {
  const quantity = parseRecipeQuantity(recipeIngredient.qty);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { warning: "Cannot calculate cost: recipe quantity must be greater than zero." };
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

// src/modules/costing/services/recipeDependencyModel.ts
var CircularRecipeDependencyError = class extends Error {
  constructor(path) {
    super(`Circular recipe dependency detected: ${path.join(" \u2192 ")}`);
    this.name = "CircularRecipeDependencyError";
  }
};

// src/modules/costing/services/recipeCostCalculator.ts
var normalizeName = (value = "") => value.trim().toLowerCase().replace(/\s+/g, " ");
var roundMoney = (value) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
var roundQuantity = (value) => Number((Number.isFinite(value) ? value : 0).toFixed(6));
var roundPercent = (value) => Number((Number.isFinite(value) ? value : 0).toFixed(1));
var resolveRecipePerPortionCost = (recipe) => {
  const cost = Number(recipe?.costing?.costPerPortion);
  const hasCanonicalBreakdown = Boolean(recipe?.costing?.breakdown?.length);
  return hasCanonicalBreakdown && Number(recipe?.servings || 0) > 0 && Number.isFinite(cost) && cost >= 0 ? roundMoney(cost) : null;
};
var resolveLinkedRecipeCost = (child, component) => {
  if (!child) return null;
  if (!component.unit || component.unit === "portion") {
    const unitCost = resolveRecipePerPortionCost(child);
    return unitCost === null || !Number.isFinite(component.quantity) || component.quantity <= 0 ? null : { unitCost, contribution: roundMoney(component.quantity * unitCost) };
  }
  const usage = resolveLinkedRecipeUsage(child, component.quantity, component.unit);
  const batchCost = child.costing?.totalRecipeCost;
  if (usage.ratio === null || !child.costing?.breakdown?.length || !Number.isFinite(batchCost) || batchCost < 0) return null;
  const contribution = batchCost * usage.ratio;
  return Number.isFinite(contribution) ? { unitCost: contribution / component.quantity, contribution: roundMoney(contribution) } : null;
};
var removeCalculatedIngredientCost = (ingredient, costingWarning) => {
  const {
    unitCost: _unitCost,
    ingredientCost: _ingredientCost,
    costingUnit: _costingUnit,
    costLastCalculatedAt: _costLastCalculatedAt,
    costingWarning: _costingWarning,
    ...uncostedIngredient
  } = ingredient;
  return costingWarning ? { ...uncostedIngredient, costingWarning } : uncostedIngredient;
};
var findIngredientMatch = (recipeIngredient, ingredients) => {
  if (recipeIngredient.ingredientId) {
    const byId = ingredients.find((ingredient) => ingredient.id === recipeIngredient.ingredientId);
    if (byId) return byId;
  }
  const recipeIngredientName = normalizeName(recipeIngredient.name);
  return ingredients.find((ingredient) => normalizeName(ingredient.name) === recipeIngredientName) || null;
};
var calculateRecipeCosting = (recipe, ingredients, calculatedAt = (/* @__PURE__ */ new Date()).toISOString(), recipes = [], dependencyPath = []) => {
  if (dependencyPath.includes(recipe.id)) {
    throw new CircularRecipeDependencyError([...dependencyPath, recipe.id]);
  }
  const nextDependencyPath = [...dependencyPath, recipe.id];
  const activeIngredients = ingredients.filter((ingredient) => ingredient.status === "Active");
  const linkedRecipeWarnings = [];
  const costedIngredients = recipe.ingredients.map((recipeIngredient) => {
    if ((recipe.linkedRecipes || []).some((component) => component.associatedIngredientId === recipeIngredient.id)) {
      return removeCalculatedIngredientCost(recipeIngredient);
    }
    const matchedIngredient = findIngredientMatch(recipeIngredient, activeIngredients);
    if (!matchedIngredient) return removeCalculatedIngredientCost(recipeIngredient);
    const calculatedCost = calculateRecipeIngredientCost(recipeIngredient, matchedIngredient);
    if (!("unitCost" in calculatedCost)) {
      return removeCalculatedIngredientCost(recipeIngredient, calculatedCost.warning);
    }
    return {
      ...recipeIngredient,
      ingredientId: matchedIngredient.id,
      unitCost: calculatedCost.unitCost,
      ingredientCost: calculatedCost.ingredientCost,
      costingUnit: calculatedCost.costingUnit,
      costLastCalculatedAt: calculatedAt,
      costingWarning: void 0
    };
  });
  const linkedRecipeBreakdown = (recipe.linkedRecipes || []).map((component) => {
    if (component.recipeId === recipe.id) throw new CircularRecipeDependencyError([recipe.id, recipe.id]);
    const linkedRecipe = recipes.find((candidate) => candidate.id === component.recipeId);
    if (!linkedRecipe) {
      linkedRecipeWarnings.push(`${component.recipeTitle || "Linked recipe"}: child costing is unavailable.`);
      return {
        recipeIngredientId: component.id,
        linkedRecipeId: component.recipeId,
        itemType: "linkedRecipe",
        ingredientName: component.recipeTitle || "Unavailable linked recipe",
        quantity: roundQuantity(Number(component.quantity)),
        unit: component.unit || "portion",
        unitCost: 0,
        ingredientCost: 0,
        percentageOfTotalRecipeCost: 0
      };
    }
    const calculatedLinkedRecipe = calculateRecipeCosting(
      linkedRecipe,
      ingredients,
      calculatedAt,
      recipes,
      nextDependencyPath
    );
    const quantity = Math.max(0, Number(component.quantity) || 0);
    const resolvedCost = resolveLinkedRecipeCost(calculatedLinkedRecipe, { quantity, unit: component.unit || "portion" });
    if (resolvedCost === null || calculatedLinkedRecipe.costing?.linkedRecipeWarnings?.length) {
      linkedRecipeWarnings.push(`${component.recipeTitle || linkedRecipe.title}: child costing is unavailable or incomplete. Check finished yield for measured links.`);
    }
    const unitCost = resolvedCost?.unitCost ?? 0;
    return {
      recipeIngredientId: component.id,
      linkedRecipeId: component.recipeId,
      itemType: "linkedRecipe",
      ingredientName: component.recipeTitle || linkedRecipe.title,
      quantity: roundQuantity(quantity),
      unit: component.unit || "portion",
      unitCost,
      ingredientCost: resolvedCost?.contribution ?? 0,
      percentageOfTotalRecipeCost: 0
    };
  });
  const ingredientTotal = costedIngredients.reduce((total, ingredient) => total + Number(ingredient.ingredientCost || 0), 0);
  const linkedRecipeTotal = linkedRecipeBreakdown.reduce((total, item) => total + item.ingredientCost, 0);
  const totalRecipeCost = roundMoney(ingredientTotal + linkedRecipeTotal);
  const servings = Number(recipe.servings || 0);
  const costPerPortion = servings > 0 ? roundMoney(totalRecipeCost / servings) : 0;
  const sellingPrice = Number(recipe.sellingPrice ?? recipe.costing?.sellingPrice ?? 0);
  const foodCostPercentage = sellingPrice > 0 ? roundPercent(costPerPortion / sellingPrice * 100) : 0;
  const grossProfitPercentage = sellingPrice > 0 ? roundPercent((sellingPrice - costPerPortion) / sellingPrice * 100) : 0;
  const breakdown = costedIngredients.filter((ingredient) => Number(ingredient.ingredientCost || 0) > 0).map((ingredient) => ({
    recipeIngredientId: ingredient.id,
    ingredientId: ingredient.ingredientId,
    itemType: "ingredient",
    ingredientName: ingredient.name,
    quantity: roundQuantity(parseRecipeQuantity(ingredient.qty)),
    unit: ingredient.costingUnit || ingredient.unit,
    unitCost: Number(ingredient.unitCost || 0),
    ingredientCost: Number(ingredient.ingredientCost || 0),
    percentageOfTotalRecipeCost: totalRecipeCost > 0 ? roundPercent(Number(ingredient.ingredientCost || 0) / totalRecipeCost * 100) : 0
  }));
  const completeBreakdown = [...breakdown, ...linkedRecipeBreakdown].filter((item) => item.ingredientCost > 0).map((item) => ({
    ...item,
    percentageOfTotalRecipeCost: totalRecipeCost > 0 ? roundPercent(item.ingredientCost / totalRecipeCost * 100) : 0
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
      breakdown: completeBreakdown,
      ...linkedRecipeWarnings.length ? { linkedRecipeWarnings } : {},
      lastCalculatedAt: calculatedAt
    },
    recipeCostLastCalculatedAt: calculatedAt
  };
};

// src/modules/costing/services/normalizeCostingIngredient.ts
var normalizeIngredient = (ingredient) => ({
  ...ingredient,
  ...ingredient.packQuantity !== void 0 ? { packQuantity: Number(ingredient.packQuantity) } : {},
  ...ingredient.packPrice !== void 0 ? { packPrice: Number(ingredient.packPrice) } : {},
  conversionFactor: Number(ingredient.conversionFactor || 1),
  currentPrice: Number(ingredient.currentPrice || 0),
  yieldPercentage: Number(ingredient.yieldPercentage || 100),
  wastePercentage: Number(ingredient.wastePercentage || 0),
  status: ingredient.status || "Active"
});
export {
  calculateRecipeCosting,
  normalizeIngredient
};
