// These projections never write or replace approved nutrition data.
export const recipeNutritionRoles = ['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef'];
export const mayCalculateRecipe = role => recipeNutritionRoles.includes(role);
export const projectNutritionProfile = (profile, catalog, ingredientName = '') => {
  const foodDescription = catalog?.description || profile.foodDescription || profile.resolutionAudit?.usdaDescription;
  const reviewWarnings = [];
  if (profile.source === 'usda_fdc' && !foodDescription) reviewWarnings.push('USDA food description unavailable; review this selection.');
  // Deliberately narrow mismatch checks; never silently correct approved data.
  if (/^(caster sugar|sugar|white sugar|sugar \(糖\))$/i.test(ingredientName.trim()) && /cookie|biscuit|cake|candy/i.test(foodDescription || '')) {
    reviewWarnings.push('Selected USDA food appears to be a prepared product rather than sugar. Review this selection.');
  }
  return { ...profile, ...(foodDescription ? { foodDescription } : {}), ...(reviewWarnings.length ? { reviewWarnings } : {}) };
};
