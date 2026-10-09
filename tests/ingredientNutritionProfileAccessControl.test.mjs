import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-misechef-nutrition-profile-rules';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let testEnv;
const workspaceId = 'nutrition-workspace';
const ingredientId = 'ingredient-rice';
const profilePath = () => doc(testEnv.authenticatedContext('chef-a').firestore(), 'ingredientNutritionProfiles', ingredientId);

const chefOverride = () => ({
  id: ingredientId, ingredientId, workspaceId, kind: 'food', status: 'approved', source: 'chef_override',
  kcalPer100g: 130, confirmedBy: 'chef-a', confirmedAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z'
});

const seed = async () => testEnv.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await setDoc(doc(db, 'workspaces', workspaceId), { id: workspaceId, ownerId: 'owner-a', subscriptionPlan: 'business', subscriptionStatus: 'active' });
  await setDoc(doc(db, 'workspaceMembers', `${workspaceId}_chef-a`), { workspaceId, userId: 'chef-a', role: 'Head Chef', status: 'Active' });
  await setDoc(doc(db, 'ingredientNutritionProfiles', ingredientId), { ...chefOverride(), source: 'usda_fdc', catalogProfileId: '12345' });
  await setDoc(doc(db, 'nutritionCatalog', '12345'), { provider: 'usda_fdc', fdcId: '12345' });
});

before(async () => { testEnv = await initializeTestEnvironment({ projectId, firestore: { rules } }); });
afterEach(async () => { await testEnv.clearFirestore(); });
after(async () => { await testEnv.cleanup(); });

test('an authorized Ingredient manager can replace an USDA profile with a valid chef-confirmed override', async () => {
  await seed();
  await assertSucceeds(setDoc(profilePath(), chefOverride()));
});

test('an authorized Ingredient manager can save grams per piece only with kcal per 100 g', async () => {
  await seed();
  await assertSucceeds(setDoc(profilePath(), { ...chefOverride(), gramsPerPiece: 52 }));
  const volumeOnly = { ...chefOverride(), kcalPer100ml: 60, gramsPerPiece: 52 };
  delete volumeOnly.kcalPer100g;
  await assertFails(setDoc(profilePath(), volumeOnly));
  await assertFails(setDoc(profilePath(), { ...chefOverride(), gramsPerPiece: 0 }));
});

test('client profile updates reject forged USDA source, unknown fields, and immutable identity changes', async () => {
  await seed();
  await assertFails(updateDoc(profilePath(), { source: 'usda_fdc' }));
  await assertFails(updateDoc(profilePath(), { unexpected: 'field' }));
  await assertFails(updateDoc(profilePath(), { ingredientId: 'another-ingredient' }));
  await assertFails(updateDoc(profilePath(), { workspaceId: 'other-workspace' }));
});

test('the internal USDA catalog is not client-readable', async () => {
  await seed();
  await assertFails(getDoc(doc(testEnv.authenticatedContext('chef-a').firestore(), 'nutritionCatalog', '12345')));
});

for (const role of ['Owner', 'Manager', 'Sous Chef', 'Chef']) {
  test(`${role}: same-workspace profiles are readable while cross-workspace reads remain denied`, async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'workspaceMembers', `${workspaceId}_reader`), { workspaceId, userId: 'reader', role, status: 'Active' });
      await setDoc(doc(context.firestore(), 'ingredientNutritionProfiles', 'foreign-food'), { ...chefOverride(), id: 'foreign-food', ingredientId: 'foreign-food', workspaceId: 'other-workspace' });
    });
    const db = testEnv.authenticatedContext('reader').firestore();
    await assertSucceeds(getDoc(doc(db, 'ingredientNutritionProfiles', ingredientId)));
    await assertFails(getDoc(doc(db, 'ingredientNutritionProfiles', 'foreign-food')));
    if (role === 'Chef' || role === 'Sous Chef') {
      await assertFails(updateDoc(doc(db, 'ingredientNutritionProfiles', ingredientId), { kcalPer100g: 999, confirmedBy: 'reader' }));
      await assertFails(setDoc(doc(db, 'ingredients', 'unauthorized-edit'), { id: 'unauthorized-edit', workspaceId, createdBy: 'reader', status: 'Active' }));
    }
  });
}

test('new direct-client packaging profile reproduces the denied create; rules remain fail-closed', async () => {
  await seed();
  const id = 'box-650';
  const packaging = { id, ingredientId: id, workspaceId, kind: 'non_food', source: 'chef_non_food', status: 'approved', confirmedBy: 'chef-a', confirmedAt: '', updatedAt: '' };
  const target = doc(testEnv.authenticatedContext('chef-a').firestore(), 'ingredientNutritionProfiles', id);
  await assertFails(setDoc(target, packaging));
  await assertFails(setDoc(target, { ...packaging, createdBy: 'chef-a' }));
});

test('unchanged Production rules deny direct client access to server-only enrichment indexes', async () => {
  await seed();
  for (const collection of ['workspaceIngredientCanonicalKeys', 'workspaceIngredientResolutions']) {
    await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), collection, 'guard'), { workspaceId, ingredientId }));
    for (const uid of ['chef-a', 'outsider']) {
      const ref = doc(testEnv.authenticatedContext(uid).firestore(), collection, 'guard');
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, { workspaceId, ingredientId }));
    }
  }
});
