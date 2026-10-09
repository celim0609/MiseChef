import { HttpsError } from 'firebase-functions/v2/https';
import { hasActiveBusinessEntitlement, resolveWorkspaceSubscription, requireWorkspaceAccess } from './subscriptionFoundation.js';
import { calculateRecipeCosting, normalizeIngredient } from './recipeCostRuntime.generated.js';
import { mayCalculateRecipe, projectNutritionProfile } from './recipeNutritionAccess.js';

export const authorizeRecipePipeline = async (db, request) => {
  const uid = request.auth?.uid;
  const workspaceId = typeof request.data?.workspaceId === 'string' ? request.data.workspaceId.trim() : '';
  const access = await requireWorkspaceAccess({ db, uid, workspaceId });
  if (!mayCalculateRecipe(access.role)) throw new HttpsError('permission-denied', 'Your role cannot calculate Recipes.');
  return { uid, workspaceId };
};

export const createRecipePipelineService = db => ({
  async saveChefProfile(request) {
    const uid = request.auth?.uid;
    const workspaceId = typeof request.data?.workspaceId === 'string' ? request.data.workspaceId.trim() : '';
    const access = await requireWorkspaceAccess({ db, uid, workspaceId });
    const subscription = resolveWorkspaceSubscription({ data: access.workspaceSnapshot.data() });
    if (!['Owner', 'Manager', 'Head Chef', 'Purchasing'].includes(access.role) || !hasActiveBusinessEntitlement(subscription)) {
      throw new HttpsError('permission-denied', 'Your role cannot manage Ingredient nutrition.');
    }
    const input = request.data?.profile || {};
    const ingredientId = input.ingredientId;
    if (typeof ingredientId !== 'string' || !ingredientId || ingredientId.includes('/')) throw new HttpsError('invalid-argument', 'Canonical Ingredient ID is required.');
    const ingredient = await db.collection('ingredients').doc(ingredientId).get();
    if (!ingredient.exists || ingredient.data()?.workspaceId !== workspaceId) throw new HttpsError('permission-denied', 'Ingredient belongs to another workspace or is unavailable.');
    const existingProfile = await db.collection('ingredientNutritionProfiles').doc(ingredientId).get();
    if (existingProfile.exists && existingProfile.data()?.workspaceId !== workspaceId) throw new HttpsError('permission-denied', 'Nutrition profile belongs to another workspace.');
    const nonFood = input.source === 'chef_non_food' && input.kind === 'non_food';
    const food = input.source === 'chef_override' && input.kind === 'food';
    if (nonFood && (input.kcalPer100g !== undefined || input.kcalPer100ml !== undefined || input.gramsPerPiece !== undefined || input.catalogProfileId !== undefined)) {
      throw new HttpsError('invalid-argument', 'Non-food profiles cannot contain food nutrition values.');
    }
    const validEnergy = value => Number.isFinite(value) && value >= 0;
    if ((!nonFood && !food) || (food && !validEnergy(input.kcalPer100g) && !validEnergy(input.kcalPer100ml))
      || (food && ((input.kcalPer100g !== undefined && !validEnergy(input.kcalPer100g)) || (input.kcalPer100ml !== undefined && !validEnergy(input.kcalPer100ml))
      || (input.gramsPerPiece !== undefined && (!Number.isFinite(input.gramsPerPiece) || input.gramsPerPiece <= 0 || !validEnergy(input.kcalPer100g)))))) {
      throw new HttpsError('invalid-argument', 'Confirm valid nutrition values or explicitly mark this Ingredient non-food.');
    }
    const now = new Date().toISOString();
    const profile = { id: ingredientId, ingredientId, workspaceId, kind: nonFood ? 'non_food' : 'food', source: input.source, status: 'approved', confirmedBy: uid, confirmedAt: now, updatedAt: now,
      ...(food && input.kcalPer100g !== undefined ? { kcalPer100g: input.kcalPer100g } : {}),
      ...(food && input.kcalPer100ml !== undefined ? { kcalPer100ml: input.kcalPer100ml } : {}),
      ...(food && input.gramsPerPiece !== undefined ? { gramsPerPiece: input.gramsPerPiece } : {}) };
    await db.collection('ingredientNutritionProfiles').doc(ingredientId).set(profile);
    return { profile };
  },
  async profiles(request) {
    const workspaceId = typeof request.data?.workspaceId === 'string' ? request.data.workspaceId.trim() : '';
    const access = await requireWorkspaceAccess({ db, uid: request.auth?.uid, workspaceId });
    const purchasing = access.role === 'Purchasing' && hasActiveBusinessEntitlement(resolveWorkspaceSubscription({ data: access.workspaceSnapshot.data() }));
    if (!mayCalculateRecipe(access.role) && !purchasing) throw new HttpsError('permission-denied', 'Your role cannot read Ingredient nutrition.');
    const [profiles, ingredients] = await Promise.all([
      db.collection('ingredientNutritionProfiles').where('workspaceId', '==', workspaceId).get(),
      db.collection('ingredients').where('workspaceId', '==', workspaceId).get()
    ]);
    const names = new Map(ingredients.docs.map(document => [document.id, document.data().name || '']));
    const ids = [...new Set(profiles.docs.map(document => document.data().catalogProfileId).filter(Boolean))];
    const catalog = new Map(await Promise.all(ids.map(async id => [id, (await db.collection('nutritionCatalog').doc(id).get()).data()])));
    return { profiles: Object.fromEntries(profiles.docs.map(document => [document.id, projectNutritionProfile(
      { ...document.data(), id: document.id }, catalog.get(document.data().catalogProfileId), names.get(document.id)
    )])) };
  },
  async costing(request) {
    const { workspaceId } = await authorizeRecipePipeline(db, request);
    const draft = request.data?.recipe;
    if (draft && (!draft.id || !Array.isArray(draft.ingredients) || (draft.workspaceId && draft.workspaceId !== workspaceId))) {
      throw new HttpsError('invalid-argument', 'Recipe must belong to the active workspace.');
    }
    if (draft) {
      const existing = await db.collection('recipes').doc(draft.id).get();
      if (existing.exists && existing.data()?.workspaceId !== workspaceId) throw new HttpsError('permission-denied', 'Recipe belongs to another workspace.');
    }
    const [ingredients, snapshots] = await Promise.all([
      db.collection('ingredients').where('workspaceId', '==', workspaceId).get(),
      db.collection('recipes').where('workspaceId', '==', workspaceId).get()
    ]);
    const recipes = snapshots.docs.map(document => ({ ...document.data(), id: document.id }));
    const input = draft ? [...recipes.filter(recipe => recipe.id !== draft.id), { ...draft, workspaceId }] : recipes;
    const changedId = request.data?.changedRecipeId;
    const dependsOn = (recipe, visited = new Set()) => {
      if (visited.has(recipe.id)) return false;
      visited.add(recipe.id);
      return (recipe.linkedRecipes || []).some(link => link.recipeId === changedId || dependsOn(input.find(candidate => candidate.id === link.recipeId) || { id: link.recipeId }, visited));
    };
    const targets = draft ? input.filter(recipe => recipe.id === draft.id) : changedId ? input.filter(recipe => recipe.id !== changedId && dependsOn(recipe)) : input;
    const library = ingredients.docs.map(document => normalizeIngredient({ ...document.data(), id: document.id }));
    // No database writes or ingredient-edit authority. Same calculator as the app.
    return JSON.parse(JSON.stringify({ recipes: targets.map(recipe => calculateRecipeCosting(recipe, library, new Date().toISOString(), input)) }));
  }
});
