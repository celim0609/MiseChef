import type {
  StoreOrderItem,
  StoreOrderItemOption,
  StoreOrderSetSelection,
  StoreOrderSetSnapshot
} from './types';

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const readNumber = (value: unknown) => (
  Number.isFinite(Number(value)) ? Number(value) : 0
);

const normalizeSelectedOption = (value: unknown): StoreOrderItemOption => {
  const option = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    groupId: readString(option.groupId),
    groupName: readString(option.groupName, 'Options'),
    optionId: readString(option.optionId),
    optionName: readString(option.optionName, 'Option'),
    priceAdjustment: readNumber(option.priceAdjustment)
  };
};

const normalizeSetSelection = (value: unknown): StoreOrderSetSelection => {
  const selection = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const estimatedCost = Number(selection.estimatedCost);
  return {
    groupId: readString(selection.groupId),
    groupName: readString(selection.groupName, 'Selection'),
    productId: readString(selection.productId),
    productName: readString(selection.productName, 'Product'),
    standalonePrice: readNumber(selection.standalonePrice),
    ...(Number.isFinite(estimatedCost) ? { estimatedCost } : {}),
    priceAdjustment: readNumber(selection.priceAdjustment)
  };
};

const normalizeSetSnapshot = (value: unknown): StoreOrderSetSnapshot | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const snapshot = value as Record<string, unknown>;
  return {
    setId: readString(snapshot.setId),
    setName: readString(snapshot.setName, 'Set'),
    category: readString(snapshot.category),
    baseSetPrice: readNumber(snapshot.baseSetPrice),
    regularValue: readNumber(snapshot.regularValue),
    customerSaving: readNumber(snapshot.customerSaving),
    selectedGroups: Array.isArray(snapshot.selectedGroups)
      ? snapshot.selectedGroups.map(normalizeSetSelection)
      : []
  };
};

export const normalizeStoreOrderItem = (value: unknown): StoreOrderItem => {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const setSnapshot = normalizeSetSnapshot(item.setSnapshot);
  return {
    productId: readString(item.productId),
    productName: readString(item.productName, 'Product'),
    photoUrl: readString(item.photoUrl),
    quantity: Math.max(1, Math.round(readNumber(item.quantity))),
    basePrice: readNumber(item.basePrice),
    unitPrice: readNumber(item.unitPrice),
    lineTotal: readNumber(item.lineTotal),
    selectedOptions: Array.isArray(item.selectedOptions)
      ? item.selectedOptions.map(normalizeSelectedOption)
      : [],
    ...(setSnapshot ? { setSnapshot } : {})
  };
};

export const formatStoreOrderSetSelection = (
  selection: StoreOrderSetSelection,
  currency: string
) => `${selection.groupName}: ${selection.productName}${
  selection.priceAdjustment > 0
    ? ` (+${currency} ${selection.priceAdjustment.toFixed(2)})`
    : ''
}`;
