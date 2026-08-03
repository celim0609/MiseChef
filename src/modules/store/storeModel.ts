import type { Workspace } from '../../types';
import { getWorkspaceRegionConfiguration, normalizeRegionCode } from '../../regions';
import { isValidBusinessWhatsApp } from './selling';
import type {
  CartSelection,
  StoreProduct,
  StoreProductDraft,
  StoreOptionGroup,
  StoreOptionGroupDraft,
  StoreOrderItem,
  StoreOrderDraft,
  StoreOrderDay,
  StorePaymentMethodConfig,
  StoreContact,
  StoreSettingsDraft,
  WorkspaceStore
} from './types';

export const DEFAULT_STORE_BUSINESS_HOURS = 'Monday–Sunday, 9:00 AM–9:00 PM';
export const STORE_ORDER_DAYS: Array<{ id: StoreOrderDay; label: string; dayIndex: number }> = [
  { id: 'monday', label: 'Monday', dayIndex: 1 },
  { id: 'tuesday', label: 'Tuesday', dayIndex: 2 },
  { id: 'wednesday', label: 'Wednesday', dayIndex: 3 },
  { id: 'thursday', label: 'Thursday', dayIndex: 4 },
  { id: 'friday', label: 'Friday', dayIndex: 5 },
  { id: 'saturday', label: 'Saturday', dayIndex: 6 },
  { id: 'sunday', label: 'Sunday', dayIndex: 0 }
];
export const DEFAULT_STORE_ORDER_DAYS = STORE_ORDER_DAYS.map(day => day.id);
export const createDefaultStoreContact = (): StoreContact => ({
  phone: '',
  email: '',
  whatsapp: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  website: ''
});

export const normalizeStoreContact = (
  value: unknown,
  legacyWhatsApp = ''
): StoreContact => {
  const contact = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    phone: readString(contact.phone),
    email: readString(contact.email),
    whatsapp: readString(contact.whatsapp, readString(legacyWhatsApp)),
    facebook: readString(contact.facebook),
    instagram: readString(contact.instagram),
    tiktok: readString(contact.tiktok),
    website: readString(contact.website)
  };
};
export const STORE_PAYMENT_METHODS: Array<{ id: StorePaymentMethodConfig['id']; label: string }> = [
  { id: 'cash_on_pickup', label: 'Cash on Pickup' },
  { id: 'touch_n_go_qr', label: "Touch 'n Go QR" },
  { id: 'duitnow_qr', label: 'DuitNow QR' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'stripe', label: 'Stripe' }
];
export const getStorePaymentMethodLabel = (id: StorePaymentMethodConfig['id']) => (
  STORE_PAYMENT_METHODS.find(method => method.id === id)?.label || 'Payment'
);

export const createDefaultStorePaymentMethods = (): StorePaymentMethodConfig[] => (
  STORE_PAYMENT_METHODS.map(method => ({
    id: method.id,
    enabled: method.id === 'stripe',
    qrCodeUrl: '',
    instructions: ''
  }))
);

export const normalizeStorePaymentMethods = (value: unknown): StorePaymentMethodConfig[] => {
  const configured = Array.isArray(value) ? value : [];
  return STORE_PAYMENT_METHODS.map(method => {
    const raw = configured.find(item => item && typeof item === 'object'
      && (item as Record<string, unknown>).id === method.id) as Record<string, unknown> | undefined;
    return {
      id: method.id,
      enabled: raw ? readBoolean(raw.enabled) : method.id === 'stripe',
      qrCodeUrl: readString(raw?.qrCodeUrl),
      instructions: readString(raw?.instructions)
    };
  });
};

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

const readEarliestPickupDays = (value: unknown): 0 | 1 => (
  value === 1 ? 1 : 0
);

const readMaximumAdvanceDays = (value: unknown): 7 | 14 | 30 => (
  value === 7 || value === 30 ? value : 14
);

const toRegionDateCursor = (date: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value])
  );
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
};

const toDateKey = (date: Date) => {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
};

const addRegionDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const getValidPickupDates = (
  store: Pick<WorkspaceStore, 'orderDays' | 'earliestPickupDays' | 'maximumAdvanceDays' | 'unavailableDates'>
    & Partial<Pick<WorkspaceStore, 'country'>>,
  currentDate = new Date()
) => {
  const region = getWorkspaceRegionConfiguration(store);
  const regionToday = toRegionDateCursor(currentDate, region.timeZone);
  const enabledDays = new Set(store.orderDays);
  const unavailableDates = new Set(store.unavailableDates);
  const dayByIndex = new Map(STORE_ORDER_DAYS.map(day => [day.dayIndex, day.id]));
  const dates: string[] = [];

  for (
    let offset = store.earliestPickupDays;
    offset <= store.maximumAdvanceDays;
    offset += 1
  ) {
    const candidate = addRegionDays(regionToday, offset);
    const dateKey = toDateKey(candidate);
    const orderDay = dayByIndex.get(candidate.getUTCDay());
    if (orderDay && enabledDays.has(orderDay) && !unavailableDates.has(dateKey)) {
      dates.push(dateKey);
    }
  }

  return dates;
};

export const formatPickupDateLabel = (
  dateKey: string,
  country?: unknown,
  currentDate = new Date()
) => {
  const region = getWorkspaceRegionConfiguration({ country });
  const regionToday = toRegionDateCursor(currentDate, region.timeZone);
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (!dateKey || Number.isNaN(date.getTime())) return 'Pickup date unavailable';
  const tomorrowKey = toDateKey(addRegionDays(regionToday, 1));
  const prefix = dateKey === toDateKey(regionToday)
    ? 'Today'
    : dateKey === tomorrowKey
      ? 'Tomorrow'
      : '';
  const formatted = new Intl.DateTimeFormat(region.locale, {
    timeZone: region.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date);
  return prefix ? `${prefix} · ${formatted}` : formatted;
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
    contactInformation: '',
    businessWhatsApp: '',
    storeContact: createDefaultStoreContact(),
    businessHours: DEFAULT_STORE_BUSINESS_HOURS,
    pickupEnabled: false,
    deliveryEnabled: false,
    pickupSessions: [],
    pickupLocations: [],
    orderDays: [...DEFAULT_STORE_ORDER_DAYS],
    earliestPickupDays: 0,
    maximumAdvanceDays: 14,
    unavailableDates: [],
    paymentMethods: createDefaultStorePaymentMethods(),
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
  const rawOrderDays = Array.isArray(data.orderDays) ? data.orderDays : null;

  return {
    id,
    workspaceId: readString(data.workspaceId, id),
    slug: toStoreSlug(readString(data.slug, id)),
    name: readString(data.name, 'MiseChef Store'),
    logoUrl: readString(data.logoUrl),
    coverImageUrl: readString(data.coverImageUrl),
    description: readString(data.description),
    contactInformation: readString(data.contactInformation),
    businessWhatsApp: readString(data.businessWhatsApp),
    storeContact: normalizeStoreContact(data.storeContact, readString(data.businessWhatsApp)),
    businessHours: readString(data.businessHours, DEFAULT_STORE_BUSINESS_HOURS),
    pickupEnabled: readBoolean(data.pickupEnabled),
    deliveryEnabled: readBoolean(data.deliveryEnabled),
    pickupSessions: Array.isArray(data.pickupSessions)
      ? [...new Set(data.pickupSessions.filter((session): session is string => typeof session === 'string' && Boolean(session.trim())).map(session => session.trim()))]
      : [],
    pickupLocations: Array.isArray(data.pickupLocations)
      ? data.pickupLocations
        .filter(location => location && typeof location === 'object')
        .map(location => {
          const value = location as Record<string, unknown>;
          return {
            id: readString(value.id),
            name: readString(value.name),
            address: readString(value.address),
            notes: readString(value.notes)
          };
        })
        .filter(location => location.id && location.name && location.address)
      : [],
    orderDays: rawOrderDays
      ? STORE_ORDER_DAYS
        .map(day => day.id)
        .filter(day => rawOrderDays.includes(day))
      : [...DEFAULT_STORE_ORDER_DAYS],
    earliestPickupDays: readEarliestPickupDays(data.earliestPickupDays),
    maximumAdvanceDays: readMaximumAdvanceDays(data.maximumAdvanceDays),
    unavailableDates: Array.isArray(data.unavailableDates)
      ? [...new Set(data.unavailableDates.filter((date): date is string => (
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      )))].sort()
      : [],
    paymentMethods: normalizeStorePaymentMethods(data.paymentMethods),
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
  if (draft.contactInformation.trim().length > 500) return 'Contact information must be 500 characters or fewer.';
  if (!isValidBusinessWhatsApp(draft.businessWhatsApp)) return 'Enter a valid Business WhatsApp number, including country code.';
  if (draft.storeContact.phone.trim().length > 40) return 'Store phone must be 40 characters or fewer.';
  if (draft.storeContact.email.trim().length > 254
    || (draft.storeContact.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.storeContact.email.trim()))) {
    return 'Enter a valid Store email address.';
  }
  if (!isValidBusinessWhatsApp(draft.storeContact.whatsapp)) return 'Enter a valid Store WhatsApp number, including country code.';
  const socialUrls = [
    draft.storeContact.facebook,
    draft.storeContact.instagram,
    draft.storeContact.tiktok,
    draft.storeContact.website
  ];
  if (socialUrls.some(value => value.trim().length > 500)) return 'Store contact links must be 500 characters or fewer.';
  if (socialUrls.some(value => {
    if (!value.trim()) return false;
    try {
      const url = new URL(value.trim());
      return !['http:', 'https:'].includes(url.protocol);
    } catch {
      return true;
    }
  })) return 'Enter complete http:// or https:// links for Store social profiles and website.';
  if (draft.businessHours.trim().length > 300) return 'Business hours must be 300 characters or fewer.';
  if (pickupSessions.length > 20) return 'Use 20 pickup sessions or fewer.';
  if (pickupSessions.some(session => session.length > 80)) {
    return 'Each pickup session must be between 1 and 80 characters.';
  }
  if (new Set(pickupSessions).size !== pickupSessions.length) return 'Pickup sessions must be unique.';
  if (draft.pickupLocations.length > 20) return 'Use 20 pickup locations or fewer.';
  if (draft.pickupLocations.some(location => !location.id || !location.name.trim() || !location.address.trim())) {
    return 'Every pickup location needs a name and address.';
  }
  if (draft.pickupLocations.some(location => location.name.trim().length > 120 || location.address.trim().length > 300 || location.notes.trim().length > 300)) {
    return 'Pickup location details are too long.';
  }
  if (new Set(draft.pickupLocations.map(location => location.id)).size !== draft.pickupLocations.length) return 'Pickup locations must be unique.';
  if (draft.orderDays.length === 0) return 'Choose at least one order day.';
  if (new Set(draft.orderDays).size !== draft.orderDays.length) return 'Order days must be unique.';
  if (draft.orderDays.some(day => !DEFAULT_STORE_ORDER_DAYS.includes(day))) return 'Choose valid order days.';
  if (draft.earliestPickupDays !== 0 && draft.earliestPickupDays !== 1) return 'Choose a valid earliest pickup option.';
  if (![7, 14, 30].includes(draft.maximumAdvanceDays)) return 'Choose a valid advance booking window.';
  if (draft.unavailableDates.length > 60) return 'Use 60 unavailable dates or fewer.';
  if (draft.unavailableDates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) return 'Choose valid unavailable dates.';
  if (new Set(draft.unavailableDates).size !== draft.unavailableDates.length) return 'Unavailable dates must be unique.';
  if (!draft.paymentMethods.some(method => method.enabled)) return 'Enable at least one payment method.';
  if (draft.paymentMethods.length !== STORE_PAYMENT_METHODS.length
    || new Set(draft.paymentMethods.map(method => method.id)).size !== STORE_PAYMENT_METHODS.length
    || draft.paymentMethods.some(method => !STORE_PAYMENT_METHODS.some(candidate => candidate.id === method.id))) {
    return 'Choose valid payment methods.';
  }
  if (draft.paymentMethods.some(method => method.qrCodeUrl.length > 2000 || method.instructions.length > 1000)) {
    return 'Payment instructions are too long.';
  }
  if (draft.paymentMethods.some(method => (
    method.enabled && ['touch_n_go_qr', 'duitnow_qr'].includes(method.id) && !method.qrCodeUrl.trim()
  ))) return 'Upload a merchant QR code before enabling QR payment.';
  if (draft.paymentMethods.some(method => (
    method.enabled && method.id === 'bank_transfer' && !method.instructions.trim()
  ))) return 'Add bank transfer instructions before enabling Bank Transfer.';
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
): StoreOptionGroup => {
  const selectionType = data.selectionType === 'multiple' ? 'multiple' : 'single';
  const required = readBoolean(data.required, true);
  const defaultMinimum = required ? 1 : 0;
  const minimumSelections = Number.isInteger(data.minimumSelections)
    ? Number(data.minimumSelections)
    : defaultMinimum;
  const options = Array.isArray(data.options)
    ? data.options
      .filter(option => option && typeof option === 'object')
      .map((option, index) => {
        const value = option as Record<string, unknown>;
        return {
          id: readString(value.id),
          name: readString(value.name, 'Option'),
          priceAdjustment: Number.isFinite(Number(value.priceAdjustment))
            ? Number(value.priceAdjustment)
            : 0,
          available: readBoolean(value.available, true),
          sortOrder: Number.isInteger(value.sortOrder) ? Number(value.sortOrder) : index
        };
      })
      .filter(option => option.id && option.name)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const maximumSelections = selectionType === 'single'
    ? 1
    : Number.isInteger(data.maximumSelections) ? Number(data.maximumSelections) : Math.max(1, options.length);

  return {
    id,
    storeId: readString(data.storeId),
    workspaceId: readString(data.workspaceId),
    name: readString(data.name, 'Options'),
    selectionType,
    required,
    minimumSelections,
    maximumSelections,
    sortOrder: Number.isInteger(data.sortOrder) ? Number(data.sortOrder) : 0,
    available: readBoolean(data.available, true),
    options,
    createdBy: readString(data.createdBy),
    createdAt: readString(data.createdAt, new Date().toISOString()),
    updatedAt: readString(data.updatedAt, new Date().toISOString())
  };
};

export const validateStoreOptionGroup = (draft: StoreOptionGroupDraft) => {
  if (!draft.name.trim()) return 'Option group name is required.';
  if (draft.name.trim().length > 100) return 'Option group name must be 100 characters or fewer.';
  if (draft.selectionType !== 'single' && draft.selectionType !== 'multiple') return 'Choose a valid selection type.';
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) return 'Option group sort order must be zero or greater.';
  if (!Number.isInteger(draft.minimumSelections) || draft.minimumSelections < 0) return 'Minimum selection must be zero or greater.';
  if (!Number.isInteger(draft.maximumSelections) || draft.maximumSelections < 1) return 'Maximum selection must be at least one.';
  if (draft.selectionType === 'single' && draft.maximumSelections !== 1) return 'Single Select groups must have a maximum selection of one.';
  if (draft.selectionType === 'single' && draft.minimumSelections > 1) return 'Single Select groups cannot require more than one selection.';
  if (draft.required && draft.minimumSelections < 1) return 'Required groups must have a minimum selection of at least one.';
  if (draft.minimumSelections > draft.maximumSelections) return 'Minimum selection cannot exceed maximum selection.';
  if (draft.options.length === 0) return 'Add at least one option.';
  if (draft.options.length > 20) return 'Use 20 options or fewer in one group.';
  if (draft.maximumSelections > draft.options.length) return 'Maximum selection cannot exceed the number of options.';
  if (draft.options.some(option => !option.name.trim())) return 'Every option needs a name.';
  if (draft.options.some(option => option.name.trim().length > 100)) return 'Option names must be 100 characters or fewer.';
  if (draft.options.some(option => !Number.isFinite(option.priceAdjustment))) return 'Every price adjustment must be valid.';
  if (draft.options.some(option => Math.abs(option.priceAdjustment) > 1_000_000)) return 'Price adjustments must be 1,000,000 or less.';
  if (draft.options.some(option => !Number.isInteger(option.sortOrder) || option.sortOrder < 0)) return 'Option sort order must be zero or greater.';
  if (new Set(draft.options.map(option => option.id)).size !== draft.options.length) return 'Every option must be unique.';
  return '';
};

export const validateStoreOrder = (
  draft: StoreOrderDraft,
  store: Pick<WorkspaceStore, 'pickupEnabled' | 'pickupSessions' | 'pickupLocations' | 'orderDays' | 'earliestPickupDays' | 'maximumAdvanceDays' | 'unavailableDates' | 'country'>,
  currentDate = new Date()
) => {
  if (!store.pickupEnabled) return 'Pickup ordering is not available.';
  const region = getWorkspaceRegionConfiguration(store);
  if (!draft.customerName.trim()) return 'Name is required.';
  if (draft.customerName.trim().length > 120) return 'Name must be 120 characters or fewer.';
  if (!draft.phone.trim() || draft.phone.replace(/\D/g, '').length < 6) return 'Enter a valid phone number.';
  if (draft.phone.trim().length > 40) return 'Phone number must be 40 characters or fewer.';
  if (!draft.pickupDate) return 'Pickup date is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.pickupDate)) return 'Choose a valid pickup date.';
  if (!getValidPickupDates(store, currentDate).includes(draft.pickupDate)) return 'Choose an available pickup date.';
  if (!store.pickupSessions.includes(draft.pickupSession)) return 'Choose a valid pickup session.';
  if (!store.pickupLocations.some(location => location.id === draft.pickupLocationId)) return 'Choose a valid pickup location.';
  if (draft.notes.trim().length > 500) return 'Notes must be 500 characters or fewer.';
  if (draft.selections.length === 0) return 'Your cart is empty.';
  if (draft.selections.some(selection => !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 20)) {
    return 'Each product quantity must be between 1 and 20.';
  }
  return '';
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateStoreOptionAdjustedPrice = (
  basePrice: number,
  priceAdjustments: number[]
) => roundMoney(Math.max(
  0,
  basePrice + priceAdjustments.reduce((sum, adjustment) => sum + adjustment, 0)
));

export const getStoreOptionSelectionLimits = (
  group: Pick<StoreOptionGroup, 'selectionType' | 'required' | 'minimumSelections' | 'maximumSelections'>
) => ({
  minimum: group.required ? Math.max(1, group.minimumSelections) : group.minimumSelections,
  maximum: group.selectionType === 'single' ? 1 : group.maximumSelections
});

export const validateStoreProductOptionSelections = (
  product: StoreProduct,
  optionGroups: StoreOptionGroup[],
  selectedOptions: CartSelection['selectedOptions']
) => {
  for (const groupId of product.optionGroupIds) {
    const group = optionGroups.find(candidate => candidate.id === groupId);
    if (!group) return `Options for ${product.name} are no longer available.`;
    const choices = selectedOptions.filter(choice => choice.groupId === groupId);
    if (!group.available) {
      if (choices.length > 0) return `${group.name} is no longer available.`;
      continue;
    }
    const { minimum, maximum } = getStoreOptionSelectionLimits(group);
    if (choices.length < minimum) {
      return `Choose at least ${minimum} ${group.name} option${minimum === 1 ? '' : 's'} for ${product.name}.`;
    }
    if (choices.length > maximum) {
      return `Choose no more than ${maximum} ${group.name} option${maximum === 1 ? '' : 's'} for ${product.name}.`;
    }
    if (new Set(choices.map(choice => choice.optionId)).size !== choices.length) {
      return `Choose each ${group.name} option only once.`;
    }
    if (choices.some(choice => !group.options.some(option => (
      option.id === choice.optionId && option.available
    )))) {
      return `Choose an available ${group.name} option for ${product.name}.`;
    }
  }
  if (selectedOptions.some(choice => !product.optionGroupIds.includes(choice.groupId))) {
    return `An option for ${product.name} is no longer available.`;
  }
  return '';
};

export const buildStoreOrderItems = (
  selections: CartSelection[],
  products: StoreProduct[],
  optionGroups: StoreOptionGroup[]
): StoreOrderItem[] => selections.map(selection => {
  const product = products.find(candidate => candidate.id === selection.productId && candidate.available);
  if (!product) throw new Error('A product in your cart is no longer available.');
  const selectionError = validateStoreProductOptionSelections(product, optionGroups, selection.selectedOptions);
  if (selectionError) throw new Error(selectionError);

  const selectedOptions = product.optionGroupIds.flatMap(groupId => {
    const group = optionGroups.find(candidate => candidate.id === groupId);
    if (!group || !group.available) return [];
    const choices = selection.selectedOptions.filter(choice => choice.groupId === groupId);
    return choices.map(choice => {
      const option = group.options.find(candidate => candidate.id === choice.optionId)!;

      return {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceAdjustment: option.priceAdjustment
      };
    });
  });

  const unitPrice = calculateStoreOptionAdjustedPrice(
    product.price,
    selectedOptions.map(option => option.priceAdjustment)
  );

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
