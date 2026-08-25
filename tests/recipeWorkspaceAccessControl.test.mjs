import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const projectId = 'demo-misechef-recipe-rules';
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

let testEnv;

const authDb = userId => testEnv.authenticatedContext(userId, {
  email: `${userId}@example.test`
}).firestore();

const recipe = ({ id, workspaceId, userId, visibility = 'private' }) => ({
  id,
  workspaceId,
  companyId: workspaceId,
  userId,
  createdBy: userId,
  createdByName: `Chef ${userId}`,
  title: id === 'teh-ice' ? 'Teh Ice' : id,
  visibility,
  recommendedProductIds: [],
  ingredients: [{ id: 'tea', name: 'Tea', qty: '10', unit: 'g', ingredientId: 'ingredient-a' }],
  costing: { totalRecipeCost: 1.5 },
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z'
});

const seedWorkspace = async ({ workspaceId, ownerId, members }) => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'workspaces', workspaceId), { id: workspaceId, ownerId });
    await Promise.all(members.map(({ userId, role, status = 'Active' }) =>
      setDoc(doc(db, 'workspaceMembers', `${workspaceId}_${userId}`), {
        workspaceId, userId, role, status
      })
    ));
  });
};

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules }
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('Workspace Recipe visibility', () => {
  test('owner and same-workspace member query a private recipe by workspaceId, including after refresh', async () => {
    const workspaceId = 'owner-a';
    await seedWorkspace({
      workspaceId,
      ownerId: 'owner-a',
      members: [
        { userId: 'owner-a', role: 'Owner' },
        { userId: 'chef-a', role: 'Head Chef' }
      ]
    });

    const chefRecipe = recipe({ id: 'teh-ice', workspaceId, userId: 'chef-a' });
    await assertSucceeds(setDoc(doc(authDb('chef-a'), 'recipes', chefRecipe.id), chefRecipe));

    for (const userId of ['owner-a', 'chef-a']) {
      const workspaceQuery = query(collection(authDb(userId), 'recipes'), where('workspaceId', '==', workspaceId));
      const firstLoad = await assertSucceeds(getDocs(workspaceQuery));
      const refreshedLoad = await assertSucceeds(getDocs(workspaceQuery));
      assert.deepEqual(firstLoad.docs.map(item => item.data().title), ['Teh Ice']);
      assert.deepEqual(refreshedLoad.docs.map(item => item.data().title), ['Teh Ice']);
    }
  });

  test('same-workspace search and detail include both private and public recipes', async () => {
    const workspaceId = 'workspace-a';
    await seedWorkspace({
      workspaceId,
      ownerId: 'owner-a',
      members: [{ userId: 'owner-a', role: 'Owner' }, { userId: 'chef-a', role: 'Chef' }]
    });
    await testEnv.withSecurityRulesDisabled(async context => Promise.all([
      setDoc(doc(context.firestore(), 'recipes', 'private-a'), recipe({ id: 'private-a', workspaceId, userId: 'owner-a' })),
      setDoc(doc(context.firestore(), 'recipes', 'public-a'), recipe({ id: 'public-a', workspaceId, userId: 'owner-a', visibility: 'public' }))
    ]));

    const memberDb = authDb('chef-a');
    const result = await assertSucceeds(getDocs(query(collection(memberDb, 'recipes'), where('workspaceId', '==', workspaceId))));
    assert.deepEqual(result.docs.map(item => item.id).sort(), ['private-a', 'public-a']);
    await assertSucceeds(getDoc(doc(memberDb, 'recipes', 'private-a')));
  });

  test('active read-only members can browse Workspace recipes but cannot mutate them', async () => {
    const workspaceId = 'workspace-a';
    await seedWorkspace({
      workspaceId,
      ownerId: 'owner-a',
      members: [{ userId: 'owner-a', role: 'Owner' }, { userId: 'viewer-a', role: 'Viewer' }]
    });
    await testEnv.withSecurityRulesDisabled(context => Promise.all([
      setDoc(doc(context.firestore(), 'recipes', 'private-a'), recipe({ id: 'private-a', workspaceId, userId: 'owner-a' })),
      setDoc(doc(context.firestore(), 'categories', 'drinks'), {
        id: 'drinks', workspaceId, companyId: workspaceId, userId: 'owner-a', name: 'Drinks'
      })
    ]));

    const viewerDb = authDb('viewer-a');
    await assertSucceeds(getDocs(query(collection(viewerDb, 'recipes'), where('workspaceId', '==', workspaceId))));
    await assertSucceeds(getDocs(query(collection(viewerDb, 'categories'), where('workspaceId', '==', workspaceId))));
    await assertFails(updateDoc(doc(viewerDb, 'recipes', 'private-a'), { title: 'Unauthorized edit' }));
    await assertFails(deleteDoc(doc(viewerDb, 'recipes', 'private-a')));
  });

  test('private canonical recipes remain hidden from anonymous and other-workspace users', async () => {
    await seedWorkspace({ workspaceId: 'workspace-a', ownerId: 'owner-a', members: [{ userId: 'owner-a', role: 'Owner' }] });
    await seedWorkspace({ workspaceId: 'workspace-b', ownerId: 'owner-b', members: [{ userId: 'owner-b', role: 'Owner' }] });
    await testEnv.withSecurityRulesDisabled(context =>
      setDoc(doc(context.firestore(), 'recipes', 'private-a'), recipe({ id: 'private-a', workspaceId: 'workspace-a', userId: 'owner-a' }))
    );

    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'recipes', 'private-a')));
    await assertFails(getDoc(doc(authDb('owner-b'), 'recipes', 'private-a')));
    await assertFails(getDocs(query(collection(authDb('owner-b'), 'recipes'), where('workspaceId', '==', 'workspace-a'))));
  });

  test('Recipe roles can edit without changing creator identity, costing, or ingredient links', async () => {
    const workspaceId = 'workspace-a';
    await seedWorkspace({
      workspaceId,
      ownerId: 'owner-a',
      members: [
        { userId: 'owner-a', role: 'Owner' },
        { userId: 'manager-a', role: 'Manager' },
        { userId: 'head-chef-a', role: 'Head Chef' },
        { userId: 'sous-chef-a', role: 'Sous Chef' },
        { userId: 'chef-a', role: 'Chef' }
      ]
    });
    await testEnv.withSecurityRulesDisabled(context =>
      setDoc(doc(context.firestore(), 'recipes', 'private-a'), recipe({ id: 'private-a', workspaceId, userId: 'owner-a' }))
    );
    for (const userId of ['owner-a', 'manager-a', 'head-chef-a', 'sous-chef-a', 'chef-a']) {
      await assertSucceeds(updateDoc(doc(authDb(userId), 'recipes', 'private-a'), {
        title: `Updated by ${userId}`,
        sellingPrice: 12.5,
        costing: { totalRecipeCost: 2.25 },
        ingredients: [{ id: 'tea', name: 'Tea', qty: '12', unit: 'g', ingredientId: 'ingredient-b' }]
      }));
    }

    const reference = doc(authDb('chef-a'), 'recipes', 'private-a');
    await assertFails(updateDoc(reference, { workspaceId: 'workspace-b', companyId: 'workspace-b' }));
    await assertFails(updateDoc(reference, { userId: 'chef-a', createdBy: 'chef-a' }));
    await assertFails(updateDoc(reference, { createdByName: 'Replacement Creator' }));
    await assertFails(updateDoc(reference, { createdAt: '2026-08-25T00:00:00.000Z' }));

    const updated = await assertSucceeds(getDoc(reference));
    assert.equal(updated.data().userId, 'owner-a');
    assert.equal(updated.data().createdBy, 'owner-a');
    assert.equal(updated.data().createdByName, 'Chef owner-a');
    assert.equal(updated.data().createdAt, '2026-08-23T00:00:00.000Z');
    assert.equal(updated.data().sellingPrice, 12.5);
    assert.equal(updated.data().costing.totalRecipeCost, 2.25);
    assert.equal(updated.data().ingredients[0].ingredientId, 'ingredient-b');
    await assertSucceeds(deleteDoc(reference));
  });

  test('older recipes with absent creator metadata remain editable without backfilling it', async () => {
    const workspaceId = 'workspace-a';
    await seedWorkspace({
      workspaceId,
      ownerId: 'owner-a',
      members: [{ userId: 'owner-a', role: 'Owner' }, { userId: 'manager-a', role: 'Manager' }]
    });
    const legacyRecipe = recipe({ id: 'legacy-a', workspaceId, userId: 'owner-a' });
    delete legacyRecipe.createdBy;
    delete legacyRecipe.createdByName;
    await testEnv.withSecurityRulesDisabled(context =>
      setDoc(doc(context.firestore(), 'recipes', 'legacy-a'), legacyRecipe)
    );

    const reference = doc(authDb('manager-a'), 'recipes', 'legacy-a');
    await assertSucceeds(updateDoc(reference, { title: 'Legacy recipe updated' }));
    await assertFails(updateDoc(reference, { createdBy: 'manager-a', createdByName: 'Manager' }));
    const updated = await assertSucceeds(getDoc(reference));
    assert.equal(updated.data().userId, 'owner-a');
    assert.equal('createdBy' in updated.data(), false);
    assert.equal('createdByName' in updated.data(), false);
  });

  test('embedded ingredient and costing data never crosses workspace boundaries', async () => {
    await seedWorkspace({ workspaceId: 'workspace-a', ownerId: 'owner-a', members: [{ userId: 'owner-a', role: 'Owner' }] });
    await seedWorkspace({ workspaceId: 'workspace-b', ownerId: 'owner-b', members: [{ userId: 'owner-b', role: 'Owner' }] });
    await testEnv.withSecurityRulesDisabled(context =>
      setDoc(doc(context.firestore(), 'recipes', 'costed-a'), recipe({ id: 'costed-a', workspaceId: 'workspace-a', userId: 'owner-a' }))
    );

    const sameWorkspace = await assertSucceeds(getDoc(doc(authDb('owner-a'), 'recipes', 'costed-a')));
    assert.equal(sameWorkspace.data().ingredients[0].ingredientId, 'ingredient-a');
    assert.equal(sameWorkspace.data().costing.totalRecipeCost, 1.5);
    await assertFails(getDoc(doc(authDb('owner-b'), 'recipes', 'costed-a')));
  });
});
