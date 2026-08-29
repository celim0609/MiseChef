import { randomBytes } from 'node:crypto';

export const PAYMENT_STATUS = Object.freeze({
  pending: 'pending',
  processing: 'processing',
  paid: 'paid',
  pendingVerification: 'pending_verification',
  failed: 'failed',
  cancelled: 'cancelled',
  rejected: 'rejected'
});
export const PAYMENT_REFUND_STATUS = Object.freeze({
  none: 'none',
  pending: 'pending',
  partial: 'partial',
  refunded: 'refunded',
  failed: 'failed'
});

const REGIONS = Object.freeze({
  MY: { currency: 'MYR', timeZone: 'Asia/Kuala_Lumpur' },
  SG: { currency: 'SGD', timeZone: 'Asia/Singapore' }
});
const ORDER_DAY_BY_INDEX = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];
const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';
const ORDER_NUMBER_ATTEMPTS = 32;

export const readString = value => typeof value === 'string' ? value.trim() : '';

export const STORE_PAYMENT_METHODS = Object.freeze({
  cash_on_pickup: { name: 'Cash on Pickup', provider: 'manual', mode: 'manual', receiptAllowed: false },
  touch_n_go_qr: { name: 'Touch ’n Go eWallet', provider: 'manual', mode: 'manual', receiptAllowed: true },
  duitnow_qr: { name: 'DuitNow QR', provider: 'manual', mode: 'manual', receiptAllowed: true },
  bank_transfer: { name: 'Bank Transfer', provider: 'manual', mode: 'manual', receiptAllowed: true },
  stripe: { name: 'Stripe', provider: 'stripe', mode: 'single_merchant', receiptAllowed: false }
});

export const getEnabledStorePaymentMethod = (store, methodId) => {
  const id = readString(methodId) || 'stripe';
  const definition = STORE_PAYMENT_METHODS[id];
  if (!definition) throw new Error('Choose a valid payment method.');
  if (id === 'cash_on_pickup') {
    throw new Error('Cash on Pickup is temporarily unavailable.');
  }
  if (id === 'touch_n_go_qr' && readString(store.country) !== 'MY') {
    throw new Error('Touch ’n Go eWallet is available only for Malaysia Stores.');
  }
  const rawMethods = Array.isArray(store.paymentMethods) ? store.paymentMethods : [];
  const configured = rawMethods.find(method => readString(method?.id) === id);
  const enabled = configured ? configured.enabled === true : id === 'stripe';
  if (!enabled) throw new Error('This payment method is no longer available.');
  const qrCodeUrl = readString(configured?.qrCodeUrl);
  const instructions = readString(configured?.instructions);
  if (['touch_n_go_qr', 'duitnow_qr'].includes(id) && !qrCodeUrl) {
    throw new Error('This QR payment method is not configured correctly.');
  }
  if (id === 'bank_transfer' && !instructions) {
    throw new Error('Bank Transfer is not configured correctly.');
  }
  return { id, ...definition, qrCodeUrl, instructions };
};

const readNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;

const toRegionDateCursor = (date, timeZone) => {
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

const toDateKey = date => {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const getMalaysiaBusinessDateKey = (date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: MALAYSIA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}`;
};

export const createOrderNumber = (date = new Date(), random = randomBytes(4)) => {
  const businessDate = getMalaysiaBusinessDateKey(date);
  const datePart = businessDate.slice(4);
  const randomPart = Array.from(random)
    .slice(0, 4)
    .map(byte => ORDER_NUMBER_ALPHABET[byte % ORDER_NUMBER_ALPHABET.length])
    .join('');
  return `MC-${datePart}-${randomPart}`;
};

export const getPickupCodeFromOrderNumber = orderNumber => {
  const match = /^MC-\d{4}-([A-HJ-NP-Z2-9]{4})$/.exec(readString(orderNumber));
  return match?.[1] || '';
};

export const createAvailableOrderReference = async ({
  date = new Date(),
  randomBytesFactory = () => randomBytes(4),
  exists,
  maxAttempts = ORDER_NUMBER_ATTEMPTS
}) => {
  if (typeof exists !== 'function') throw new Error('Order reference availability check is required.');
  const businessDateKey = getMalaysiaBusinessDateKey(date);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const orderNumber = createOrderNumber(date, randomBytesFactory());
    const pickupCode = getPickupCodeFromOrderNumber(orderNumber);
    if (!await exists({ orderNumber, pickupCode, businessDateKey })) {
      return {
        orderNumber,
        pickupCode,
        businessDateKey
      };
    }
  }
  throw new Error('A customer order reference could not be allocated. Please try again.');
};

export const getValidPickupDates = (store, currentDate = new Date()) => {
  const region = REGIONS[readString(store.country)] || REGIONS.MY;
  const today = toRegionDateCursor(currentDate, region.timeZone);
  const enabledDays = new Set(Array.isArray(store.orderDays) ? store.orderDays : ORDER_DAY_BY_INDEX);
  const blockedDates = new Set(Array.isArray(store.unavailableDates) ? store.unavailableDates : []);
  const earliest = store.earliestPickupDays === 1 ? 1 : 0;
  const maximum = [7, 14, 30].includes(store.maximumAdvanceDays) ? store.maximumAdvanceDays : 14;
  const dates = [];

  for (let offset = earliest; offset <= maximum; offset += 1) {
    const candidate = addDays(today, offset);
    const dateKey = toDateKey(candidate);
    if (enabledDays.has(ORDER_DAY_BY_INDEX[candidate.getUTCDay()]) && !blockedDates.has(dateKey)) {
      dates.push(dateKey);
    }
  }
  return dates;
};

const validateDraft = (store, draft, currentDate) => {
  if (store.pickupEnabled !== true) throw new Error('Pickup ordering is not available.');
  if (!readString(draft.customerName)) throw new Error('Name is required.');
  if (readString(draft.customerName).length > 120) throw new Error('Name must be 120 characters or fewer.');
  const phone = readString(draft.phone);
  if (phone.replace(/\D/g, '').length < 6 || phone.length > 40) throw new Error('Enter a valid phone number.');
  if (!getValidPickupDates(store, currentDate).includes(readString(draft.pickupDate))) {
    throw new Error('Choose an available pickup date.');
  }
  if (!Array.isArray(store.pickupSessions) || !store.pickupSessions.includes(readString(draft.pickupSession))) {
    throw new Error('Choose a valid pickup session.');
  }
  if (!Array.isArray(store.pickupLocations)
    || !store.pickupLocations.some(location => readString(location.id) === readString(draft.pickupLocationId))) {
    throw new Error('Choose a valid pickup location.');
  }
  if (readString(draft.notes).length > 500) throw new Error('Notes must be 500 characters or fewer.');
  if (!Array.isArray(draft.selections) || draft.selections.length === 0) throw new Error('Your cart is empty.');
  if (draft.selections.length > 50) throw new Error('Your cart contains too many items.');
  if (draft.selections.some(selection => (
    !Number.isInteger(selection?.quantity) || selection.quantity < 1 || selection.quantity > 20
  ))) {
    throw new Error('Each product quantity must be between 1 and 20.');
  }
};

const buildSetOrderItem = (selection, sets, products) => {
  const set = sets.find(candidate => candidate.id === readString(selection.setId) && candidate.available === true);
  if (!set) throw new Error('A set in your cart is no longer available.');
  const groups = Array.isArray(set.groups) ? [...set.groups].sort((a, b) => readNumber(a.sortOrder) - readNumber(b.sortOrder)) : [];
  const choices = Array.isArray(selection.selectedSetItems) ? selection.selectedSetItems : [];
  const selectedGroups = [];
  for (const group of groups) {
    const groupId = readString(group.id);
    const groupName = readString(group.name) || 'Selection';
    const selectionCount = Number.isInteger(group.selectionCount) && group.selectionCount > 0 ? group.selectionCount : 1;
    const required = typeof group.required === 'boolean' ? group.required : true;
    const groupChoices = choices.filter(choice => readString(choice.groupId) === groupId);
    if ((required && groupChoices.length !== selectionCount) || (!required && groupChoices.length > selectionCount)) {
      throw new Error(required
        ? `Choose ${selectionCount} ${groupName} option${selectionCount === 1 ? '' : 's'} for ${readString(set.name) || 'this set'}.`
        : `Choose up to ${selectionCount} ${groupName} option${selectionCount === 1 ? '' : 's'} for ${readString(set.name) || 'this set'}.`);
    }
    if (new Set(groupChoices.map(choice => readString(choice.productId))).size !== groupChoices.length) {
      throw new Error(`Choose each ${groupName} product only once.`);
    }
    const options = Array.isArray(group.options) ? group.options : [];
    for (const choice of groupChoices) {
      const productId = readString(choice.productId);
      const option = options.find(candidate => readString(candidate.productId) === productId);
      const product = products.find(candidate => candidate.id === productId && candidate.available === true);
      if (!option || !product) throw new Error(`Choose an available ${groupName} option for ${readString(set.name) || 'this set'}.`);
      selectedGroups.push({
        groupId,
        groupName,
        productId: product.id,
        productName: readString(product.name),
        standalonePrice: roundMoney(Math.max(0, readNumber(product.price))),
        ...(Number.isFinite(product.estimatedCost) && product.estimatedCost >= 0
          ? { estimatedCost: roundMoney(product.estimatedCost) }
          : {}),
        priceAdjustment: roundMoney(Math.max(0, readNumber(option.priceAdjustment)))
      });
    }
  }
  if (choices.some(choice => !groups.some(group => readString(group.id) === readString(choice.groupId)))) {
    throw new Error(`A selection for ${readString(set.name) || 'this set'} is no longer available.`);
  }
  const basePrice = roundMoney(Math.max(0, readNumber(set.price)));
  const upgradeTotal = roundMoney(selectedGroups.reduce((sum, item) => sum + item.priceAdjustment, 0));
  const unitPrice = roundMoney(basePrice + upgradeTotal);
  const regularValue = roundMoney(selectedGroups.reduce((sum, item) => sum + item.standalonePrice, 0));
  return {
    itemType: 'set',
    productId: set.id,
    productName: readString(set.name),
    photoUrl: readString(set.photoUrl),
    quantity: selection.quantity,
    basePrice,
    unitPrice,
    lineTotal: roundMoney(unitPrice * selection.quantity),
    selectedOptions: [],
    setSnapshot: {
      setId: set.id,
      setName: readString(set.name),
      category: readString(set.category),
      baseSetPrice: basePrice,
      regularValue,
      customerSaving: roundMoney(Math.max(0, regularValue - unitPrice)),
      selectedGroups
    }
  };
};

export const buildOrderItems = (selections, products, optionGroups, sets = []) => selections.map(selection => {
  if (readString(selection.setId)) return buildSetOrderItem(selection, sets, products);
  const product = products.find(candidate => (
    candidate.id === readString(selection.productId) && candidate.available === true
  ));
  if (!product) throw new Error('A product in your cart is no longer available.');

  const productGroupIds = Array.isArray(product.optionGroupIds) ? product.optionGroupIds : [];
  const choices = Array.isArray(selection.selectedOptions) ? selection.selectedOptions : [];
  const selectedOptions = productGroupIds.flatMap(groupId => {
    const group = optionGroups.find(candidate => candidate.id === groupId);
    if (!group) throw new Error(`Options for ${readString(product.name) || 'this product'} are no longer available.`);
    const groupChoices = choices.filter(choice => readString(choice.groupId) === groupId);
    if (group.available === false) {
      if (groupChoices.length > 0) {
        throw new Error(`${readString(group.name) || 'This option group'} is no longer available.`);
      }
      return [];
    }
    const selectionType = group.selectionType === 'multiple' ? 'multiple' : 'single';
    const required = typeof group.required === 'boolean' ? group.required : true;
    const configuredMinimum = Number.isInteger(group.minimumSelections)
      ? group.minimumSelections
      : required ? 1 : 0;
    const minimumSelections = required ? Math.max(1, configuredMinimum) : 0;
    const configuredMaximum = Number.isInteger(group.maximumSelections)
      ? group.maximumSelections
      : Math.max(1, Array.isArray(group.options) ? group.options.length : 1);
    const maximumSelections = selectionType === 'single' ? 1 : configuredMaximum;
    if (groupChoices.length < minimumSelections) {
      throw new Error(`Choose at least ${minimumSelections} ${readString(group.name) || 'option'} option${minimumSelections === 1 ? '' : 's'} for ${readString(product.name) || 'this product'}.`);
    }
    if (groupChoices.length > maximumSelections) {
      throw new Error(`Choose no more than ${maximumSelections} ${readString(group.name) || 'option'} option${maximumSelections === 1 ? '' : 's'} for ${readString(product.name) || 'this product'}.`);
    }
    if (new Set(groupChoices.map(choice => readString(choice.optionId))).size !== groupChoices.length) {
      throw new Error(`Choose each ${readString(group.name) || 'option'} option only once.`);
    }
    return groupChoices.map(choice => {
      const option = (Array.isArray(group.options) ? group.options : [])
        .find(candidate => candidate.id === readString(choice.optionId));
      if (!option || option.available === false) {
        throw new Error(`Choose an available ${readString(group.name) || 'product'} option.`);
      }
      return {
        groupId: group.id,
        groupName: readString(group.name),
        optionId: option.id,
        optionName: readString(option.name),
        priceAdjustment: readNumber(option.priceAdjustment)
      };
    });
  });

  if (choices.some(choice => !productGroupIds.includes(readString(choice.groupId)))) {
    throw new Error(`An option for ${readString(product.name) || 'this product'} is no longer available.`);
  }

  const basePrice = roundMoney(Math.max(0, readNumber(product.price)));
  const unitPrice = roundMoney(Math.max(
    0,
    basePrice + selectedOptions.reduce((sum, option) => sum + option.priceAdjustment, 0)
  ));
  return {
    itemType: 'product',
    productId: product.id,
    productName: readString(product.name),
    photoUrl: readString(product.photoUrl),
    quantity: selection.quantity,
    basePrice,
    unitPrice,
    lineTotal: roundMoney(unitPrice * selection.quantity),
    selectedOptions
  };
});

export const buildPendingOrder = ({
  id,
  orderNumber,
  pickupCode = getPickupCodeFromOrderNumber(orderNumber),
  store,
  products,
  optionGroups,
  sets = [],
  paymentProvider,
  paymentProviderMode,
  paymentMethod,
  groupOrder = null,
  customerUid = '',
  draft,
  now = new Date()
}) => {
  validateDraft(store, draft, now);
  const region = REGIONS[readString(store.country)];
  if (!region || readString(store.currency) !== region.currency) {
    throw new Error('This Store currency is not supported.');
  }
  if (!readString(paymentProvider) || !readString(paymentProviderMode)) {
    throw new Error('This Store payment provider is not configured.');
  }
  const resolvedPaymentMethod = paymentMethod || {
    id: 'stripe',
    name: 'Secure online payment'
  };
  const items = buildOrderItems(draft.selections, products, optionGroups, sets);
  const pickupLocation = store.pickupLocations.find(
    location => readString(location.id) === readString(draft.pickupLocationId)
  );
  const total = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const amountMinor = Math.round(total * 100);
  if (amountMinor < 1) throw new Error('Order total must be greater than zero.');
  const createdAt = now.toISOString();

  return {
    id,
    orderNumber,
    pickupCode: readString(pickupCode),
    storeId: readString(store.id) || readString(store.workspaceId),
    workspaceId: readString(store.workspaceId) || readString(store.id),
    orderSource: 'online',
    ...(readString(customerUid) ? { customerUid: readString(customerUid) } : {}),
    ...(groupOrder ? {
      groupOrder: {
        id: readString(groupOrder.id),
        shareCode: readString(groupOrder.shareCode),
        name: readString(groupOrder.name),
        hostId: readString(groupOrder.hostId),
        hostName: readString(groupOrder.hostName),
        rewardPercent: readNumber(groupOrder.rewardPercent)
      }
    } : {}),
    storeName: readString(store.name),
    currency: region.currency,
    paymentMethodId: readString(resolvedPaymentMethod.id),
    paymentMethodName: readString(resolvedPaymentMethod.name) || 'Secure online payment',
    customerName: readString(draft.customerName),
    phone: readString(draft.phone),
    pickupDate: readString(draft.pickupDate),
    pickupSession: readString(draft.pickupSession),
    pickupLocationId: readString(pickupLocation.id),
    pickupLocationName: readString(pickupLocation.name),
    pickupLocationAddress: readString(pickupLocation.address),
    pickupLocationNotes: readString(pickupLocation.notes),
    notes: readString(draft.notes),
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total,
    status: 'Awaiting Payment',
    fulfilmentStatus: 'New',
    fulfilmentUpdatedAt: null,
    fulfilmentUpdatedBy: '',
    payment: {
      provider: readString(paymentProvider),
      providerMode: readString(paymentProviderMode),
      status: PAYMENT_STATUS.pending,
      amountMinor,
      currency: region.currency,
      providerPaymentId: '',
      providerTransactionId: '',
      providerPaymentMethod: '',
      failureCode: '',
      refundStatus: PAYMENT_REFUND_STATUS.none,
      refundedAmountMinor: 0,
      refundFailureCode: '',
      receiptPath: '',
      receiptFileName: '',
      receiptUploadedAt: null,
      reviewedAt: null,
      reviewedBy: '',
      createdAt,
      updatedAt: createdAt
    },
    createdAt,
    updatedAt: createdAt
  };
};

export const toPublicOrderResult = order => ({
  orderNumber: readString(order.orderNumber),
  pickupCode: readString(order.pickupCode),
  storeName: readString(order.storeName),
  currency: readString(order.currency),
  paymentMethodName: readString(order.paymentMethodName) || 'Secure online payment',
  pickupDate: readString(order.pickupDate),
  pickupSession: readString(order.pickupSession),
  pickupLocationName: readString(order.pickupLocationName),
  total: readNumber(order.total),
  status: readString(order.status),
  paymentStatus: readString(order.payment?.status)
});
