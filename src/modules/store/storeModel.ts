import type { Workspace } from '../../types';
import { getWorkspaceRegionConfiguration, normalizeRegionCode } from '../../regions';
import type {
  StoreProduct,
  StoreProductDraft,
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
    pickupEnabled: true,
    deliveryEnabled: false,
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
    pickupEnabled: readBoolean(data.pickupEnabled, true),
    deliveryEnabled: readBoolean(data.deliveryEnabled),
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
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt, new Date().toISOString()),
  updatedAt: readString(data.updatedAt, new Date().toISOString())
});

export const validateStoreSettings = (draft: StoreSettingsDraft) => {
  if (!draft.name.trim()) return 'Store name is required.';
  if (draft.name.trim().length > 120) return 'Store name must be 120 characters or fewer.';
  if (draft.description.trim().length > 1200) return 'Description must be 1,200 characters or fewer.';
  if (draft.businessHours.trim().length > 300) return 'Business hours must be 300 characters or fewer.';
  return '';
};

export const validateStoreProduct = (draft: StoreProductDraft) => {
  if (!draft.photoUrl.trim()) return 'Product photo is required.';
  if (!draft.name.trim()) return 'Product name is required.';
  if (draft.name.trim().length > 160) return 'Product name must be 160 characters or fewer.';
  if (draft.description.trim().length > 1200) return 'Product description must be 1,200 characters or fewer.';
  if (!Number.isFinite(draft.price) || draft.price < 0) return 'Enter a valid product price.';
  return '';
};
