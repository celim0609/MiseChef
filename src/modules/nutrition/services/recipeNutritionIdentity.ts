import type { IngredientNutritionProfile } from '../../../types';

// Nutrition-only identities: never change ingredient IDs, names, costing links,
// or the enrichment matcher. No substring, qualifier stripping or fuzzy matching.
const normalize = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const operationalNames = new Set(['coaster', '12 oz cup']);
const waterNames = new Set(['water', 'plain water', 'water (水)', '水', 'ice', 'plain ice']);
const saltNames = new Set(['salt', 'table salt', 'salt (盐)', '盐', '食盐']);

type NutritionIdentity = Pick<IngredientNutritionProfile, 'kind' | 'status' | 'catalogProfileId' | 'kcalPer100g' | 'kcalPer100ml' | 'gramsPerPiece'> & Partial<Pick<IngredientNutritionProfile, 'source'>>;

// Verified against USDA FDC on 2026-10-07, explicit nutrient 1008 (kcal):
// https://fdc.nal.usda.gov/food-details/173647/nutrients
// "Beverages, water, tap, drinking": 0 kcal/100 g; 1 liter = 1000 g.
// Plain ice is frozen water. Its volume kcal is zero because its verified mass
// energy is exactly zero, NOT because we assume water density for frozen ice.
// This identity only supplies energy; it makes no sodium/mineral claims.
const water: NutritionIdentity = {
  kind: 'food', status: 'approved', source: 'usda_fdc', catalogProfileId: '173647',
  kcalPer100g: 0, kcalPer100ml: 0
};
// Same canonical FDC identity as the existing table-salt enrichment catalog:
// https://fdc.nal.usda.gov/food-details/173468/nutrients
// "Salt, table": explicit 0 kcal/100 g. No generic salt volume conversion.
const salt: NutritionIdentity = {
  kind: 'food', status: 'approved', source: 'usda_fdc', catalogProfileId: '173468', kcalPer100g: 0
};

// USDA FDC verified 2026-10-08: nutrient 1008, explicit kcal per 100 g.
// 2709248 "Passion fruit, raw": 97 kcal. Generic edible raw fruit profile,
// not juice/nectar and not the skin or whole fruit including refuse.
// 169097 "Oranges, raw, all commercial varieties": 47 kcal, edible raw fruit.
// Mass only: no assumed density, piece weight, yield or slice conversion.
const rawFruitIdentities: Record<string, NutritionIdentity> = {};
for (const name of ['passion fruit pulp', 'raw passion fruit pulp', 'fresh passion fruit pulp']) {
  rawFruitIdentities[name] = { kind: 'food', status: 'approved', source: 'usda_fdc', catalogProfileId: '2709248', kcalPer100g: 97 };
}
for (const name of ['fresh orange', 'raw orange', 'fresh orange flesh', 'raw orange flesh']) {
  rawFruitIdentities[name] = { kind: 'food', status: 'approved', source: 'usda_fdc', catalogProfileId: '169097', kcalPer100g: 47 };
}

export const resolveRecipeNutritionIdentity = (name: string, profile?: IngredientNutritionProfile): NutritionIdentity | undefined => {
  // Explicit profiles take precedence, including non-food and chef overrides.
  // An existing unapproved profile must not be silently bypassed.
  if (profile) return profile;
  const key = normalize(name);
  if (operationalNames.has(key)) return { kind: 'non_food', status: 'approved' };
  if (waterNames.has(key)) return water;
  if (saltNames.has(key)) return salt;
  return Object.hasOwn(rawFruitIdentities, key) ? rawFruitIdentities[key] : undefined;
};
