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
