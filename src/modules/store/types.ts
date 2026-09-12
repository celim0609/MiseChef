import type { RegionCode, RegionCurrency } from '../../regions';

export type StorePaymentProviderId = string;

export type StorePaymentMethodId =
  | 'cash_on_pickup'
  | 'touch_n_go_qr'
  | 'duitnow_qr'
  | 'bank_transfer'
  | 'stripe'
  | 'curlec';

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

export interface StoreDeliveryConfig {
  enabled: boolean;
  provider: 'lalamove';
  environment: 'sandbox';
  market: 'MY';
  pickupLocationId: string;
  serviceType: string;
  pickup: { name: string; address: string; latitude: string; longitude: string; contactName: string; contactPhoneE164: string };
  subsidy: { enabled: boolean; minimumMerchandiseSpend: number; maximumCustomerDeliveryCharge: number };
  fulfilment: {
    preOrder: { enabled: boolean; orderDays: StoreOrderDay[]; earliestDays: StoreEarliestPickupDays; maximumAdvanceDays: StoreMaximumAdvanceDays; unavailableDates: string[]; sessions: string[] };
    instant: { enabled: boolean; operatingHours: { start: string; end: string }; preparationMinutes: number };
  };
}

export interface CustomerContact {
  name: string;
  phone: string;
  email: string;
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
  delivery?: StoreDeliveryConfig;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
  orderDays: StoreOrderDay[];
  earliestPickupDays: StoreEarliestPickupDays;
  maximumAdvanceDays: StoreMaximumAdvanceDays;
  unavailableDates: string[];
  paymentMethods: StorePaymentMethodConfig[];
  hostProgram: StoreHostProgramConfig;
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
  delivery?: StoreDeliveryConfig;
  pickupSessions: string[];
  pickupLocations: StorePickupLocation[];
  orderDays: StoreOrderDay[];
  earliestPickupDays: StoreEarliestPickupDays;
  maximumAdvanceDays: StoreMaximumAdvanceDays;
  unavailableDates: string[];
  paymentMethods: StorePaymentMethodConfig[];
  hostProgram: StoreHostProgramConfig;
}

export interface StoreHostProgramConfig {
  enabled: boolean;
  rewardPercent: number;
  minimumQualifyingSales: number;
}

export interface PublicGroupOrder {
  id: string;
  shareCode: string;
  storeSlug: string;
  storeName: string;
  hostName: string;
  name: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationId: string;
  pickupLocationName: string;
  pickupLocationAddress: string;
  closesAt: string;
  status: 'open' | 'closed' | 'cancelled';
}

export interface HostGroupOrder extends PublicGroupOrder {
  rewardPercent: number;
  minimumQualifyingSales: number;
  lifetimeOrderCount: number | null;
  archived: boolean;
  archivedAt?: string;
  archivedBy?: string;
  orderCount: number;
  eligibleSales: number;
  estimatedReward: number;
}

export interface HostGroupOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  itemCount: number;
  items: Array<{
    productName: string;
    quantity: number;
    lineTotal?: number;
    setSelections: Array<{ groupName: string; productName: string }>;
    selectedOptions: Array<{ groupName: string; optionName: string }>;
  }>;
  remarks: string;
  total: number;
  currency: RegionCurrency;
  fulfilmentMethod: 'pickup' | 'delivery';
  totals?: NonNullable<StoreOrder['totals']>;
  paymentStatus: StoreOrder['payment']['status'];
  fulfilmentStatus: StoreFulfilmentStatus | '';
  createdAt: string;
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
  recipeId?: string;
  /** Legacy field retained only for existing order/data compatibility. */
  estimatedCost?: number;
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
  recipeId?: string;
  available: boolean;
  optionGroupIds: string[];
}

export interface StoreSetOption {
  productId: string;
  priceAdjustment: number;
  sortOrder: number;
}

export interface StoreSetGroup {
  id: string;
  name: string;
  required: boolean;
  selectionCount: number;
  sortOrder: number;
  options: StoreSetOption[];
}

export interface StoreSet {
  id: string;
  storeId: string;
  workspaceId: string;
  name: string;
  description: string;
  photoUrl: string;
  category: string;
  price: number;
  available: boolean;
  sortOrder: number;
  groups: StoreSetGroup[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSetDraft {
  name: string;
  description: string;
  photoUrl: string;
  category: string;
  price: number;
  available: boolean;
  sortOrder: number;
  groups: StoreSetGroup[];
}

export interface PublicStoreData {
  store: WorkspaceStore;
  products: StoreProduct[];
  optionGroups: StoreOptionGroup[];
  sets: StoreSet[];
}

export interface CartSelection {
  productId: string;
  setId?: string;
  quantity: number;
  selectedOptions: Array<{
    groupId: string;
    optionId: string;
  }>;
  selectedSetItems?: Array<{
    groupId: string;
    productId: string;
  }>;
}

export interface StoreOrderSetSelection {
  groupId: string;
  groupName: string;
  productId: string;
  productName: string;
  standalonePrice: number;
  estimatedCost?: number;
  priceAdjustment: number;
}

export interface StoreOrderSetSnapshot {
  setId: string;
  setName: string;
  category: string;
  baseSetPrice: number;
  regularValue: number;
  customerSaving: number;
  selectedGroups: StoreOrderSetSelection[];
}

export interface StoreOrderItemOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface StoreOrderItem {
  itemType?: 'product' | 'set';
  productId: string;
  productName: string;
  photoUrl: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  selectedOptions: StoreOrderItemOption[];
  setSnapshot?: StoreOrderSetSnapshot;
}

export type StoreOrderSource = 'online' | 'pos';

export type StoreFulfilmentStatus =
  | 'New'
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
  type:
    | 'new_order'
    | 'payment_submitted'
    | 'payment_approved'
    | 'payment_rejected'
    | 'order_ready';
  title: string;
  message: string;
  readAt: string;
  createdAt: string;
}

export interface StoreOrder {
  id: string;
  orderNumber: string;
  pickupCode?: string;
  storeId: string;
  workspaceId: string;
  orderSource: StoreOrderSource;
  fulfilmentMethod?: 'pickup' | 'delivery';
  totals?: { merchandiseSubtotal: number; discountTotal: number; discountedMerchandiseTotal: number; deliveryFee: number; grandTotal: number; currency: RegionCurrency };
  delivery?: {
    fulfilmentMethod: 'delivery';
    fulfilmentMode?: 'preorder' | 'instant';
    // Checkout pricing/address snapshots are created server-side at payment time.
    // The fields below are server-controlled mutable delivery operations only.
    dispatch?: { status?: string; errorCode?: string; attempt?: number };
    lifecycle?: { state?: 'not_started' | 'assigning_driver' | 'driver_assigned' | 'picked_up' | 'completed' | 'canceled' | 'expired' | 'rejected'; providerStatus?: string; changedAt?: string; history?: Array<{ state: string; providerStatus: string; source: string; occurredAt: string }> };
    providerOrder?: { orderId?: string; status?: string; driverId?: string; shareLink?: string; driver?: { name?: string; phone?: string; plateNumber?: string; photo?: string; coordinates?: { lat?: string; lng?: string; updatedAt?: string } } };
    recipient?: { address?: string };
    quote?: { fee?: number; expiresAt?: string };
  };
  customerUid?: string;
  groupOrder?: {
    id: string;
    shareCode: string;
    name: string;
    hostId: string;
    hostName: string;
    rewardPercent: number;
  };
  storeName: string;
  currency: RegionCurrency;
  paymentMethodId: string;
  paymentMethodName: string;
  customerName: string;
  phone: string;
  customerEmail?: string;
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
  completedAt: string;
  cancelledAt: string;
  cancelledBy: string;
  cancellationReason: string;
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
    providerTransactionId: string;
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

export interface CustomerStoreOrderSummary {
  orderNumber: string;
  orderDate: string;
  storeName: string;
  itemCount: number;
  items: Array<{
    productName: string;
    quantity: number;
    setSelections: Array<{ groupName: string; productName: string }>;
    selectedOptions: Array<{ groupName: string; optionName: string }>;
  }>;
  remarks: string;
  total: number;
  currency: RegionCurrency;
  paymentStatus: StoreOrder['payment']['status'];
  orderStatus: StoreOrder['status'];
  fulfilmentStatus: StoreFulfilmentStatus;
  groupName?: string;
}

export interface StoreOrderDraft {
  /** Opaque client-generated idempotency key for one checkout submission. */
  checkoutAttemptId?: string;
  fulfilmentMethod?: 'pickup' | 'delivery';
  paymentMethodId?: StorePaymentMethodId;
  customerName: string;
  phone: string;
  customerEmail?: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationId: string;
  notes: string;
  selections: CartSelection[];
  groupShareCode?: string;
  deliveryQuoteId?: string;
  fulfilmentMode?: 'preorder' | 'instant';
  destination?: {
    formattedAddress: string;
    latitude: string;
    longitude: string;
    deliveryInstructions?: string;
  };
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
    type: 'curlec_standard_checkout';
    keyId: string;
    orderId: string;
    amountMinor: number;
    currency: RegionCurrency;
    name: string;
    description: string;
  }
  | {
    type: 'manual_payment';
    methodId: Exclude<StorePaymentMethodId, 'stripe' | 'curlec'>;
    methodName: string;
    qrCodeUrl: string;
    instructions: string;
    receiptAllowed: boolean;
    amountMinor: number;
    currency: RegionCurrency;
  };

export interface PublicOrderGroupContext {
  id: string;
  name: string;
  hostName: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationName: string;
}

export interface StorePaymentOrderSummary {
  fulfilmentMethod: 'pickup' | 'delivery';
  items: Array<{
    productName: string;
    quantity: number;
    lineTotal: number;
    selectedOptions: Array<{ groupName: string; optionName: string; priceAdjustment: number }>;
    setSnapshot?: { setName: string; selectedGroups: Array<{ groupName: string; productName: string; priceAdjustment: number }> };
  }>;
  totals: NonNullable<StoreOrder['totals']>;
}

export interface StorePaymentSession {
  orderNumber: string;
  pickupCode: string;
  provider: StorePaymentProviderId;
  paymentSessionId: string;
  checkout: StorePaymentCheckout;
  checkoutAccessToken: string;
  orderSummary?: StorePaymentOrderSummary;
  groupOrder?: PublicOrderGroupContext;
}

export interface PublicStoreOrderResult {
  orderNumber: string;
  pickupCode: string;
  storeName: string;
  currency: RegionCurrency;
  paymentMethodName: string;
  pickupDate: string;
  pickupSession: string;
  pickupLocationName: string;
  total: number;
  status: StoreOrder['status'];
  paymentStatus: StoreOrder['payment']['status'];
  groupOrder?: PublicOrderGroupContext;
}
