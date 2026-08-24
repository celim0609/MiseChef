import type { CostingIngredient, CostingInvoiceExtractedItem, CostingInvoiceReviewedItem } from '../types';

export type InvoiceImportMatch = {
  item: CostingInvoiceReviewedItem;
  suggestedIngredientId?: string;
  matchedIngredientId?: string;
  decision?: 'Use Existing' | 'Create New';
  status: 'Possible Match' | 'Use Existing' | 'Create New';
};

export const normalizeIngredientName = (value: string) => value
  .trim()
  .toLocaleLowerCase()
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const createInvoiceReviewItems = (
  items: CostingInvoiceExtractedItem[]
): CostingInvoiceReviewedItem[] => items.map((item, sourceItemIndex) => ({
  sourceItemIndex,
  supplierDescription: item.name,
  ingredientName: item.name,
  quantity: item.quantity,
  unit: item.unit,
  unitPrice: item.unitPrice,
  total: item.total
}));

export const asExtractedItem = (item: CostingInvoiceReviewedItem): CostingInvoiceExtractedItem => ({
  name: item.ingredientName,
  quantity: item.quantity,
  unit: item.unit,
  unitPrice: item.unitPrice,
  total: item.total
});

export const matchInvoiceItemsToIngredients = (
  items: CostingInvoiceReviewedItem[],
  ingredients: CostingIngredient[],
  workspaceId: string
): InvoiceImportMatch[] => {
  const activeIngredients = ingredients.filter(ingredient => ingredient.status === 'Active' && ingredient.workspaceId === workspaceId);

  return items.map(item => {
    const normalizedItemName = normalizeIngredientName(item.ingredientName);
    const matchedIngredient = activeIngredients.find(ingredient => normalizeIngredientName(ingredient.name) === normalizedItemName);

    return {
      item,
      suggestedIngredientId: matchedIngredient?.id,
      decision: matchedIngredient ? undefined : 'Create New',
      status: matchedIngredient ? 'Possible Match' : 'Create New'
    };
  });
};

export const validateInvoiceImportMatches = (matches: InvoiceImportMatch[]) => {
  const newIngredientNames = new Set<string>();
  for (const [index, match] of matches.entries()) {
    const itemLabel = `Line item ${index + 1}`;
    if (!match.item.ingredientName.trim()) return `${itemLabel}: Ingredient Name is required.`;
    if (!Number.isFinite(match.item.quantity) || match.item.quantity <= 0) return `${itemLabel}: Quantity must be greater than zero.`;
    if (!match.item.unit.trim()) return `${itemLabel}: Unit is required.`;
    if (!Number.isFinite(match.item.unitPrice) || match.item.unitPrice < 0) return `${itemLabel}: Unit Price cannot be negative.`;
    if (!Number.isFinite(match.item.total) || match.item.total < 0) return `${itemLabel}: Line Total cannot be negative.`;
    if (!match.decision) return `${itemLabel}: choose Use Existing or Create New.`;
    if (match.decision === 'Use Existing' && !match.matchedIngredientId) return `${itemLabel}: select an existing Ingredient.`;
    if (match.decision === 'Create New') {
      const normalizedName = normalizeIngredientName(match.item.ingredientName);
      if (newIngredientNames.has(normalizedName)) return `${itemLabel}: another new Ingredient uses this name. Choose a distinct name or link to an existing Ingredient.`;
      newIngredientNames.add(normalizedName);
    }
  }
  return '';
};
