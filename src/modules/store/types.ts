import type { RegionCode, RegionCurrency } from '../../regions';

export type StorePaymentProviderId = string;

export type StorePaymentMethodId =
  | 'cash_on_pickup'
  | 'touch_n_go_qr'
  | 'duitnow_qr'
  | 'bank_transfer'
  | 'stripe';

export interface StorePaymentMethodConfig {
  id: StorePaymentMethodId;
  enabled: boolean;
  qrCodeUrl: string;
  instructions: string;
}

export interface StoreContact {
  phone: string;
  email: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  website: string;
}

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
  storeContact: StoreContact;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
  orderDays: StoreOrderDay[];
  earliestPickupDays: StoreEarliestPickupDays;
  maximumAdvanceDays: StoreMaximumAdvanceDays;
  unavailableDates: string[];
  paymentMethods: StorePaymentMethodConfig[];
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
  storeContact: StoreContact;
  businessHours: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
  orderDays: StoreOrderDay[];
  earliestPickupDays: StoreEarliestPickupDays;
  maximumAdvanceDays: StoreMaximumAdvanceDays;
  unavailableDates: string[];
  paymentMethods: StorePaymentMethodConfig[];
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
  available: boolean;
  sortOrder: number;
}

export type StoreOptionSelectionType = 'single' | 'multiple';

export interface StoreOptionGroup {
  id: string;
  storeId: string;
  workspaceId: string;
  name: string;
  selectionType: StoreOptionSelectionType;
  required: boolean;
  minimumSelections: number;
  maximumSelections: number;
  sortOrder: number;
  available: boolean;
  options: StoreOption[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOptionGroupDraft {
  name: string;
  selectionType: StoreOptionSelectionType;
  required: boolean;
  minimumSelections: number;
  maximumSelections: number;
  sortOrder: number;
  available: boolean;
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

export type StoreFulfilmentStatus =
  | 'Confirmed'
  | 'Paid'
  | 'Preparing'
  | 'Ready'
  | 'Completed'
  | 'Cancelled';

export interface StoreOrderTimelineEvent {
  id: string;
  orderId: string;
  workspaceId: string;
  storeId: string;
  type: 'payment_received' | 'payment_review' | 'fulfilment_status';
  label: string;
  previousStatus: string;
  newStatus: StoreFulfilmentStatus | 'Pending Verification' | 'Payment Rejected';
  actingUserId: string;
  createdAt: string;
}

export interface StoreNotification {
  id: string;
  workspaceId: string;
  storeId: string;
  orderId: string;
  orderNumber: string;
  type: 'new_paid_order' | 'payment_verification_required';
  title: string;
  message: string;
  readAt: string;
  createdAt: string;
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
  fulfilmentStatus: StoreFulfilmentStatus | '';
  fulfilmentUpdatedAt: string;
  fulfilmentUpdatedBy: string;
  status:
    | 'Awaiting Payment'
    | 'Payment Processing'
    | 'Paid'
    | 'Payment Failed'
    | 'Payment Cancelled'
    | 'Pending Verification'
    | 'Payment Rejected'
    | 'Confirmed'
    | 'Refund Processing'
    | 'Partially Refunded'
    | 'Refunded';
  payment: {
    provider: StorePaymentProviderId;
    providerMode: 'single_merchant' | 'connect' | 'merchant_gateway' | 'manual';
    status: 'pending' | 'pending_verification' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'rejected';
    amountMinor: number;
    currency: RegionCurrency;
    providerPaymentId: string;
    providerPaymentMethod: string;
    checkoutAccessTokenHash: string;
    failureCode: string;
    refundStatus: 'none' | 'pending' | 'partial' | 'refunded' | 'failed';
    refundedAmountMinor: number;
    refundFailureCode: string;
    receiptPath: string;
    receiptFileName: string;
    receiptUploadedAt: string;
    reviewedAt: string;
    reviewedBy: string;
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StoreOrderDraft {
  paymentMethodId?: StorePaymentMethodId;
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
  }
  | {
    type: 'manual_payment';
    methodId: Exclude<StorePaymentMethodId, 'stripe'>;
    methodName: string;
    qrCodeUrl: string;
    instructions: string;
    receiptAllowed: boolean;
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
