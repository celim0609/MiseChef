const normalize = value => String(value || '')
  .trim().toLocaleLowerCase().normalize('NFKC')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// This deliberately small server-owned catalog contains culinary meanings, never
// search rankings. `askOnce` is reserved for genuine variants of one ingredient.
export const RECIPE_INGREDIENT_CATALOG = [
  { baseKey: 'granulated-sugar', aliases: ['granulated sugar', 'white sugar', 'caster sugar', '砂糖', '白糖'], variantKey: 'granulated-sugar', label: 'Granulated sugar', fdcId: '169655' },
  { baseKey: 'table-salt', aliases: ['salt', 'table salt', '食盐', '盐'], variantKey: 'table-salt', label: 'Table salt', fdcId: '173468' },
  { baseKey: 'all-purpose-flour', aliases: ['all purpose flour', 'all-purpose flour', 'plain flour', '中筋面粉'], variantKey: 'all-purpose-flour', label: 'All-purpose flour', fdcId: '169761' },
  { baseKey: 'olive-oil', aliases: ['olive oil', '橄榄油'], variantKey: 'olive-oil', label: 'Olive oil', fdcId: '171413' },
  { baseKey: 'baking-soda', aliases: ['baking soda', 'sodium bicarbonate', '小苏打'], variantKey: 'baking-soda', label: 'Baking soda', fdcId: '175040' },
  { baseKey: 'chicken-breast', aliases: ['chicken breast', '鸡胸肉'], askOnce: [
    { variantKey: 'chicken-breast.raw-skinless-boneless', label: 'Raw · Skinless · Boneless', fdcId: '171077' }
  ] },
  { baseKey: 'milk', aliases: ['milk', '牛奶'], askOnce: [
    { variantKey: 'milk.whole', label: 'Whole milk', fdcId: '171265' },
    { variantKey: 'milk.low-fat', label: 'Low-fat milk', fdcId: '171267' },
    { variantKey: 'milk.skim', label: 'Skim milk', fdcId: '171269' }
  ] },
  { baseKey: 'butter', aliases: ['butter', '牛油', '黄油'], askOnce: [
    { variantKey: 'butter.salted', label: 'Salted', fdcId: '173410' },
    { variantKey: 'butter.unsalted', label: 'Unsalted', fdcId: '173430' }
  ] },
  { baseKey: 'egg', aliases: ['egg', 'eggs', '鸡蛋'], askOnce: [
    { variantKey: 'egg.whole-raw', label: 'Whole · Raw', fdcId: '171287' },
    { variantKey: 'egg.white-raw', label: 'Egg white · Raw', fdcId: '172183' },
    { variantKey: 'egg.whole-cooked', label: 'Whole · Cooked', fdcId: '173424' }
  ] },
  { baseKey: 'rice', aliases: ['rice', '米', '白米'], askOnce: [
    { variantKey: 'rice.white-dry', label: 'White rice · Dry', fdcId: '169756' },
    { variantKey: 'rice.white-cooked', label: 'White rice · Cooked', fdcId: '169757' },
    { variantKey: 'rice.brown-dry', label: 'Brown rice · Dry', fdcId: '169703' },
    { variantKey: 'rice.brown-cooked', label: 'Brown rice · Cooked', fdcId: '169704' }
  ] },
  // Broad terms deliberately remain unresolved: cheese, stock, cream, beef, fish.
];

export const normalizeRecipeIngredientName = normalize;

export const findRecipeIngredientFamily = input => {
  const normalized = normalize(input);
  return RECIPE_INGREDIENT_CATALOG.find(entry => entry.aliases.map(normalize).includes(normalized)) || null;
};

export const findRecipeIngredientVariant = (family, variantKey) => (
  family?.variantKey === variantKey ? family : family?.askOnce?.find(variant => variant.variantKey === variantKey) || null
);

export const resolverOptions = family => (family?.askOnce || []).map(({ variantKey, label }) => ({ variantKey, label }));
