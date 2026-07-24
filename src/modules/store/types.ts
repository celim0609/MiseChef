import type { RegionCode, RegionCurrency } from '../../regions';

export interface WorkspaceStore {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  logoUrl: string;
  coverImageUrl: string;
  description: string;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  country: RegionCode;
  currency: RegionCurrency;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettingsDraft {
  name: string;
  logoUrl: string;
  coverImageUrl: string;
  description: string;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
}

export interface StoreProduct {
  id: string;
  storeId: string;
  workspaceId: string;
  photoUrl: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreProductDraft {
  photoUrl: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
}

export interface PublicStoreData {
  store: WorkspaceStore;
  products: StoreProduct[];
}
