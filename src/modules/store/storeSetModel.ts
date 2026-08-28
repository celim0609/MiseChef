import type {
  CartSelection,
  StoreOrderItem,
  StoreProduct,
  StoreSet,
  StoreSetDraft,
  StoreSetGroup
} from './types';
import type { Recipe } from '../../types';
import { resolveStoreProductEstimatedCost } from './storeCostModel';

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);
const readMoney = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};
const readAdjustment = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const normalizeStoreSet = (id: string, data: Record<string, unknown>): StoreSet => ({
  id,
  storeId: readString(data.storeId),
  workspaceId: readString(data.workspaceId),
  name: readString(data.name, 'Set'),
  description: readString(data.description),
  photoUrl: readString(data.photoUrl),
  category: readString(data.category),
  price: readMoney(data.price),
  available: typeof data.available === 'boolean' ? data.available : false,
  sortOrder: Number.isInteger(data.sortOrder) ? Number(data.sortOrder) : 0,
  groups: Array.isArray(data.groups) ? data.groups
    .filter(group => group && typeof group === 'object')
    .map((group, groupIndex) => {
      const value = group as Record<string, unknown>;
      return {
        id: readString(value.id),
        name: readString(value.name, 'Selection'),
        required: typeof value.required === 'boolean' ? value.required : true,
        selectionCount: Number.isInteger(value.selectionCount) ? Number(value.selectionCount) : 1,
        sortOrder: Number.isInteger(value.sortOrder) ? Number(value.sortOrder) : groupIndex,
        options: Array.isArray(value.options) ? value.options
          .filter(option => option && typeof option === 'object')
          .map((option, optionIndex) => {
            const item = option as Record<string, unknown>;
            return {
              productId: readString(item.productId),
              priceAdjustment: readAdjustment(item.priceAdjustment),
              sortOrder: Number.isInteger(item.sortOrder) ? Number(item.sortOrder) : optionIndex
            };
          })
          .filter(option => option.productId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          : []
      };
    })
    .filter(group => group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    : [],
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt, new Date().toISOString()),
  updatedAt: readString(data.updatedAt, new Date().toISOString())
});

export const validateStoreSet = (draft: StoreSetDraft) => {
  if (!draft.photoUrl.trim()) return 'Set image is required.';
  if (!draft.name.trim()) return 'Set name is required.';
  if (draft.name.trim().length > 160) return 'Set name must be 160 characters or fewer.';
  if (draft.description.trim().length > 1200) return 'Description must be 1,200 characters or fewer.';
  if (draft.category.trim().length > 80) return 'Category must be 80 characters or fewer.';
  if (!Number.isFinite(draft.price) || draft.price < 0) return 'Enter a valid set price.';
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) return 'Set sort order must be zero or greater.';
  if (draft.groups.length === 0) return 'Add at least one selection group.';
  if (draft.groups.length > 10) return 'Use 10 selection groups or fewer.';
  if (new Set(draft.groups.map(group => group.id)).size !== draft.groups.length) return 'Selection groups must be unique.';
  for (const group of draft.groups) {
    if (!group.id || !group.name.trim()) return 'Every selection group needs a name.';
    if (group.name.trim().length > 100) return 'Group names must be 100 characters or fewer.';
    if (!Number.isInteger(group.selectionCount) || group.selectionCount < 1) return 'Choose count must be at least one.';
    if (group.options.length < group.selectionCount) return `${group.name} needs at least ${group.selectionCount} product option${group.selectionCount === 1 ? '' : 's'}.`;
    if (group.options.length > 50) return 'Use 50 product options or fewer in one group.';
    if (new Set(group.options.map(option => option.productId)).size !== group.options.length) return `Each product can appear only once in ${group.name}.`;
    if (group.options.some(option => !option.productId || !Number.isFinite(option.priceAdjustment) || option.priceAdjustment < 0)) {
      return `Choose valid products and upgrade prices for ${group.name}.`;
    }
  }
  return '';
};

export const getAvailableSetOptions = (group: StoreSetGroup, products: StoreProduct[]) => (
  group.options.filter(option => products.some(product => product.id === option.productId && product.available))
);

export const getStoreSetUnavailableReason = (set: StoreSet, products: StoreProduct[]) => {
  if (!set.available) return 'Unavailable — this set is inactive.';
  const blockedGroup = set.groups.find(group => (
    group.required && getAvailableSetOptions(group, products).length < group.selectionCount
  ));
  return blockedGroup
    ? `Unavailable — ${blockedGroup.name} group has no available options.`
    : '';
};

export const validateStoreSetSelections = (
  set: StoreSet,
  products: StoreProduct[],
  selectedItems: NonNullable<CartSelection['selectedSetItems']>
) => {
  const unavailableReason = getStoreSetUnavailableReason(set, products);
  if (unavailableReason) return unavailableReason;
  for (const group of set.groups) {
    const selected = selectedItems.filter(item => item.groupId === group.id);
    const requiredCount = group.required ? group.selectionCount : 0;
    if (selected.length < requiredCount || selected.length > group.selectionCount) {
      return group.required
        ? `Choose ${group.selectionCount} ${group.name} option${group.selectionCount === 1 ? '' : 's'} for ${set.name}.`
        : `Choose up to ${group.selectionCount} ${group.name} option${group.selectionCount === 1 ? '' : 's'} for ${set.name}.`;
    }
    if (new Set(selected.map(item => item.productId)).size !== selected.length) return `Choose each ${group.name} product only once.`;
    if (selected.some(item => !getAvailableSetOptions(group, products).some(option => option.productId === item.productId))) {
      return `Choose an available ${group.name} option for ${set.name}.`;
    }
  }
  if (selectedItems.some(item => !set.groups.some(group => group.id === item.groupId))) return `A selection for ${set.name} is no longer available.`;
  return '';
};

export const calculateStoreSetAnalysis = (
  set: Pick<StoreSet, 'price' | 'groups'>,
  products: StoreProduct[],
  selectedItems: NonNullable<CartSelection['selectedSetItems']>,
  recipes: Recipe[] = []
) => {
  const resolved = selectedItems.flatMap(item => {
    const group = set.groups.find(candidate => candidate.id === item.groupId);
    const option = group?.options.find(candidate => candidate.productId === item.productId);
    const product = products.find(candidate => candidate.id === item.productId);
    return group && option && product ? [{ group, option, product }] : [];
  });
  const upgradeTotal = roundMoney(resolved.reduce((sum, item) => sum + item.option.priceAdjustment, 0));
  const sellingPrice = roundMoney(set.price + upgradeTotal);
  const regularValue = roundMoney(resolved.reduce((sum, item) => sum + item.product.price, 0));
  const costs = resolved
    .map(item => resolveStoreProductEstimatedCost(item.product, recipes))
    .filter((cost): cost is number => cost !== null);
  const hasCompleteCost = resolved.length > 0 && costs.length === resolved.length;
  const estimatedCost = hasCompleteCost ? roundMoney(costs.reduce((sum, cost) => sum + cost, 0)) : null;
  const grossProfit = estimatedCost === null ? null : roundMoney(sellingPrice - estimatedCost);
  const grossMargin = grossProfit === null || sellingPrice <= 0 ? null : Math.round((grossProfit / sellingPrice) * 1000) / 10;
  return {
    upgradeTotal,
    sellingPrice,
    regularValue,
    customerSaving: roundMoney(Math.max(0, regularValue - sellingPrice)),
    estimatedCost,
    grossProfit,
    grossMargin
  };
};

export const getDefaultStoreSetSelections = (set: StoreSet, products: StoreProduct[]) => (
  set.groups.flatMap(group => getAvailableSetOptions(group, products)
    .slice(0, group.required ? group.selectionCount : 0)
    .map(option => ({ groupId: group.id, productId: option.productId })))
);

export const buildStoreSetOrderItem = (
  selection: CartSelection,
  set: StoreSet,
  products: StoreProduct[]
): StoreOrderItem => {
  const selectedItems = selection.selectedSetItems || [];
  const error = validateStoreSetSelections(set, products, selectedItems);
  if (error) throw new Error(error);
  const analysis = calculateStoreSetAnalysis(set, products, selectedItems);
  const selectedGroups = selectedItems.map(item => {
    const group = set.groups.find(candidate => candidate.id === item.groupId)!;
    const option = group.options.find(candidate => candidate.productId === item.productId)!;
    const product = products.find(candidate => candidate.id === item.productId)!;
    return {
      groupId: group.id,
      groupName: group.name,
      productId: product.id,
      productName: product.name,
      standalonePrice: product.price,
      ...(Number.isFinite(product.estimatedCost) ? { estimatedCost: product.estimatedCost } : {}),
      priceAdjustment: option.priceAdjustment
    };
  });
  return {
    itemType: 'set',
    productId: set.id,
    productName: set.name,
    photoUrl: set.photoUrl,
    quantity: selection.quantity,
    basePrice: set.price,
    unitPrice: analysis.sellingPrice,
    lineTotal: roundMoney(analysis.sellingPrice * selection.quantity),
    selectedOptions: [],
    setSnapshot: {
      setId: set.id,
      setName: set.name,
      category: set.category,
      baseSetPrice: set.price,
      regularValue: analysis.regularValue,
      customerSaving: analysis.customerSaving,
      selectedGroups
    }
  };
};
