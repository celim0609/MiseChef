import { collection, doc, getDoc, getDocs, query, type DocumentReference, where, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { CostingIngredient, CostingInvoice, CostingInvoiceExtractedItem } from '../types';
import { costIntelligenceService, type IngredientCostChange } from './costIntelligenceService';
import { recipeCostService } from './recipeCostService';

export type InvoiceImportMatch = {
  item: CostingInvoiceExtractedItem;
  matchedIngredientId?: string;
  status: 'Matched' | 'New Ingredient';
};

type PlannedInvoiceImport = {
  match: InvoiceImportMatch;
  matchedIngredient: CostingIngredient | null;
  ingredientRef: DocumentReference;
  ingredientId: string;
  ingredientName: string;
  previousCost: number | null;
  newCost: number;
};

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

const normalizeIngredientName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const loadCurrentIngredients = async (workspaceId: string) => {
  if (!db) return [];

  const ingredientsQuery = query(collection(db, 'ingredients'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(ingredientsQuery);

  return snapshot.docs.map(ingredientDoc => ({
    id: ingredientDoc.id,
    ...ingredientDoc.data()
  } as CostingIngredient));
};

export const matchInvoiceItemsToIngredients = (
  items: CostingInvoiceExtractedItem[],
  ingredients: CostingIngredient[]
): InvoiceImportMatch[] => {
  const activeIngredients = ingredients.filter(ingredient => ingredient.status === 'Active');

  return items.map(item => {
    const normalizedItemName = normalizeIngredientName(item.name);
    const matchedIngredient = activeIngredients.find(ingredient => normalizeIngredientName(ingredient.name) === normalizedItemName);

    return {
      item,
      matchedIngredientId: matchedIngredient?.id,
      status: matchedIngredient ? 'Matched' : 'New Ingredient'
    };
  });
};

export const invoiceImportService = {
  async approveImport({
    invoice,
    matches,
    ingredients,
    userId,
    workspaceId = userId
  }: {
    invoice: CostingInvoice;
    matches: InvoiceImportMatch[];
    ingredients: CostingIngredient[];
    userId: string;
    workspaceId?: string;
  }): Promise<{ invoiceUpdates: Partial<CostingInvoice> }> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (invoice.processingStatus === 'Imported' || invoice.approvedAt) {
      throw new Error('This invoice has already been imported.');
    }
    if (invoice.processingStatus !== 'Processed') {
      throw new Error('Only processed invoices can be imported.');
    }
    if (matches.length === 0) {
      throw new Error('No invoice items are available to import. Please process the invoice again.');
    }

    const invoiceRef = doc(db, 'invoices', invoice.id);
    const latestInvoice = await getDoc(invoiceRef);
    const latestData = latestInvoice.exists() ? latestInvoice.data() as Partial<CostingInvoice> : null;
    if (latestData?.processingStatus === 'Imported' || latestData?.approvedAt) {
      throw new Error('This invoice has already been imported.');
    }

    const now = new Date().toISOString();
    const supplierId = invoice.supplier || invoice.extractedData?.supplier || '';
    const currency = invoice.currency || invoice.extractedData?.currency || 'SGD';
    const effectiveDate = invoice.invoiceDate || invoice.extractedData?.invoiceDate || invoice.processingCompletedAt || invoice.uploadDate || now;
    const currentIngredients = await loadCurrentIngredients(workspaceId);
    const effectiveIngredients = currentIngredients.length > 0 ? currentIngredients : ingredients;
    const ingredientById = new Map(effectiveIngredients.map(ingredient => [ingredient.id, ingredient]));
    const activeIngredientByName = new Map(
      effectiveIngredients
        .filter(ingredient => ingredient.status === 'Active')
        .map(ingredient => [normalizeIngredientName(ingredient.name), ingredient])
    );
    const plannedImports = matches.reduce<PlannedInvoiceImport[]>((acc, match) => {
      if (!match.item.name.trim()) return acc;

      const matchedIngredient = match.matchedIngredientId
        ? ingredientById.get(match.matchedIngredientId) || null
        : activeIngredientByName.get(normalizeIngredientName(match.item.name)) || null;
      const ingredientRef = matchedIngredient
        ? doc(db, 'ingredients', matchedIngredient.id)
        : doc(collection(db, 'ingredients'));
      const ingredientId = matchedIngredient?.id || ingredientRef.id;
      const newCost = costIntelligenceService.calculateUnitCost(match.item);

      acc.push({
        match,
        matchedIngredient,
        ingredientRef,
        ingredientId,
        ingredientName: matchedIngredient?.name || match.item.name.trim(),
        previousCost: matchedIngredient ? Number(matchedIngredient.currentPrice || 0) : null,
        newCost
      });

      return acc;
    }, []);
    const costChanges: IngredientCostChange[] = plannedImports.map(plannedImport => ({
      ingredientId: plannedImport.ingredientId,
      ingredientName: plannedImport.ingredientName,
      previousCost: plannedImport.previousCost,
      newCost: plannedImport.newCost
    }));
    const pendingRecipeRecalculations = await costIntelligenceService.findPendingRecipeRecalculations({
      costChanges,
      invoiceId: invoice.id,
      userId,
      workspaceId,
      createdAt: now
    });
    const batch = writeBatch(db);

    plannedImports.forEach(({ match, matchedIngredient, ingredientRef, ingredientId, previousCost, newCost }) => {
      if (matchedIngredient) {
        batch.update(ingredientRef, removeUndefinedFields({
          currentPrice: newCost,
          supplierId: supplierId || matchedIngredient.supplierId,
          currency,
          updatedAt: now
        }) as unknown as Record<string, unknown>);
      } else {
        const newIngredient: CostingIngredient = {
          id: ingredientId,
          name: match.item.name.trim(),
          category: '',
          purchaseUnit: match.item.unit || '',
          recipeUnit: match.item.unit || '',
          conversionFactor: 1,
          currentPrice: newCost,
          currency,
          supplierId,
          yieldPercentage: 100,
          wastePercentage: 0,
          status: 'Active',
          notes: `Created from invoice ${invoice.invoiceNumber || invoice.fileName}`,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          workspaceId
        };
        batch.set(ingredientRef, removeUndefinedFields(newIngredient));
      }

      const historyRef = doc(collection(db, 'ingredientPriceHistory'));
      batch.set(historyRef, removeUndefinedFields({
        id: historyRef.id,
        ingredientId,
        supplierId,
        invoiceId: invoice.id,
        previousCost,
        newCost,
        unitPrice: newCost,
        currency,
        effectiveDate,
        createdAt: now,
        createdBy: userId,
        workspaceId
      }));
    });

    const invoiceUpdates: Partial<CostingInvoice> = {
      processingStatus: 'Imported',
      status: 'Imported',
      approvedAt: now,
      approvedBy: userId
    };

    batch.update(invoiceRef, removeUndefinedFields(invoiceUpdates) as unknown as Record<string, unknown>);
    await batch.commit();

    costIntelligenceService.queuePendingRecipeRecalculations(pendingRecipeRecalculations).catch(error => {
      console.warn('Pending recipe cost recalculation queue could not be saved.', error);
    });

    recipeCostService.recalculateRecipesForCostChanges({ costChanges, userId, workspaceId }).catch(error => {
      console.warn('Recipe cost recalculation could not be completed.', error);
    });

    return { invoiceUpdates };
  }
};
