import { collection, doc, getDoc, getDocs, query, type DocumentReference, where, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { CostingIngredient, CostingInvoice } from '../types';
import { costIntelligenceService, type IngredientCostChange } from './costIntelligenceService';
import { recipeCostService } from './recipeCostService';
import { DEFAULT_REGION_CONFIGURATION, type RegionCurrency } from '../../../regions';
import { getGenericInvoiceLegacyPricing, planGenericInvoicePriceUpdate } from './ingredientPackModel';
import { asExtractedItem, normalizeIngredientName, validateInvoiceImportMatches, type InvoiceImportMatch } from './invoiceImportReview';
export { createInvoiceReviewItems, matchInvoiceItemsToIngredients, normalizeIngredientName, validateInvoiceImportMatches } from './invoiceImportReview';
export type { InvoiceImportMatch } from './invoiceImportReview';

type PlannedInvoiceImport = {
  match: InvoiceImportMatch;
  matchedIngredient: CostingIngredient | null;
  ingredientRef: DocumentReference;
  ingredientId: string;
  ingredientName: string;
  previousCost: number | null;
  newCost: number;
  effectiveCost: number;
  appliesPriceUpdate: boolean;
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

const loadCurrentIngredients = async (workspaceId: string) => {
  if (!db) return [];

  const ingredientsQuery = query(collection(db, 'ingredients'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(ingredientsQuery);

  return snapshot.docs.map(ingredientDoc => ({
    id: ingredientDoc.id,
    ...ingredientDoc.data()
  } as CostingIngredient));
};

export const invoiceImportService = {
  async approveImport({
    invoice,
    matches,
    ingredients,
    userId,
    workspaceId = userId,
    defaultCurrency = DEFAULT_REGION_CONFIGURATION.currency
  }: {
    invoice: CostingInvoice;
    matches: InvoiceImportMatch[];
    ingredients: CostingIngredient[];
    userId: string;
    workspaceId?: string;
    defaultCurrency?: RegionCurrency;
  }): Promise<{
    invoiceUpdates: Partial<CostingInvoice>;
    priceUpdatesApplied: number;
    packPricesPreserved: number;
  }> {
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
    const validationError = validateInvoiceImportMatches(matches);
    if (validationError) throw new Error(validationError);

    const invoiceRef = doc(db, 'invoices', invoice.id);
    const latestInvoice = await getDoc(invoiceRef);
    const latestData = latestInvoice.exists() ? latestInvoice.data() as Partial<CostingInvoice> : null;
    if (!latestInvoice.exists()) throw new Error('This invoice no longer exists. Refresh before importing.');
    if (latestData?.processingStatus === 'Imported' || latestData?.approvedAt) {
      throw new Error('This invoice has already been imported.');
    }
    if (latestData?.processingStatus !== 'Processed') {
      throw new Error('The invoice changed while you were reviewing it. Refresh before importing.');
    }
    const invoiceWorkspaceId = latestData?.workspaceId || invoice.workspaceId;
    if (!invoiceWorkspaceId || invoiceWorkspaceId !== workspaceId) {
      throw new Error('This invoice does not belong to the active Workspace.');
    }
    const sourceItems = latestData?.extractedData?.items || invoice.extractedData?.items || [];
    const sourceIndexes = new Set(matches.map(match => match.item.sourceItemIndex));
    if (sourceIndexes.size !== matches.length || matches.some(match => !sourceItems[match.item.sourceItemIndex])) {
      throw new Error('The reviewed rows no longer match the saved OCR invoice. Reprocess the invoice before importing.');
    }

    const now = new Date().toISOString();
    const supplierId = invoice.supplier || invoice.extractedData?.supplier || '';
    const currency = invoice.currency || invoice.extractedData?.currency || defaultCurrency;
    const effectiveDate = invoice.invoiceDate || invoice.extractedData?.invoiceDate || invoice.processingCompletedAt || invoice.uploadDate || now;
    const currentIngredients = await loadCurrentIngredients(workspaceId);
    const effectiveIngredients = currentIngredients.length > 0 ? currentIngredients : ingredients.filter(ingredient => ingredient.workspaceId === workspaceId);
    const ingredientById = new Map(effectiveIngredients.map(ingredient => [ingredient.id, ingredient]));
    const activeIngredientByName = new Map(
      effectiveIngredients
        .filter(ingredient => ingredient.status === 'Active')
        .map(ingredient => [normalizeIngredientName(ingredient.name), ingredient])
    );
    const plannedImports = matches.reduce<PlannedInvoiceImport[]>((acc, match) => {
      const normalizedName = normalizeIngredientName(match.item.ingredientName);
      const exactExistingIngredient = activeIngredientByName.get(normalizedName) || null;
      const matchedIngredient = match.decision === 'Use Existing' && match.matchedIngredientId
        ? ingredientById.get(match.matchedIngredientId) || null
        : null;
      if (match.decision === 'Use Existing' && (!matchedIngredient || matchedIngredient.status !== 'Active')) {
        throw new Error(`The selected Ingredient for “${match.item.ingredientName}” is not available in this Workspace.`);
      }
      if (match.decision === 'Create New' && exactExistingIngredient) {
        throw new Error(`An Ingredient named “${exactExistingIngredient.name}” already exists. Choose Use Existing to avoid a duplicate.`);
      }
      const ingredientRef = matchedIngredient
        ? doc(db, 'ingredients', matchedIngredient.id)
        : doc(collection(db, 'ingredients'));
      const ingredientId = matchedIngredient?.id || ingredientRef.id;
      const importItem = asExtractedItem(match.item);
      const newCost = costIntelligenceService.calculateUnitCost(importItem);
      const pricingPlan = planGenericInvoicePriceUpdate(matchedIngredient, newCost);

      acc.push({
        match,
        matchedIngredient,
        ingredientRef,
        ingredientId,
        ingredientName: matchedIngredient?.name || match.item.ingredientName.trim(),
        previousCost: pricingPlan.previousCost,
        newCost,
        effectiveCost: pricingPlan.effectiveCost,
        appliesPriceUpdate: pricingPlan.priceApplied
      });

      return acc;
    }, []);
    const costChanges: IngredientCostChange[] = plannedImports
      .filter(plannedImport => plannedImport.appliesPriceUpdate)
      .map(plannedImport => ({
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

    plannedImports.forEach(({ match, matchedIngredient, ingredientRef, ingredientId, previousCost, newCost, effectiveCost, appliesPriceUpdate }) => {
      if (matchedIngredient) {
        if (appliesPriceUpdate) {
          batch.update(ingredientRef, removeUndefinedFields({
            currentPrice: newCost,
            supplierId: supplierId || matchedIngredient.supplierId,
            currency,
            updatedAt: now
          }) as unknown as Record<string, unknown>);
        }
      } else {
        const importItem = asExtractedItem(match.item);
        const newIngredient: CostingIngredient = {
          id: ingredientId,
          name: match.item.ingredientName.trim(),
          category: '',
          ...getGenericInvoiceLegacyPricing(importItem, newCost),
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
        newCost: effectiveCost,
        unitPrice: effectiveCost,
        priceApplied: appliesPriceUpdate,
        transactionQuantity: match.item.quantity,
        transactionUnit: match.item.unit,
        transactionUnitPrice: match.item.unitPrice,
        transactionTotal: match.item.total,
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
      approvedBy: userId,
      importReview: {
        items: plannedImports.map(({ match, ingredientId }) => ({
          ...match.item,
          supplierDescription: sourceItems[match.item.sourceItemIndex].name,
          decision: match.decision,
          ingredientId
        })),
        approvedAt: now,
        approvedBy: userId
      }
    };

    batch.update(invoiceRef, removeUndefinedFields(invoiceUpdates) as unknown as Record<string, unknown>);
    await batch.commit();

    costIntelligenceService.queuePendingRecipeRecalculations(pendingRecipeRecalculations).catch(error => {
      console.warn('Pending recipe cost recalculation queue could not be saved.', error);
    });

    recipeCostService.recalculateRecipesForCostChanges({ costChanges, userId, workspaceId }).catch(error => {
      console.warn('Recipe cost recalculation could not be completed.', error);
    });

    return {
      invoiceUpdates,
      priceUpdatesApplied: plannedImports.filter(item => item.appliesPriceUpdate).length,
      packPricesPreserved: plannedImports.filter(item => !item.appliesPriceUpdate).length
    };
  }
};
