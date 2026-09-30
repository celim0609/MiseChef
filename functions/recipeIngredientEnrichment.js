const normalize = value => String(value || '')
  .trim().toLocaleLowerCase().normalize('NFKC')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// This is an exact-alias catalog, never a USDA ranking or fuzzy match. Explicit
// qualified entries precede generic ASK ONCE families, so remembered workspace
// choices cannot override explicit culinary qualifiers.
export const RECIPE_INGREDIENT_CATALOG = [
  // Flour, starch, sugar, oils, and baking
  { baseKey: 'granulated-sugar', aliases: ['granulated sugar', 'white sugar', 'caster sugar', '砂糖', '白糖'], variantKey: 'granulated-sugar', label: 'Granulated sugar', fdcId: '169655' },
  { baseKey: 'brown-sugar', aliases: ['brown sugar', 'light brown sugar', 'dark brown sugar'], variantKey: 'brown-sugar', label: 'Brown sugar', fdcId: '168833' },
  { baseKey: 'honey', aliases: ['honey'], variantKey: 'honey', label: 'Honey', fdcId: '169640' },
  { baseKey: 'table-salt', aliases: ['salt', 'table salt', '食盐', '盐'], variantKey: 'table-salt', label: 'Table salt', fdcId: '173468' },
  { baseKey: 'all-purpose-flour', aliases: ['all purpose flour', 'all-purpose flour', 'plain flour', '中筋面粉'], variantKey: 'all-purpose-flour', label: 'All-purpose flour', fdcId: '169761' },
  { baseKey: 'bread-flour', aliases: ['bread flour'], variantKey: 'bread-flour', label: 'Bread flour', fdcId: '168913' },
  { baseKey: 'cornstarch', aliases: ['cornstarch', 'corn starch'], variantKey: 'cornstarch', label: 'Cornstarch', fdcId: '169698' },
  { baseKey: 'olive-oil', aliases: ['olive oil', '橄榄油'], variantKey: 'olive-oil', label: 'Olive oil', fdcId: '171413' },
  { baseKey: 'corn-oil', aliases: ['corn oil'], variantKey: 'corn-oil', label: 'Corn oil', fdcId: '2710183' },
  { baseKey: 'canola-oil', aliases: ['canola oil', 'rapeseed oil'], variantKey: 'canola-oil', label: 'Canola oil', fdcId: '2710188' },
  { baseKey: 'sesame-oil', aliases: ['sesame oil'], variantKey: 'sesame-oil', label: 'Sesame oil', fdcId: '171016' },
  { baseKey: 'baking-soda', aliases: ['baking soda', 'sodium bicarbonate', '小苏打'], variantKey: 'baking-soda', label: 'Baking soda', fdcId: '175040' },
  { baseKey: 'active-dry-yeast', aliases: ['active dry yeast', 'dry active yeast'], variantKey: 'active-dry-yeast', label: 'Active dry yeast', fdcId: '175043' },
  { baseKey: 'cream-of-tartar', aliases: ['cream of tartar'], variantKey: 'cream-of-tartar', label: 'Cream of tartar', fdcId: '175041' },

  // Dairy, eggs, and explicit variants. Generic terms remain ASK ONCE.
  { baseKey: 'milk', aliases: ['whole milk', 'full cream milk'], variantKey: 'milk.whole', label: 'Whole milk', fdcId: '171265' },
  { baseKey: 'milk', aliases: ['low fat milk', 'low-fat milk', '2 milk', '2% milk'], variantKey: 'milk.low-fat', label: 'Low-fat milk', fdcId: '171267' },
  { baseKey: 'milk', aliases: ['skim milk', 'fat free milk', 'fat-free milk', 'nonfat milk'], variantKey: 'milk.skim', label: 'Skim milk', fdcId: '171269' },
  { baseKey: 'buttermilk', aliases: ['buttermilk'], variantKey: 'buttermilk', label: 'Buttermilk', fdcId: '2705393' },
  { baseKey: 'butter', aliases: ['salted butter'], variantKey: 'butter.salted', label: 'Salted butter', fdcId: '173410' },
  { baseKey: 'butter', aliases: ['unsalted butter', 'un-salted butter'], variantKey: 'butter.unsalted', label: 'Unsalted butter', fdcId: '173430' },
  { baseKey: 'sour-cream', aliases: ['sour cream'], variantKey: 'sour-cream', label: 'Sour cream', fdcId: '171257' },
  { baseKey: 'cream-cheese', aliases: ['cream cheese'], variantKey: 'cream-cheese', label: 'Cream cheese', fdcId: '173418' },
  { baseKey: 'cream', aliases: ['heavy cream', 'heavy whipping cream', 'whipping cream'], variantKey: 'cream.heavy', label: 'Heavy whipping cream', fdcId: '170859' },
  { baseKey: 'cream', aliases: ['half and half', 'half-and-half'], variantKey: 'cream.half-and-half', label: 'Half-and-half', fdcId: '171255' },
  { baseKey: 'cream', aliases: ['light cream', 'table cream', 'coffee cream'], variantKey: 'cream.light', label: 'Light cream', fdcId: '170857' },
  { baseKey: 'canned-coconut-milk', aliases: ['canned coconut milk'], variantKey: 'canned-coconut-milk', label: 'Canned coconut milk', fdcId: '170173' },
  { baseKey: 'egg', aliases: ['raw egg', 'raw eggs', 'whole raw egg'], variantKey: 'egg.whole-raw', label: 'Whole egg · Raw', fdcId: '171287' },
  { baseKey: 'egg', aliases: ['egg white', 'egg whites', 'raw egg white'], variantKey: 'egg.white-raw', label: 'Egg white · Raw', fdcId: '172183' },
  { baseKey: 'egg', aliases: ['egg yolk', 'egg yolks', 'raw egg yolk'], variantKey: 'egg.yolk-raw', label: 'Egg yolk · Raw', fdcId: '172184' },
  { baseKey: 'egg', aliases: ['hard boiled egg', 'hard-boiled egg', 'hard boiled eggs'], variantKey: 'egg.whole-cooked', label: 'Whole egg · Hard-boiled', fdcId: '173424' },

  // Chocolate, flavourings, grains, and noodles.
  { baseKey: 'cocoa-powder', aliases: ['cocoa powder', 'unsweetened cocoa powder'], variantKey: 'cocoa-powder', label: 'Unsweetened cocoa powder', fdcId: '2705587' },
  { baseKey: 'vanilla-extract', aliases: ['vanilla extract'], variantKey: 'vanilla-extract', label: 'Vanilla extract', fdcId: '173471' },
  { baseKey: 'dry-oats', aliases: ['dry oats', 'rolled oats', 'quick oats'], variantKey: 'dry-oats', label: 'Dry oats', fdcId: '173904' },
  { baseKey: 'pasta', aliases: ['dry pasta', 'dried pasta', 'dry spaghetti', 'dried spaghetti'], variantKey: 'pasta.dry', label: 'Pasta · Dry', fdcId: '169736' },
  { baseKey: 'pasta', aliases: ['cooked pasta', 'cooked spaghetti'], variantKey: 'pasta.cooked', label: 'Pasta · Cooked', fdcId: '169737' },
  { baseKey: 'dry-rice-noodles', aliases: ['dry rice noodles', 'dried rice noodles'], variantKey: 'dry-rice-noodles', label: 'Rice noodles · Dry', fdcId: '169742' },
  { baseKey: 'rice', aliases: ['white rice', 'dry white rice', 'uncooked white rice'], variantKey: 'rice.white-dry', label: 'White rice · Dry', fdcId: '169756' },
  { baseKey: 'rice', aliases: ['cooked white rice'], variantKey: 'rice.white-cooked', label: 'White rice · Cooked', fdcId: '169757' },
  { baseKey: 'rice', aliases: ['brown rice', 'dry brown rice', 'uncooked brown rice'], variantKey: 'rice.brown-dry', label: 'Brown rice · Dry', fdcId: '169703' },
  { baseKey: 'rice', aliases: ['cooked brown rice'], variantKey: 'rice.brown-cooked', label: 'Brown rice · Cooked', fdcId: '169704' },

  // Raw produce; cooked forms are intentionally not aliases.
  { baseKey: 'onion', aliases: ['onion', 'onions'], variantKey: 'onion.raw', label: 'Onion · Raw', fdcId: '170000' },
  { baseKey: 'garlic', aliases: ['garlic'], variantKey: 'garlic.raw', label: 'Garlic · Raw', fdcId: '169230' },
  { baseKey: 'carrot', aliases: ['carrot', 'carrots'], variantKey: 'carrot.raw', label: 'Carrot · Raw', fdcId: '170393' },
  { baseKey: 'celery', aliases: ['celery'], variantKey: 'celery.raw', label: 'Celery · Raw', fdcId: '169988' },
  { baseKey: 'potato', aliases: ['potato', 'potatoes'], variantKey: 'potato.raw', label: 'Potato · Raw', fdcId: '170026' },
  { baseKey: 'broccoli', aliases: ['broccoli'], variantKey: 'broccoli.raw', label: 'Broccoli · Raw', fdcId: '170379' },
  { baseKey: 'cucumber', aliases: ['cucumber', 'cucumbers'], variantKey: 'cucumber.raw-with-peel', label: 'Cucumber · Raw with peel', fdcId: '2346406' },
  { baseKey: 'ginger', aliases: ['ginger', 'ginger root'], variantKey: 'ginger.raw', label: 'Ginger · Raw', fdcId: '169231' },
  { baseKey: 'tomato', aliases: ['tomato', 'tomatoes'], variantKey: 'tomato.raw', label: 'Tomato · Raw', fdcId: '2709719' },
  { baseKey: 'white-mushroom', aliases: ['white mushroom', 'white mushrooms', 'button mushroom', 'button mushrooms'], variantKey: 'white-mushroom.raw', label: 'White mushroom · Raw', fdcId: '169251' },
  { baseKey: 'scallion', aliases: ['scallion', 'scallions', 'green onion', 'green onions', 'spring onion', 'spring onions'], variantKey: 'scallion.raw', label: 'Scallion · Raw', fdcId: '170005' },
  { baseKey: 'cabbage', aliases: ['cabbage'], variantKey: 'cabbage.raw', label: 'Cabbage · Raw', fdcId: '169975' },
  { baseKey: 'spinach', aliases: ['spinach'], variantKey: 'spinach.raw', label: 'Spinach · Raw', fdcId: '168462' },

  // Fresh herbs and spices. Dried herb aliases are intentionally excluded.
  { baseKey: 'fresh-parsley', aliases: ['fresh parsley', 'parsley leaves'], variantKey: 'fresh-parsley', label: 'Parsley · Fresh', fdcId: '170416' },
  { baseKey: 'fresh-cilantro', aliases: ['fresh cilantro', 'coriander leaves', 'coriander leaf'], variantKey: 'fresh-cilantro', label: 'Cilantro · Fresh', fdcId: '169997' },
  { baseKey: 'fresh-basil', aliases: ['fresh basil', 'basil leaves'], variantKey: 'fresh-basil', label: 'Basil · Fresh', fdcId: '172232' },
  { baseKey: 'black-pepper', aliases: ['black pepper', 'ground black pepper'], variantKey: 'black-pepper', label: 'Black pepper', fdcId: '170931' },
  { baseKey: 'ground-cinnamon', aliases: ['ground cinnamon', 'cinnamon'], variantKey: 'ground-cinnamon', label: 'Cinnamon · Ground', fdcId: '171320' },
  { baseKey: 'coriander-seed', aliases: ['ground coriander', 'coriander seed', 'coriander seeds'], variantKey: 'coriander-seed', label: 'Coriander seed', fdcId: '170922' },
  { baseKey: 'ground-cumin', aliases: ['ground cumin', 'cumin'], variantKey: 'ground-cumin', label: 'Cumin · Ground', fdcId: '170923' },
  { baseKey: 'ground-turmeric', aliases: ['ground turmeric', 'turmeric'], variantKey: 'ground-turmeric', label: 'Turmeric · Ground', fdcId: '172231' },
  { baseKey: 'paprika', aliases: ['paprika'], variantKey: 'paprika', label: 'Paprika', fdcId: '171329' },
  { baseKey: 'bay-leaf', aliases: ['bay leaf', 'bay leaves'], variantKey: 'bay-leaf', label: 'Bay leaf', fdcId: '170917' },

  // Exact generic/non-branded condiment records.
  { baseKey: 'soy-sauce', aliases: ['soy sauce'], variantKey: 'soy-sauce', label: 'Soy sauce', fdcId: '2707442' },
  { baseKey: 'ketchup', aliases: ['ketchup', 'tomato ketchup'], variantKey: 'ketchup', label: 'Ketchup', fdcId: '2709733' },
  { baseKey: 'lemon-juice', aliases: ['lemon juice'], variantKey: 'lemon-juice', label: 'Lemon juice · Raw', fdcId: '167747' },

  // Explicit proteins. Bare names remain ASK ONCE or unmatched.
  { baseKey: 'chicken-breast-raw-skinless-boneless', aliases: ['raw skinless boneless chicken breast', 'skinless boneless chicken breast'], variantKey: 'chicken-breast.raw-skinless-boneless', label: 'Chicken breast · Raw · Skinless · Boneless', fdcId: '171077' },
  { baseKey: 'chicken-thigh', aliases: ['raw skinless boneless chicken thigh', 'skinless boneless chicken thigh'], variantKey: 'chicken-thigh.raw-skinless-boneless', label: 'Chicken thigh · Raw · Skinless · Boneless', fdcId: '2646171' },
  { baseKey: 'atlantic-salmon', aliases: ['raw farmed atlantic salmon', 'farmed atlantic salmon'], variantKey: 'atlantic-salmon.farmed-raw', label: 'Atlantic salmon · Farmed · Raw', fdcId: '175167' },
  { baseKey: 'atlantic-cod', aliases: ['raw atlantic cod', 'atlantic cod'], variantKey: 'atlantic-cod.raw', label: 'Atlantic cod · Raw', fdcId: '171955' },
  { baseKey: 'tuna-light-canned-water', aliases: ['canned light tuna in water', 'light tuna canned in water'], variantKey: 'tuna-light-canned-water', label: 'Light tuna · Canned in water · Drained', fdcId: '334194' },
  { baseKey: 'ground-beef', aliases: ['raw 80 20 ground beef', '80 20 ground beef'], variantKey: 'ground-beef.raw-80-20', label: 'Ground beef · Raw · 80/20', fdcId: '174036' },
  { baseKey: 'ground-beef', aliases: ['raw 90 10 ground beef', '90 10 ground beef'], variantKey: 'ground-beef.raw-90-10', label: 'Ground beef · Raw · 90/10', fdcId: '174030' },
  { baseKey: 'shrimp', aliases: ['raw shrimp'], variantKey: 'shrimp.raw', label: 'Shrimp · Raw', fdcId: '175179' },
  { baseKey: 'shrimp', aliases: ['cooked shrimp'], variantKey: 'shrimp.cooked', label: 'Shrimp · Cooked', fdcId: '175180' },

  // Genuine workspace defaults only. Cheese, stock, vegetable oil, generic fish,
  // baking powder, and other broad/specialty names deliberately remain unmatched.
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
    { variantKey: 'egg.yolk-raw', label: 'Egg yolk · Raw', fdcId: '172184' },
    { variantKey: 'egg.whole-cooked', label: 'Whole · Hard-boiled', fdcId: '173424' }
  ] },
  { baseKey: 'rice', aliases: ['rice', '米', '白米'], askOnce: [
    { variantKey: 'rice.white-dry', label: 'White rice · Dry', fdcId: '169756' },
    { variantKey: 'rice.white-cooked', label: 'White rice · Cooked', fdcId: '169757' },
    { variantKey: 'rice.brown-dry', label: 'Brown rice · Dry', fdcId: '169703' },
    { variantKey: 'rice.brown-cooked', label: 'Brown rice · Cooked', fdcId: '169704' }
  ] },
  { baseKey: 'pasta', aliases: ['pasta', 'spaghetti'], askOnce: [
    { variantKey: 'pasta.dry', label: 'Dry', fdcId: '169736' },
    { variantKey: 'pasta.cooked', label: 'Cooked', fdcId: '169737' }
  ] },
  { baseKey: 'cream', aliases: ['cream'], askOnce: [
    { variantKey: 'cream.heavy', label: 'Heavy · Whipping', fdcId: '170859' },
    { variantKey: 'cream.half-and-half', label: 'Half-and-half', fdcId: '171255' },
    { variantKey: 'cream.light', label: 'Light · Table', fdcId: '170857' }
  ] },
  { baseKey: 'ground-beef', aliases: ['ground beef', 'minced beef'], askOnce: [
    { variantKey: 'ground-beef.raw-80-20', label: 'Raw · 80/20', fdcId: '174036' },
    { variantKey: 'ground-beef.raw-90-10', label: 'Raw · 90/10', fdcId: '174030' }
  ] },
  { baseKey: 'shrimp', aliases: ['shrimp', 'prawns'], askOnce: [
    { variantKey: 'shrimp.raw', label: 'Raw', fdcId: '175179' },
    { variantKey: 'shrimp.cooked', label: 'Cooked', fdcId: '175180' }
  ] }
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
