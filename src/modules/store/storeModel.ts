import type { Workspace } from '../../types';
import { getWorkspaceRegionConfiguration, normalizeRegionCode } from '../../regions';
import type {
  CartSelection,
  StoreProduct,
  StoreProductDraft,
  StoreOptionGroup,
  StoreOptionGroupDraft,
  StoreOrderItem,
  StoreOrderDraft,
  StoreSettingsDraft,
  WorkspaceStore
} from './types';

export const DEFAULT_STORE_BUSINESS_HOURS = 'Monday–Sunday, 9:00 AM–9:00 PM';

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const readBoolean = (value: unknown, fallback = false) => (
  typeof value === 'boolean' ? value : fallback
);

const readPrice = (value: unknown) => {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : 0;
};

export const toStoreSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'store';

export const createDefaultWorkspaceStore = (
  workspace: Pick<Workspace, 'id' | 'name' | 'country'>,
  createdBy: string,
  now = new Date().toISOString()
): WorkspaceStore => {
  const region = getWorkspaceRegionConfiguration(workspace);

  return {
    id: workspace.id,
    workspaceId: workspace.id,
    slug: toStoreSlug(workspace.name),
    name: workspace.name,
    logoUrl: '',
    coverImageUrl: '',
    description: '',
    businessHours: DEFAULT_STORE_BUSINESS_HOURS,
    pickupEnabled: false,
    deliveryEnabled: false,
    pickupSessions: [],
    country: region.country,
    currency: region.currency,
    createdBy,
    createdAt: now,
    updatedAt: now
  };
};

export const normalizeWorkspaceStore = (
  id: string,
  data: Record<string, unknown>
): WorkspaceStore => {
  const country = normalizeRegionCode(data.country);
  const region = getWorkspaceRegionConfiguration({ country });

  return {
    id,
    workspaceId: readString(data.workspaceId, id),
    slug: toStoreSlug(readString(data.slug, id)),
    name: readString(data.name, 'MiseChef Store'),
    logoUrl: readString(data.logoUrl),
    coverImageUrl: readString(data.coverImageUrl),
    description: readString(data.description),
    businessHours: readString(data.businessHours, DEFAULT_STORE_BUSINESS_HOURS),
    pickupEnabled: readBoolean(data.pickupEnabled),
    deliveryEnabled: readBoolean(data.deliveryEnabled),
    pickupSessions: Array.isArray(data.pickupSessions)
      ? [...new Set(data.pickupSessions.filter((session): session is string => typeof session === 'string' && Boolean(session.trim())).map(session => session.trim()))]
      : [],
    country: region.country,
    currency: region.currency,
    createdBy: readString(data.createdBy),
    createdAt: readString(data.createdAt, new Date().toISOString()),
    updatedAt: readString(data.updatedAt, new Date().toISOString())
  };
};

export const normalizeStoreProduct = (
  id: string,
  data: Record<string, unknown>
): StoreProduct => ({
  id,
  storeId: readString(data.storeId),
  workspaceId: readString(data.workspaceId),
  photoUrl: readString(data.photoUrl),
  name: readString(data.name, 'Product'),
  description: readString(data.description),
  price: readPrice(data.price),
  available: readBoolean(data.available),
  optionGroupIds: Array.isArray(data.optionGroupIds)
    ? [...new Set(data.optionGroupIds.filter((groupId): groupId is string => typeof groupId === 'string' && Boolean(groupId.trim())).map(groupId => groupId.trim()))]
    : [],
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt, new Date().toISOString()),
  updatedAt: readString(data.updatedAt, new Date().toISOString())
});

export const validateStoreSettings = (draft: StoreSettingsDraft) => {
  const pickupSessions = draft.pickupSessions.map(session => session.trim()).filter(Boolean);
  if (!draft.name.trim()) return 'Store name is required.';
  if (draft.name.trim().length > 120) return 'Store name must be 120 characters or fewer.';
  if (draft.description.trim().length > 1200) return 'Description must be 1,200 characters or fewer.';
  if (draft.businessHours.trim().length > 300) return 'Business hours must be 300 characters or fewer.';
  if (pickupSessions.length > 20) return 'Use 20 pickup sessions or fewer.';
  if (pickupSessions.some(session => session.length > 80)) {
    return 'Each pickup session must be between 1 and 80 characters.';
  }
  if (new Set(pickupSessions).size !== pickupSessions.length) return 'Pickup sessions must be unique.';
  if (draft.pickupEnabled && pickupSessions.length === 0) {
    return 'Add at least one pickup session before enabling pickup.';
  }
  return '';
};

export const validateStoreProduct = (draft: StoreProductDraft) => {
  if (!draft.photoUrl.trim()) return 'Product photo is required.';
  if (!draft.name.trim()) return 'Product name is required.';
  if (draft.name.trim().length > 160) return 'Product name must be 160 characters or fewer.';
  if (draft.description.trim().length > 1200) return 'Product description must be 1,200 characters or fewer.';
  if (!Number.isFinite(draft.price) || draft.price < 0) return 'Enter a valid product price.';
  if (draft.optionGroupIds.length > 10) return 'Use 10 option groups or fewer on one product.';
  if (new Set(draft.optionGroupIds).size !== draft.optionGroupIds.length) return 'A product cannot use the same option group twice.';
  return '';
};

export const normalizeStoreOptionGroup = (
  id: string,
  data: Record<string, unknown>
): StoreOptionGroup => ({
  id,
  storeId: readString(data.storeId),
  workspaceId: readString(data.workspaceId),
  name: readString(data.name, 'Options'),
  options: Array.isArray(data.options)
    ? data.options
      .filter(option => option && typeof option === 'object')
      .map(option => {
        const value = option as Record<string, unknown>;
        return {
          id: readString(value.id),
          name: readString(value.name, 'Option'),
          priceAdjustment: Number.isFinite(Number(value.priceAdjustment))
            ? Number(value.priceAdjustment)
            : 0
        };
      })
      .filter(option => option.id && option.name)
    : [],
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt, new Date().toISOString()),
  updatedAt: readString(data.updatedAt, new Date().toISOString())
});

export const validateStoreOptionGroup = (draft: StoreOptionGroupDraft) => {
  if (!draft.name.trim()) return 'Option group name is required.';
  if (draft.name.trim().length > 100) return 'Option group name must be 100 characters or fewer.';
  if (draft.options.length === 0) return 'Add at least one option.';
  if (draft.options.length > 20) return 'Use 20 options or fewer in one group.';
  if (draft.options.some(option => !option.name.trim())) return 'Every option needs a name.';
  if (draft.options.some(option => option.name.trim().length > 100)) return 'Option names must be 100 characters or fewer.';
  if (draft.options.some(option => !Number.isFinite(option.priceAdjustment))) return 'Every price adjustment must be valid.';
  if (new Set(draft.options.map(option => option.id)).size !== draft.options.length) return 'Every option must be unique.';
  return '';
};

export const validateStoreOrder = (
  draft: StoreOrderDraft,
  store: Pick<WorkspaceStore, 'pickupEnabled' | 'pickupSessions'>
) => {
  if (!store.pickupEnabled) return 'Pickup ordering is not available.';
  if (!draft.customerName.trim()) return 'Name is required.';
  if (draft.customerName.trim().length > 120) return 'Name must be 120 characters or fewer.';
  if (!draft.phone.trim() || draft.phone.replace(/\D/g, '').length < 6) return 'Enter a valid phone number.';
  if (draft.phone.trim().length > 40) return 'Phone number must be 40 characters or fewer.';
  if (!draft.pickupDate) return 'Pickup date is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.pickupDate)) return 'Choose a valid pickup date.';
  if (draft.pickupDate < new Date().toISOString().slice(0, 10)) return 'Pickup date cannot be in the past.';
  if (!store.pickupSessions.includes(draft.pickupSession)) return 'Choose a valid pickup session.';
  if (draft.notes.trim().length > 500) return 'Notes must be 500 characters or fewer.';
  if (draft.selections.length === 0) return 'Your cart is empty.';
  if (draft.selections.some(selection => !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 20)) {
    return 'Each product quantity must be between 1 and 20.';
  }
  return '';
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const buildStoreOrderItems = (
  selections: CartSelection[],
  products: StoreProduct[],
  optionGroups: StoreOptionGroup[]
): StoreOrderItem[] => selections.map(selection => {
  const product = products.find(candidate => candidate.id === selection.productId && candidate.available);
  if (!product) throw new Error('A product in your cart is no longer available.');

  const selectedOptions = product.optionGroupIds.map(groupId => {
    const group = optionGroups.find(candidate => candidate.id === groupId);
    if (!group) throw new Error(`Options for ${product.name} are no longer available.`);

    const choices = selection.selectedOptions.filter(choice => choice.groupId === groupId);
    if (choices.length !== 1) throw new Error(`Choose one ${group.name} option for ${product.name}.`);
    const option = group.options.find(candidate => candidate.id === choices[0].optionId);
    if (!option) throw new Error(`Choose a valid ${group.name} option for ${product.name}.`);

    return {
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionName: option.name,
      priceAdjustment: option.priceAdjustment
    };
  });

  if (selection.selectedOptions.some(choice => !product.optionGroupIds.includes(choice.groupId))) {
    throw new Error(`An option for ${product.name} is no longer available.`);
  }

  const unitPrice = roundMoney(Math.max(
    0,
    product.price + selectedOptions.reduce((sum, option) => sum + option.priceAdjustment, 0)
  ));

  return {
    productId: product.id,
    productName: product.name,
    photoUrl: product.photoUrl,
    quantity: selection.quantity,
    basePrice: product.price,
    unitPrice,
    lineTotal: roundMoney(unitPrice * selection.quantity),
    selectedOptions
  };
});
