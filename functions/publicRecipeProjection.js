const readString = value => typeof value === 'string' ? value.trim() : '';

const readNumber = value => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
};

const readStringArray = value => Array.isArray(value)
  ? value.map(readString).filter(Boolean)
  : [];

export const readPublicExternalUrl = value => {
  const url = readString(value);
  if (!url) return '';

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:' ? parsedUrl.toString() : '';
  } catch {
    return '';
  }
};

const sanitizeIngredients = value => Array.isArray(value)
  ? value.flatMap(ingredient => {
      if (!ingredient || typeof ingredient !== 'object') return [];
      const name = readString(ingredient.name);
      if (!name) return [];

      const publicIngredient = {
        qty: readString(ingredient.qty ?? ingredient.quantity),
        unit: readString(ingredient.unit),
        name
      };
      const preparationNote = readString(ingredient.notes ?? ingredient.preparationNote);
      if (preparationNote) publicIngredient.notes = preparationNote;
      return [publicIngredient];
    })
  : [];

const sanitizeMethod = value => Array.isArray(value)
  ? value.flatMap((step, index) => {
      if (!step || typeof step !== 'object') return [];
      const description = readString(step.description);
      const image = readString(step.image);
      if (!description && !image) return [];

      const publicStep = {
        stepNumber: readNumber(step.stepNumber) || index + 1,
        description
      };
      if (image) publicStep.image = image;
      return [publicStep];
    })
  : [];

export const sanitizePublicRecommendedProducts = value => Array.isArray(value)
  ? value.flatMap(product => {
      if (!product || typeof product !== 'object') return [];
      const name = readString(product.name);
      const url = readPublicExternalUrl(product.url);
      if (!name || !url) return [];

      return [{ name, url }];
    })
  : [];

export const buildPublicRecipeProjection = (source, chefUsername = '') => {
  const categories = readStringArray(source.categories);
  const category = readString(source.category) || categories[0] || '';
  const coverImage = readString(source.coverImage || source.imageUrl);
  const publicRecipe = {
    title: readString(source.title),
    coverImage,
    category,
    categories: categories.length ? categories : category ? [category] : [],
    prepTime: readNumber(source.prepTime),
    cookTime: readNumber(source.cookTime),
    servings: readNumber(source.servings),
    yield: readString(source.yield),
    story: readString(source.story),
    ingredients: sanitizeIngredients(source.ingredients),
    recommendedProducts: sanitizePublicRecommendedProducts(source.recommendedProducts),
    method: sanitizeMethod(source.method),
    chefName: readString(source.chefName),
    createdAt: readString(source.createdAt),
    visibility: 'public'
  };

  const normalizedChefUsername = readString(chefUsername).toLowerCase();
  if (normalizedChefUsername) publicRecipe.chefUsername = normalizedChefUsername;
  return publicRecipe;
};
