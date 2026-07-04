import { collection, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { CostingIngredient, CostingInvoice, CostingInvoiceExtractedItem } from '../types';

export type InvoiceImportMatch = {
  item: CostingInvoiceExtractedItem;
  matchedIngredientId?: string;
  status: 'Matched' | 'New Ingredient';
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
    if (!db) throw new Error('Firestore is not initialized.');
    if (invoice.processingStatus === 'Imported' || invoice.approvedAt) {
      throw new Error('This invoice has already been imported.');
    }
    if (invoice.processingStatus !== 'Processed') {
      throw new Error('Only processed invoices can be imported.');
    }
    if (matches.length === 0) {
      throw new Error('No OCR line items are available to import.');
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
    const ingredientById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
    const batch = writeBatch(db);

    matches.forEach(match => {
      if (!match.item.name.trim()) return;

      const matchedIngredient = match.matchedIngredientId ? ingredientById.get(match.matchedIngredientId) : null;
      const ingredientRef = matchedIngredient
        ? doc(db, 'ingredients', matchedIngredient.id)
        : doc(collection(db, 'ingredients'));
      const ingredientId = matchedIngredient?.id || ingredientRef.id;

      if (matchedIngredient) {
        batch.update(ingredientRef, removeUndefinedFields({
          currentPrice: match.item.unitPrice,
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
          currentPrice: match.item.unitPrice,
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
        unitPrice: match.item.unitPrice,
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

    return { invoiceUpdates };
  }
};
