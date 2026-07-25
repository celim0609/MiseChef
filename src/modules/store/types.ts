import type { RegionCode, RegionCurrency } from '../../regions';

export interface WorkspaceStore {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  logoUrl: string;
  coverImageUrl: string;
  description: string;
  contactInformation: string;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
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
  contactInformation: string;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
}

export interface StorePickupLocation {
  id: string;
  name: string;
  address: string;
  notes: string;
}

export interface StoreOption {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface StoreOptionGroup {
  id: string;
  storeId: string;
  workspaceId: string;
  name: string;
  options: StoreOption[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOptionGroupDraft {
  name: string;
  options: StoreOption[];
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
  optionGroupIds: string[];
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
  optionGroupIds: string[];
}

export interface PublicStoreData {
  store: WorkspaceStore;
  products: StoreProduct[];
  optionGroups: StoreOptionGroup[];
}

export interface CartSelection {
  productId: string;
  quantity: number;
  selectedOptions: Array<{
    groupId: string;
    optionId: string;
  }>;
}

export interface StoreOrderItemOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface StoreOrderItem {
  productId: string;
  productName: string;
  photoUrl: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  selectedOptions: StoreOrderItemOption[];
}

export interface StoreOrder {
  id: string;
  storeId: string;
  workspaceId: string;
  storeName: string;
  currency: RegionCurrency;
  customerName: string;
  phone: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationId: string;
  pickupLocationName: string;
  pickupLocationAddress: string;
  pickupLocationNotes: string;
  notes: string;
  items: StoreOrderItem[];
  itemCount: number;
  total: number;
  status: 'Placed';
  createdAt: string;
}

export interface StoreOrderDraft {
  customerName: string;
  phone: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationId: string;
  notes: string;
  selections: CartSelection[];
}
