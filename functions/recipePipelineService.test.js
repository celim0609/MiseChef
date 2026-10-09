import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecipePipelineService } from './recipePipelineService.js';
import { projectNutritionProfile } from './recipeNutritionAccess.js';
const workspaceId = 'a';
const recipe = { id: 'r', workspaceId, title: 'Recipe', servings: 2, ingredients: [{ id: 'row', ingredientId: 'sugar', name: 'Caster Sugar', qty: '100', unit: 'g' }] };
const fixture = (role, allowWrites = false) => {
  const documents = {
    workspaces: { a: { ownerId: 'owner', subscriptionPlan: 'professional', subscriptionStatus: 'active', trialStartedAt: null, trialEndsAt: null }, b: { ownerId: 'outsider' } },
    workspaceMembers: { a_member: { workspaceId: 'a', userId: 'member', status: 'Active', role } },
    recipes: { r: recipe, foreign: { ...recipe, id: 'foreign', workspaceId: 'b' }, parent: { ...recipe, id: 'parent', ingredients: [], linkedRecipes: [{ id: 'l', recipeId: 'r', quantity: 0.4, unit: 'portion' }] } },
    ingredients: { sugar: { id: 'sugar', workspaceId, name: 'Caster Sugar', status: 'Active', currentPrice: 4, purchaseUnit: 'kg', recipeUnit: 'g', conversionFactor: 1000, yieldPercentage: 100, wastePercentage: 0 }, foreign: { workspaceId: 'b', name: 'Foreign' } },
    ingredientNutritionProfiles: { sugar: { id: 'sugar', ingredientId: 'sugar', workspaceId, source: 'usda_fdc', status: 'approved', kind: 'food', catalogProfileId: 'cookie', kcalPer100g: 523 }, foreign: { workspaceId: 'b', kcalPer100g: 900 } },
    nutritionCatalog: { cookie: { description: 'Cookie, sugar or plain, sugar free' } }
  };
  const snapshot = (id, value) => ({ id, exists: Boolean(value), data: () => value });
  const db = { collection: name => ({
    doc: id => ({ get: async () => snapshot(id, documents[name]?.[id]), set: async value => { assert.ok(allowWrites && name === 'ingredientNutritionProfiles', 'Only explicit profile confirmation may write'); documents[name][id] = value; }, update: () => assert.fail('Pipeline must not write') }),
    where: (field, operator, value) => {
      assert.equal(field, 'workspaceId'); assert.equal(operator, '=='); assert.equal(value, workspaceId);
      return { get: async () => ({ docs: Object.entries(documents[name] || {}).filter(([,doc]) => doc.workspaceId === value).map(([id,doc]) => snapshot(id,doc)) }) };
    }
  }) };
  return { service: createRecipePipelineService(db), documents };
};
for (const role of ['Owner', 'Manager', 'Sous Chef', 'Chef']) {
  test(`${role} resolves the same workspace profiles and can calculate a Recipe without raw Ingredient editing`, async () => {
    const { service, documents } = fixture(role);
    const original = JSON.stringify(documents);
    const request = { auth: { uid: role === 'Owner' ? 'owner' : 'member' }, data: { workspaceId } };
    const data = await service.profiles(request);
    assert.deepEqual(Object.keys(data.profiles), ['sugar']);
    assert.equal(data.profiles.sugar.kcalPer100g, 523);
    assert.match(data.profiles.sugar.foodDescription, /Cookie/);
    assert.equal(data.profiles.sugar.reviewWarnings.length, 1);
    const result = await service.costing({ ...request, data: { workspaceId, recipe } });
    assert.equal(result.recipes[0].costing.totalRecipeCost, 0.4);
    assert.equal(result.recipes[0].costing.costPerPortion, 0.2);
    assert.equal(JSON.stringify(documents), original);
  });
}

test('unauthenticated, nonmember, Viewer and inactive memberships are denied', async () => {
  for (const request of [{ data: { workspaceId } }, { auth: { uid: 'outsider' }, data: { workspaceId } }, { auth: { uid: 'member' }, data: { workspaceId } }]) {
    const { service } = fixture('Viewer');
    await assert.rejects(service.profiles(request), error => ['unauthenticated', 'permission-denied'].includes(error.code));
    await assert.rejects(service.costing(request), error => ['unauthenticated', 'permission-denied'].includes(error.code));
  }
  const { service, documents } = fixture('Chef'); documents.workspaceMembers.a_member.status = 'Inactive';
  await assert.rejects(service.costing({ auth: { uid: 'member' }, data: { workspaceId } }), error => error.code === 'permission-denied');
});

test('workspace spoofing and an existing foreign Recipe ID fail closed', async () => {
  const { service } = fixture('Chef'); const auth = { uid: 'member' };
  await assert.rejects(service.profiles({ auth, data: { workspaceId: 'b' } }), error => error.code === 'permission-denied');
  await assert.rejects(service.costing({ auth, data: { workspaceId, recipe: { ...recipe, workspaceId: 'b' } } }), error => error.code === 'invalid-argument');
  await assert.rejects(service.costing({ auth, data: { workspaceId, recipe: { ...recipe, id: 'foreign' } } }), error => error.code === 'permission-denied');
});

test('dependent recalculation returns transitive parents only and uses existing fractional costing', async () => {
  const { service } = fixture('Chef');
  const result = await service.costing({ auth: { uid: 'member' }, data: { workspaceId, changedRecipeId: 'r' } });
  assert.deepEqual(result.recipes.map(r => r.id), ['parent']);
  assert.equal(result.recipes[0].costing.totalRecipeCost, 0.08);
});

test('USDA descriptions are projected without mutating persisted approvals; unknown descriptions require review', () => {
  const profile = { source: 'usda_fdc', kcalPer100g: 523 };
  const original = JSON.stringify(profile);
  assert.match(projectNutritionProfile(profile, undefined, 'Caster Sugar').reviewWarnings[0], /unavailable/);
  assert.equal(JSON.stringify(profile), original);
  assert.equal(projectNutritionProfile({ ...profile, foodDescription: 'Sugar, granulated' }, undefined, 'Sugar').foodDescription, 'Sugar, granulated');
});

for (const role of ['Owner', 'Manager', 'Head Chef', 'Purchasing']) {
  test(`${role} may explicitly confirm packaging or nutrition without changing Ingredient costs`, async () => {
    const { service, documents } = fixture(role, true);
    const originalIngredient = JSON.stringify(documents.ingredients.sugar);
    delete documents.ingredientNutritionProfiles.sugar; // New confirmations must work, not only updates.
    const uid = role === 'Owner' ? 'owner' : 'member';
    const result = await service.saveChefProfile({ auth: { uid }, data: { workspaceId, profile: { ingredientId: 'sugar', kind: 'non_food', source: 'chef_non_food' } } });
    assert.equal(result.profile.kind, 'non_food'); assert.equal(result.profile.kcalPer100g, undefined);
    assert.equal(result.profile.confirmedBy, uid); assert.equal(JSON.stringify(documents.ingredients.sugar), originalIngredient);
    const food = await service.saveChefProfile({ auth: { uid }, data: { workspaceId, profile: { ingredientId: 'sugar', kind: 'food', source: 'chef_override', kcalPer100g: 0, kcalPer100ml: 0 } } });
    assert.equal(food.profile.kcalPer100g, 0); assert.equal(food.profile.kcalPer100ml, 0);
  });
}

test('Chef/Sous Chef profile writes, foreign Ingredients, forged USDA approval and invalid values are denied', async () => {
  for (const role of ['Chef', 'Sous Chef']) {
    const { service } = fixture(role);
    await assert.rejects(service.saveChefProfile({ auth: { uid: 'member' }, data: { workspaceId, profile: { ingredientId: 'sugar', kind: 'non_food', source: 'chef_non_food' } } }), error => error.code === 'permission-denied');
  }
  const { service } = fixture('Manager');
  for (const profile of [
    { ingredientId: 'foreign', kind: 'food', source: 'chef_override', kcalPer100g: 1 },
    { ingredientId: 'sugar', kind: 'non_food', source: 'chef_non_food', kcalPer100g: 999 },
    { ingredientId: 'sugar', kind: 'food', source: 'usda_fdc', kcalPer100g: 1 },
    { ingredientId: 'sugar', kind: 'food', source: 'chef_override', kcalPer100g: -1 },
    { ingredientId: 'sugar', kind: 'food', source: 'chef_override', kcalPer100g: 100, gramsPerPiece: 0 }
  ]) await assert.rejects(service.saveChefProfile({ auth: { uid: 'member' }, data: { workspaceId, profile } }), error => ['permission-denied', 'invalid-argument'].includes(error.code));
});

for (const role of ['Owner', 'Manager', 'Sous Chef', 'Chef']) {
  test(`${role}: measured child costs and dependent yield changes use the same scoped calculator`, async () => {
    const { service, documents } = fixture(role);
    documents.recipes.r.servings = 8;
    documents.recipes.r.nutritionYield = { quantity: 230, unit: 'g' };
    documents.recipes.r.yield = 'Existing Yield text';
    documents.recipes.parent.ingredients = [{ id: 'associated', name: 'Caster Sugar', ingredientId: 'sugar', qty: '60', unit: 'g' }];
    documents.recipes.parent.linkedRecipes = [{ id: 'l', recipeId: 'r', quantity: 60, unit: 'g', associatedIngredientId: 'associated' }];
    const request = { auth: { uid: role === 'Owner' ? 'owner' : 'member' }, data: { workspaceId, recipe: documents.recipes.parent } };
    const initial = JSON.stringify(documents);
    const result = await service.costing(request);
    assert.equal(result.recipes[0].costing.totalRecipeCost, 0.1);
    assert.equal(result.recipes[0].costing.breakdown.length, 1);
    assert.equal(result.recipes[0].costing.breakdown[0].unit, 'g');
    assert.equal(JSON.stringify(documents), initial);
    documents.recipes.r.nutritionYield.quantity = 460;
    const changed = await service.costing({ auth: request.auth, data: { workspaceId, changedRecipeId: 'r' } });
    assert.equal(changed.recipes[0].costing.totalRecipeCost, 0.05);
    assert.equal(documents.recipes.r.yield, 'Existing Yield text');
  });
}

test('Purchasing can read nutrition for its authorized Ingredient management without gaining Recipe calculation', async () => {
  const { service, documents } = fixture('Purchasing');
  const request = { auth: { uid: 'member' }, data: { workspaceId } };
  assert.deepEqual(Object.keys((await service.profiles(request)).profiles), ['sugar']);
  await assert.rejects(service.costing(request), error => error.code === 'permission-denied');
  await assert.rejects(service.profiles({ ...request, data: { workspaceId: 'b' } }), error => error.code === 'permission-denied');
  documents.workspaces.a.subscriptionStatus = 'expired';
  await assert.rejects(service.profiles(request), error => error.code === 'permission-denied');
});
