import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Recipe } from '../../../types';
import type { CostingInvoiceExtractedItem, PendingRecipeCostRecalculation } from '../types';

export type IngredientCostChange = {
  ingredientId: string;
  ingredientName: string;
  previousCost: number | null;
  newCost: number;
};

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const recipeUsesIngredient = (recipe: Recipe, ingredientNames: Set<string>) => (
  recipe.ingredients || []
).some(ingredient => ingredientNames.has(normalizeName(ingredient.name)));

export const costIntelligenceService = {
  calculateUnitCost(item: CostingInvoiceExtractedItem) {
    const explicitUnitPrice = Number(item.unitPrice || 0);
    if (Number.isFinite(explicitUnitPrice) && explicitUnitPrice > 0) {
      return explicitUnitPrice;
    }

    const quantity = Number(item.quantity || 0);
    const total = Number(item.total || 0);
    if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(total) && total > 0) {
      return Number((total / quantity).toFixed(4));
    }

    return 0;
  },

  async findPendingRecipeRecalculations({
    costChanges,
    invoiceId,
    userId,
    workspaceId,
    createdAt
  }: {
    costChanges: IngredientCostChange[];
    invoiceId: string;
    userId: string;
    workspaceId: string;
    createdAt: string;
  }): Promise<PendingRecipeCostRecalculation[]> {
    if (!db || costChanges.length === 0) return [];

    const changedIngredientNames = new Set(costChanges.map(change => normalizeName(change.ingredientName)));
    const recipesQuery = query(collection(db, 'recipes'), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(recipesQuery);

    return snapshot.docs
      .map(recipeDoc => ({ id: recipeDoc.id, ...recipeDoc.data() } as Recipe))
      .filter(recipe => recipeUsesIngredient(recipe, changedIngredientNames))
      .map(recipe => {
        const recipeIngredientNames = new Set((recipe.ingredients || []).map(ingredient => normalizeName(ingredient.name)));
        const relatedChanges = costChanges.filter(change => recipeIngredientNames.has(normalizeName(change.ingredientName)));

        return {
          id: `${invoiceId}_${recipe.id}`,
          recipeId: recipe.id,
          invoiceId,
          ingredientIds: relatedChanges.map(change => change.ingredientId),
          ingredientNames: relatedChanges.map(change => change.ingredientName),
          status: 'Pending',
          reason: 'IngredientCostChanged',
          createdAt,
          updatedAt: createdAt,
          createdBy: userId,
          workspaceId
        };
      });
  },

  async queuePendingRecipeRecalculations(recalculations: PendingRecipeCostRecalculation[]) {
    if (!db || recalculations.length === 0) return;

    const batch = writeBatch(db);

    recalculations.forEach(recalculation => {
      batch.set(doc(db, 'recipeCostRecalculations', recalculation.id), recalculation, { merge: true });
    });

    await batch.commit();
  }
};
