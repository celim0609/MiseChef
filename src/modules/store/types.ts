import type { RegionCode, RegionCurrency } from '../../regions';

export type StorePaymentProviderId = string;

export type StoreOrderDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type StoreEarliestPickupDays = 0 | 1;
export type StoreMaximumAdvanceDays = 7 | 14 | 30;

export interface WorkspaceStore {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  logoUrl: string;
  coverImageUrl: string;
  description: string;
  contactInformation: string;
  businessWhatsApp: string;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
  orderDays: StoreOrderDay[];
  earliestPickupDays: StoreEarliestPickupDays;
  maximumAdvanceDays: StoreMaximumAdvanceDays;
  unavailableDates: string[];
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
  businessWhatsApp: string;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
  orderDays: StoreOrderDay[];
  earliestPickupDays: StoreEarliestPickupDays;
  maximumAdvanceDays: StoreMaximumAdvanceDays;
  unavailableDates: string[];
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
  orderNumber: string;
  storeId: string;
  workspaceId: string;
  storeName: string;
  currency: RegionCurrency;
  paymentMethodId: string;
  paymentMethodName: string;
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
  status:
    | 'Awaiting Payment'
    | 'Payment Processing'
    | 'Paid'
    | 'Payment Failed'
    | 'Payment Cancelled'
    | 'Refund Processing'
    | 'Partially Refunded'
    | 'Refunded';
  payment: {
    provider: StorePaymentProviderId;
    providerMode: 'single_merchant' | 'connect' | 'merchant_gateway';
    status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
    amountMinor: number;
    currency: RegionCurrency;
    providerPaymentId: string;
    providerPaymentMethod: string;
    checkoutAccessTokenHash: string;
    failureCode: string;
    refundStatus: 'none' | 'pending' | 'partial' | 'refunded' | 'failed';
    refundedAmountMinor: number;
    refundFailureCode: string;
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
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

export type StorePaymentCheckout =
  | {
    type: 'stripe_payment_element';
    clientSecret: string;
  }
  | {
    type: 'provider_redirect';
    redirectUrl: string;
  };

export interface StorePaymentSession {
  orderNumber: string;
  provider: StorePaymentProviderId;
  paymentSessionId: string;
  checkout: StorePaymentCheckout;
  checkoutAccessToken: string;
}

export interface PublicStoreOrderResult {
  orderNumber: string;
  storeName: string;
  currency: RegionCurrency;
  paymentMethodName: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationName: string;
  total: number;
  status: StoreOrder['status'];
  paymentStatus: StoreOrder['payment']['status'];
}
