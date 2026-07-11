import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { CostingIngredient, CostingIngredientPriceHistory, CostingInvoice } from '../types';
import { costIntelligenceService, type IngredientCostChange } from './costIntelligenceService';
import { recipeCostService } from './recipeCostService';

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

const loadPriceHistoryForInvoice = async (invoiceId: string) => {
  if (!db) return [];

  const historyQuery = query(collection(db, 'ingredientPriceHistory'), where('invoiceId', '==', invoiceId));
  const snapshot = await getDocs(historyQuery);

  return snapshot.docs.map(historyDoc => ({
    id: historyDoc.id,
    ...historyDoc.data()
  } as CostingIngredientPriceHistory));
};

const loadPriceHistoryForIngredient = async (ingredientId: string) => {
  if (!db) return [];

  const historyQuery = query(collection(db, 'ingredientPriceHistory'), where('ingredientId', '==', ingredientId));
  const snapshot = await getDocs(historyQuery);

  return snapshot.docs.map(historyDoc => ({
    id: historyDoc.id,
    ...historyDoc.data()
  } as CostingIngredientPriceHistory));
};

const loadIngredient = async (ingredientId: string) => {
  if (!db) return null;

  const snapshot = await getDoc(doc(db, 'ingredients', ingredientId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as CostingIngredient : null;
};

export const invoiceLifecycleService = {
  async getImportImpact(invoiceId: string) {
    const history = await loadPriceHistoryForInvoice(invoiceId);
    const newIngredientCount = history.filter(record => record.previousCost === null).length;
    const updatedIngredientCount = history.length - newIngredientCount;

    return {
      historyCount: history.length,
      newIngredientCount,
      updatedIngredientCount
    };
  },

  async rollbackImport({ invoice, userId, workspaceId = userId }: { invoice: CostingInvoice; userId: string; workspaceId?: string }) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (invoice.processingStatus !== 'Imported') {
      throw new Error('Only imported invoices can be rolled back.');
    }

    const history = await loadPriceHistoryForInvoice(invoice.id);
    if (history.length === 0) {
      throw new Error('No price history records were found for this invoice.');
    }

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const costChanges: IngredientCostChange[] = [];
    let deletedIngredients = 0;
    let restoredIngredients = 0;

    for (const record of history) {
      const ingredient = await loadIngredient(record.ingredientId);
      const allHistoryForIngredient = await loadPriceHistoryForIngredient(record.ingredientId);
      const otherHistory = allHistoryForIngredient.filter(item => item.invoiceId !== invoice.id && item.rollbackStatus !== 'RolledBack');
      const wasCreatedByThisInvoice = record.previousCost === null;

      if (ingredient) {
        if (wasCreatedByThisInvoice && otherHistory.length === 0) {
          batch.delete(doc(db, 'ingredients', record.ingredientId));
          deletedIngredients += 1;
          costChanges.push({
            ingredientId: record.ingredientId,
            ingredientName: ingredient.name,
            previousCost: Number(ingredient.currentPrice || 0),
            newCost: 0
          });
        } else {
          const restoredCost = record.previousCost ?? Number(ingredient.currentPrice || 0);
          batch.update(doc(db, 'ingredients', record.ingredientId), removeUndefinedFields({
            currentPrice: restoredCost,
            updatedAt: now,
            notes: wasCreatedByThisInvoice
              ? `${ingredient.notes || ''}\nRollback note: kept because later price history exists.`.trim()
              : ingredient.notes
          }) as unknown as Record<string, unknown>);
          restoredIngredients += 1;
          costChanges.push({
            ingredientId: record.ingredientId,
            ingredientName: ingredient.name,
            previousCost: Number(ingredient.currentPrice || 0),
            newCost: restoredCost
          });
        }
      }

      batch.update(doc(db, 'ingredientPriceHistory', record.id), removeUndefinedFields({
        rollbackStatus: 'RolledBack',
        rolledBackAt: now,
        rolledBackBy: userId
      }) as unknown as Record<string, unknown>);
    }

    const invoiceUpdates: Partial<CostingInvoice> = {
      processingStatus: 'Processed',
      status: 'Processed',
      rollbackAt: now,
      rollbackBy: userId,
      rollbackReason: 'Import rolled back',
      approvedAt: null,
      approvedBy: null
    };

    batch.update(doc(db, 'invoices', invoice.id), removeUndefinedFields({
      processingStatus: invoiceUpdates.processingStatus,
      status: invoiceUpdates.status,
      rollbackAt: invoiceUpdates.rollbackAt,
      rollbackBy: invoiceUpdates.rollbackBy,
      rollbackReason: invoiceUpdates.rollbackReason,
      approvedAt: null,
      approvedBy: null
    }) as unknown as Record<string, unknown>);

    await batch.commit();

    const pendingRecipeRecalculations = await costIntelligenceService.findPendingRecipeRecalculations({
      costChanges,
      invoiceId: invoice.id,
      userId,
      workspaceId,
      createdAt: now
    });
    await costIntelligenceService.queuePendingRecipeRecalculations(pendingRecipeRecalculations).catch(error => {
      console.warn('Pending recipe cost recalculation queue could not be saved after rollback.', error);
    });
    recipeCostService.recalculateRecipesForCostChanges({ costChanges, userId, workspaceId }).catch(error => {
      console.warn('Recipe costs could not be recalculated after rollback.', error);
    });

    return {
      invoiceUpdates,
      deletedIngredients,
      restoredIngredients,
      historyCount: history.length
    };
  }
};
