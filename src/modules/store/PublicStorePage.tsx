import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Compass,
  CreditCard,
  Landmark,
  MapPin,
  MessageCircle,
  Minus,
  PackageOpen,
  Plus,
  QrCode,
  ShoppingCart,
  Store as StoreIcon,
  Truck,
  X
} from 'lucide-react';
import { formatRegionCurrency, getRegionConfiguration } from '../../regions';
import StorePaymentCheckout from './StorePaymentCheckout';
import { customerContactService, storePaymentService, storeService } from './services';
import { storeDeliveryService, type DeliveryQuote } from './services/deliveryService';
import { getSelectedPlace, searchMalaysiaPlaces, type PlaceSuggestion } from './services/googlePlaces';
import {
  calculateStoreOptionAdjustedPrice,
  formatStoreOptionSelectionRequirement,
  formatPickupDateLabel,
  getStoreOptionSelectionLimits,
  getStorePaymentMethodLabel,
  getValidPickupDates,
  storePaymentMethodRequiresReceipt,
  validateStoreProductOptionSelections
} from './storeModel';
import {
  calculateStoreSetAnalysis,
  getDefaultStoreSetSelections,
  getStoreSetUnavailableReason,
  validateStoreSetSelections
} from './storeSetModel';
import { getBusinessWhatsAppUrl } from './selling';
import { getCustomerOrderConfirmationCopy } from './customerOrderConfirmation';
import type {
  CartSelection,
  PublicStoreData,
  PublicStoreOrderResult,
  PublicGroupOrder,
  PublicOrderGroupContext,
  StorePaymentProviderId,
  StorePaymentMethodId,
  StorePaymentSession,
  StoreProduct,
  StoreSet
} from './types';

interface CartLine extends CartSelection {
  key: string;
}

type CheckoutRecovery = {
  slug: string;
  provider: StorePaymentProviderId;
  paymentSessionId: string;
  checkoutAccessToken: string;
  session?: StorePaymentSession;
};

const CHECKOUT_RECOVERY_KEY_PREFIX = 'misechef_checkout_recovery_v1:';
const GROUP_DRAFT_KEY_PREFIX = 'misechef_group_checkout_draft_v1:';
const STORE_DRAFT_KEY_PREFIX = 'misechef_store_checkout_draft_v1:';

const readCheckoutRecovery = (key: string, slug: string): CheckoutRecovery | null => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || '') as Partial<CheckoutRecovery>;
    if (parsed.slug !== slug
      || typeof parsed.provider !== 'string'
      || typeof parsed.paymentSessionId !== 'string'
      || typeof parsed.checkoutAccessToken !== 'string'
      || !parsed.paymentSessionId
      || !parsed.checkoutAccessToken) return null;
    return parsed as CheckoutRecovery;
  } catch {
    return null;
  }
};

const GroupPickupContext = ({ group, country }: {
  group: Pick<PublicOrderGroupContext, 'name' | 'hostName' | 'pickupDate' | 'pickupSession' | 'pickupLocationName'>;
  country: PublicStoreData['store']['country'];
}) => (
  <section className="rounded-2xl border border-secondary/25 bg-secondary/10 p-4">
    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">Group Pickup</p>
    <h4 className="mt-2 font-display text-xl font-bold text-primary">{group.name}</h4>
    {group.hostName && <p className="mt-1 font-sans text-xs font-extrabold text-primary">Hosted by {group.hostName}</p>}
    <p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
      {formatPickupDateLabel(group.pickupDate, country)}<br />
      {group.pickupSession}<br />
      {group.pickupLocationName}
    </p>
    <p className="mt-3 font-sans text-xs font-extrabold leading-relaxed text-primary">This is a Group Order.<br />Pickup is coordinated with your Group Host.</p>
  </section>
);

const selectionKey = (productId: string, selectedOptions: CartSelection['selectedOptions']) => (
  `${productId}:${selectedOptions.map(option => `${option.groupId}=${option.optionId}`).sort().join('|')}`
);

const getPaymentActionLabel = (methodId: StorePaymentMethodId) => {
  if (methodId === 'stripe' || methodId === 'curlec') return 'Continue to Secure Payment';
  if (methodId === 'cash_on_pickup') return 'Place Order';
  return 'Continue to Payment';
};

function PaymentMethodIcon({ methodId }: { methodId: StorePaymentMethodId }) {
  const iconClassName = 'h-5 w-5';
  if (methodId === 'cash_on_pickup') return <Banknote className={iconClassName} aria-hidden="true" />;
  if (methodId === 'stripe' || methodId === 'curlec') return <CreditCard className={iconClassName} aria-hidden="true" />;
  if (methodId === 'bank_transfer') return <Landmark className={iconClassName} aria-hidden="true" />;
  return <QrCode className={iconClassName} aria-hidden="true" />;
}

export default function PublicStorePage({ slug, groupOrder, currentUser }: { slug: string; groupOrder?: PublicGroupOrder; currentUser?: User | null }) {
  const catalogueTopRef = useRef<HTMLElement | null>(null);
  const catalogueEndRef = useRef<HTMLDivElement | null>(null);
  const mainSectionRef = useRef<HTMLElement | null>(null);
  const setsSectionRef = useRef<HTMLElement | null>(null);
  const drinksSectionRef = useRef<HTMLElement | null>(null);
  const checkoutSectionRef = useRef<HTMLElement | null>(null);
  const paymentStageRef = useRef<HTMLElement | null>(null);
  const confirmationRef = useRef<HTMLElement | null>(null);
  const restoredStoreDraftSlugRef = useRef('');
  const [data, setData] = useState<PublicStoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [configuringProduct, setConfiguringProduct] = useState<StoreProduct | null>(null);
  const [configuringSet, setConfiguringSet] = useState<StoreSet | null>(null);
  const [configuredSetItems, setConfiguredSetItems] = useState<Record<string, string[]>>({});
  const [configuredOptions, setConfiguredOptions] = useState<Record<string, string[]>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupSession, setPickupSession] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [fulfilmentMethod, setFulfilmentMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySession, setDeliverySession] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'preorder' | 'instant'>('preorder');
  const [deliveryAddressQuery, setDeliveryAddressQuery] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState('');
  const [deliveryLongitude, setDeliveryLongitude] = useState('');
  const [deliveryUnit, setDeliveryUnit] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliverySuggestions, setDeliverySuggestions] = useState<PlaceSuggestion[]>([]);
  const [deliveryAddressError, setDeliveryAddressError] = useState('');
  const [isSearchingDeliveryAddress, setIsSearchingDeliveryAddress] = useState(false);
  const [isSelectingDeliveryAddress, setIsSelectingDeliveryAddress] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false);
  const [notes, setNotes] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<StorePaymentMethodId>('stripe');
  const [checkoutError, setCheckoutError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentSession, setPaymentSession] = useState<StorePaymentSession | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PublicStoreOrderResult | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCatalogueCartVisible, setIsCatalogueCartVisible] = useState(true);
  const [activeCatalogueSection, setActiveCatalogueSection] = useState<'all' | 'main' | 'sets' | 'drinks'>('all');
  const [isHostInfoOpen, setIsHostInfoOpen] = useState(false);
  const [isAccountSuggestionDismissed, setIsAccountSuggestionDismissed] = useState(false);
  const paymentStageKey = paymentSession?.paymentSessionId || '';
  const confirmationKey = placedOrder ? `${placedOrder.orderNumber}:${placedOrder.paymentStatus}` : '';
  const checkoutRecoveryKey = `${CHECKOUT_RECOVERY_KEY_PREFIX}${window.location.pathname}`;
  const storeDraftKey = `${STORE_DRAFT_KEY_PREFIX}${slug}`;
  const deliveryPlacesSessionRef = useRef(crypto.randomUUID());
  const deliveryQuoteRequestRef = useRef(0);

const deliveryAddressForQuote = deliveryAddress;
  const deliveryRemarks = [
    deliveryUnit.trim() ? `Unit / Floor: ${deliveryUnit.trim()}` : '',
    deliveryInstructions.trim() ? `Instructions: ${deliveryInstructions.trim()}` : ''
  ].filter(Boolean).join('\n');

  useEffect(() => {
    if (!paymentStageKey) return;
    const frame = window.requestAnimationFrame(() => {
      paymentStageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [paymentStageKey]);

  useEffect(() => {
    if (!confirmationKey) return;
    const frame = window.requestAnimationFrame(() => {
      confirmationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [confirmationKey]);

  useEffect(() => {
    if (deliveryAddressQuery.trim().length < 3 || (deliveryAddress && deliveryAddressQuery === deliveryAddress)) {
      setDeliverySuggestions([]);
      setIsSearchingDeliveryAddress(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearchingDeliveryAddress(true);
      setDeliveryAddressError('');
      searchMalaysiaPlaces(deliveryAddressQuery, deliveryPlacesSessionRef.current, controller.signal)
        .then(setDeliverySuggestions)
        .catch(error => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setDeliverySuggestions([]);
          setDeliveryAddressError(error instanceof Error ? error.message : 'Address search is temporarily unavailable.');
        })
        .finally(() => setIsSearchingDeliveryAddress(false));
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [deliveryAddress, deliveryAddressQuery]);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setHasError(false);

    storeService.getPublicStore(slug)
      .then(storeData => {
        if (isCancelled) return;
        setData(storeData);
        setPickupDate(groupOrder?.pickupDate || (storeData ? getValidPickupDates(storeData.store)[0] || '' : ''));
        setPickupSession(groupOrder?.pickupSession || storeData?.store.pickupSessions[0] || '');
        setPickupLocationId(groupOrder?.pickupLocationId || storeData?.store.pickupLocations[0]?.id || '');
        const preOrder = storeData?.store.delivery?.fulfilment.preOrder;
        setDeliveryDate(storeData && preOrder ? getValidPickupDates({ ...storeData.store, orderDays: preOrder.orderDays, earliestPickupDays: preOrder.earliestDays, maximumAdvanceDays: preOrder.maximumAdvanceDays, unavailableDates: preOrder.unavailableDates })[0] || '' : '');
        setDeliverySession(preOrder?.sessions[0] || '');
        setPaymentMethodId(storeData?.store.paymentMethods.find(
          method => method.enabled && method.id !== 'cash_on_pickup'
        )?.id || 'stripe');
      })
      .catch(() => {
        if (!isCancelled) {
          setData(null);
          setHasError(true);
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [groupOrder?.id, slug]);

  useEffect(() => {
    if (!currentUser) {
      setCustomerName('');
      setPhone('');
      setCustomerEmail('');
      return;
    }

    let cancelled = false;
    customerContactService.load(currentUser.uid).then(contact => {
      if (cancelled) return;
      setCustomerName(current => current || contact.name || currentUser.displayName?.trim() || '');
      setPhone(current => current || contact.phone);
      setCustomerEmail(current => current || contact.email || currentUser.email?.trim() || '');
    }).catch(() => {
      if (cancelled) return;
      setCustomerName(current => current || currentUser.displayName?.trim() || '');
      setCustomerEmail(current => current || currentUser.email?.trim() || '');
    });
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!data || !groupOrder?.id) return;
    const key = `${GROUP_DRAFT_KEY_PREFIX}${groupOrder.id}`;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || '') as {
        groupId?: string;
        cart?: CartLine[];
        customerName?: string;
        phone?: string;
        customerEmail?: string;
        notes?: string;
        paymentMethodId?: StorePaymentMethodId;
      };
      sessionStorage.removeItem(key);
      if (parsed.groupId !== groupOrder.id || !Array.isArray(parsed.cart)) return;
      setCart(parsed.cart.filter(line => line && typeof line.key === 'string' && typeof line.productId === 'string'));
      setCustomerName(current => typeof parsed.customerName === 'string' && parsed.customerName ? parsed.customerName : current);
      setPhone(current => typeof parsed.phone === 'string' && parsed.phone ? parsed.phone : current);
      setCustomerEmail(current => typeof parsed.customerEmail === 'string' && parsed.customerEmail ? parsed.customerEmail : current);
      setNotes(typeof parsed.notes === 'string' ? parsed.notes : '');
      if (parsed.paymentMethodId && data.store.paymentMethods.some(method => method.enabled && method.id === parsed.paymentMethodId)) {
        setPaymentMethodId(parsed.paymentMethodId);
      }
    } catch {
      sessionStorage.removeItem(key);
    }
  }, [data, groupOrder?.id]);

  useEffect(() => {
    if (!data || groupOrder) return;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storeDraftKey) || '') as {
        slug?: string;
        cart?: CartLine[];
        customerName?: string;
        phone?: string;
        customerEmail?: string;
        notes?: string;
        paymentMethodId?: StorePaymentMethodId;
      };
      if (parsed.slug === slug && Array.isArray(parsed.cart)) {
        setCart(parsed.cart.filter(line => line && typeof line.key === 'string' && typeof line.productId === 'string'));
        setCustomerName(current => typeof parsed.customerName === 'string' && parsed.customerName ? parsed.customerName : current);
        setPhone(current => typeof parsed.phone === 'string' && parsed.phone ? parsed.phone : current);
        setCustomerEmail(current => typeof parsed.customerEmail === 'string' && parsed.customerEmail ? parsed.customerEmail : current);
        setNotes(typeof parsed.notes === 'string' ? parsed.notes : '');
        if (parsed.paymentMethodId && data.store.paymentMethods.some(method => method.enabled && method.id === parsed.paymentMethodId)) {
          setPaymentMethodId(parsed.paymentMethodId);
        }
      }
    } catch {
      sessionStorage.removeItem(storeDraftKey);
    } finally {
      restoredStoreDraftSlugRef.current = slug;
    }
  }, [data, groupOrder, slug, storeDraftKey]);

  useEffect(() => {
    if (groupOrder || restoredStoreDraftSlugRef.current !== slug) return;
    if (cart.length === 0) {
      sessionStorage.removeItem(storeDraftKey);
      return;
    }
    sessionStorage.setItem(storeDraftKey, JSON.stringify({
      slug,
      cart,
      customerName,
      phone,
      customerEmail,
      notes,
      paymentMethodId
    }));
  }, [cart, customerEmail, customerName, groupOrder, notes, paymentMethodId, phone, slug, storeDraftKey]);

  useEffect(() => {
    const sections = [
      ['main', mainSectionRef.current],
      ['sets', setsSectionRef.current],
      ['drinks', drinksSectionRef.current]
    ] as const;
    const visibleSections = sections.filter((entry): entry is readonly ['main' | 'sets' | 'drinks', HTMLElement] => Boolean(entry[1]));
    if (visibleSections.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const section = visibleSections.find(([, element]) => element === visible?.target);
      if (section) setActiveCatalogueSection(section[0]);
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0.05, 0.4] });
    visibleSections.forEach(([, element]) => observer.observe(element));
    const updateTopSection = () => {
      if ((catalogueTopRef.current?.getBoundingClientRect().top || 0) >= -8) setActiveCatalogueSection('all');
    };
    window.addEventListener('scroll', updateTopSection, { passive: true });
    updateTopSection();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateTopSection);
    };
  }, [data]);

  useEffect(() => {
    const updateCatalogueCartVisibility = () => {
      const top = catalogueTopRef.current?.getBoundingClientRect();
      const end = catalogueEndRef.current?.getBoundingClientRect();
      if (!top || !end) return;
      setIsCatalogueCartVisible(top.top < window.innerHeight && end.top > window.innerHeight - 96);
    };
    window.addEventListener('scroll', updateCatalogueCartVisibility, { passive: true });
    window.addEventListener('resize', updateCatalogueCartVisibility);
    updateCatalogueCartVisibility();
    return () => {
      window.removeEventListener('scroll', updateCatalogueCartVisibility);
      window.removeEventListener('resize', updateCatalogueCartVisibility);
    };
  }, [data]);

  const verifyPayment = async (
    provider: StorePaymentProviderId,
    paymentSessionId: string,
    checkoutAccessToken: string
  ) => {
    const result = await storePaymentService.getResult(
      slug,
      provider,
      paymentSessionId,
      checkoutAccessToken
    );
    if (['paid', 'pending_verification'].includes(result.paymentStatus)) {
      setPlacedOrder(result);
      setPaymentSession(null);
      setCart([]);
      setNotes('');
      setCheckoutError('');
      sessionStorage.removeItem(storeDraftKey);
      return;
    }
    if (['pending', 'processing'].includes(result.paymentStatus)) {
      setCheckoutError('Your payment is still processing. Please check again in a moment.');
      return;
    }
    throw new Error('Payment was not completed. Please choose a payment method and try again.');
  };

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has('payment_session_id') || query.has('payment_intent')) return;
    const recovery = readCheckoutRecovery(checkoutRecoveryKey, slug);
    if (!recovery) return;
    let cancelled = false;
    storePaymentService.getResult(
      recovery.slug,
      recovery.provider,
      recovery.paymentSessionId,
      recovery.checkoutAccessToken
    ).then(result => {
      if (cancelled) return;
      if (['paid', 'pending_verification'].includes(result.paymentStatus)) {
        setPlacedOrder(result);
        setPaymentSession(null);
      } else if (['pending', 'processing'].includes(result.paymentStatus) && recovery.session) {
        setPaymentSession(recovery.session);
      } else {
        sessionStorage.removeItem(checkoutRecoveryKey);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [checkoutRecoveryKey, slug]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const returnedProvider = query.get('payment_provider')
      || (query.has('payment_intent') ? 'stripe' : '');
    const returnedPaymentSessionId = query.get('payment_session_id')
      || query.get('payment_intent');
    const returnedCheckoutAccessToken = query.get('payment_access_token');
    if (!returnedProvider || !returnedPaymentSessionId || !returnedCheckoutAccessToken) return;
    const wasCancelled = query.get('payment_cancelled') === '1';
    sessionStorage.setItem(checkoutRecoveryKey, JSON.stringify({
      slug,
      provider: returnedProvider,
      paymentSessionId: returnedPaymentSessionId,
      checkoutAccessToken: returnedCheckoutAccessToken
    } satisfies CheckoutRecovery));
    setIsPlacingOrder(true);
    const cancelReturnedPayment = returnedProvider === 'curlec'
      ? Promise.resolve()
      : storePaymentService.cancel(
        slug,
        returnedProvider,
        returnedPaymentSessionId,
        returnedCheckoutAccessToken
      );
    const returnAction = wasCancelled
      ? cancelReturnedPayment.then(() => {
        sessionStorage.removeItem(checkoutRecoveryKey);
        setPaymentSession(null);
        setCheckoutError('Payment was cancelled. Your order has not been paid. You can try again.');
      })
      : verifyPayment(returnedProvider, returnedPaymentSessionId, returnedCheckoutAccessToken);
    returnAction
      .catch(error => {
        setCheckoutError(error instanceof Error ? error.message : 'We could not verify this payment yet.');
      })
      .finally(() => {
        setIsPlacingOrder(false);
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = '';
        window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.hash}`);
      });
  // verifyPayment intentionally resolves the payment identified by the current URL once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutRecoveryKey, slug]);

  const optionGroupsById = useMemo(
    () => new Map(data?.optionGroups.map(group => [group.id, group]) || []),
    [data]
  );

  const cartDetails = useMemo(() => cart.map(line => {
    const set = line.setId ? data?.sets.find(candidate => candidate.id === line.setId) : undefined;
    const product = data?.products.find(candidate => candidate.id === line.productId);
    const options = line.selectedOptions.map(selection => {
      const group = optionGroupsById.get(selection.groupId);
      const option = group?.options.find(candidate => candidate.id === selection.optionId);
      return { group, option };
    });
    const setSelections = line.selectedSetItems || [];
    const setAnalysis = set ? calculateStoreSetAnalysis(set, data?.products || [], setSelections) : null;
    const unitPrice = setAnalysis?.sellingPrice ?? calculateStoreOptionAdjustedPrice(
      product?.price || 0, options.map(item => item.option?.priceAdjustment || 0)
    );
    const setItems = setSelections.map(selection => ({
      group: set?.groups.find(group => group.id === selection.groupId),
      product: data?.products.find(candidate => candidate.id === selection.productId),
      adjustment: set?.groups.find(group => group.id === selection.groupId)
        ?.options.find(option => option.productId === selection.productId)?.priceAdjustment || 0
    }));
    return { line, product, set, options, setItems, unitPrice, lineTotal: unitPrice * line.quantity };
  }), [cart, data, optionGroupsById]);

  const configuredProductPrice = useMemo(() => {
    if (!configuringProduct) return 0;
    const adjustments = configuringProduct.optionGroupIds.flatMap(groupId => {
      const group = optionGroupsById.get(groupId);
      return (configuredOptions[groupId] || []).map(optionId => (
        group?.options.find(candidate => candidate.id === optionId && candidate.available)
          ?.priceAdjustment || 0
      ));
    });
    return calculateStoreOptionAdjustedPrice(configuringProduct.price, adjustments);
  }, [configuredOptions, configuringProduct, optionGroupsById]);

  const configuredSelections = useMemo<CartSelection['selectedOptions']>(() => (
    Object.keys(configuredOptions).flatMap(groupId => (
      configuredOptions[groupId].map(optionId => ({ groupId, optionId }))
    ))
  ), [configuredOptions]);

  const configuredSelectionError = useMemo(() => {
    if (!configuringProduct || !data) return '';
    return validateStoreProductOptionSelections(
      configuringProduct,
      data.optionGroups,
      configuredSelections
    );
  }, [configuredSelections, configuringProduct, data]);

  const configuredSetSelections = useMemo<NonNullable<CartSelection['selectedSetItems']>>(() => (
    (Object.entries(configuredSetItems) as Array<[string, string[]]>)
      .flatMap(([groupId, productIds]) => productIds.map(productId => ({ groupId, productId })))
  ), [configuredSetItems]);
  const configuredSetAnalysis = useMemo(() => configuringSet && data
    ? calculateStoreSetAnalysis(configuringSet, data.products, configuredSetSelections)
    : null, [configuredSetSelections, configuringSet, data]);
  const configuredSetError = useMemo(() => configuringSet && data
    ? validateStoreSetSelections(configuringSet, data.products, configuredSetSelections)
    : '', [configuredSetSelections, configuringSet, data]);

  const hasAvailableProductOptions = (product: StoreProduct) => (
    product.optionGroupIds.every(groupId => {
      const group = optionGroupsById.get(groupId);
      if (!group) return false;
      if (!group.available) return true;
      const { minimum } = getStoreOptionSelectionLimits(group);
      return group.options.filter(option => option.available).length >= minimum;
    })
  );

  const cartTotal = cartDetails.reduce((sum, item) => sum + item.lineTotal, 0);
  const customerDeliveryFee = deliveryQuote?.quote.customerDeliveryFee || 0;
  const checkoutTotal = cartTotal + customerDeliveryFee;
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const paymentMethods = data?.store.paymentMethods.filter(
    method => method.enabled && method.id !== 'cash_on_pickup'
  ) || [];
  const drinkProductIds = useMemo(() => new Set(
    (data?.sets || []).flatMap(set => set.groups.flatMap(group => /drink/i.test(group.name)
      ? group.options.map(option => option.productId)
      : []))
  ), [data?.sets]);
  const drinkProducts = useMemo(() => (data?.products || []).filter(product => drinkProductIds.has(product.id)), [data?.products, drinkProductIds]);
  const mainProducts = useMemo(() => (data?.products || []).filter(product => !drinkProductIds.has(product.id)), [data?.products, drinkProductIds]);
  const validPickupDates = useMemo(
    () => data ? getValidPickupDates(data.store) : [],
    [data]
  );
  const selectedPickupLocation = data?.store.pickupLocations.find(
    location => location.id === pickupLocationId
  );
  const selectedPaymentMethod = data?.store.paymentMethods.find(
    method => method.id === paymentMethodId && method.enabled && method.id !== 'cash_on_pickup'
  );

  const addConfiguredProduct = (product: StoreProduct, selectedOptions: CartSelection['selectedOptions']) => {
    const key = selectionKey(product.id, selectedOptions);
    setCart(current => {
      const existing = current.find(line => line.key === key);
      if (existing) {
        return current.map(line => line.key === key
          ? { ...line, quantity: Math.min(20, line.quantity + 1) }
          : line);
      }
      return [...current, { key, productId: product.id, quantity: 1, selectedOptions }];
    });
    setConfiguringProduct(null);
    setConfiguredOptions({});
    setPlacedOrder(null);
    setPaymentSession(null);
    setCheckoutError('');
    sessionStorage.removeItem(checkoutRecoveryKey);
  };

  const startAddingSet = (set: StoreSet) => {
    if (!data || getStoreSetUnavailableReason(set, data.products)) return;
    const defaults = getDefaultStoreSetSelections(set, data.products);
    setConfiguredSetItems(Object.fromEntries(set.groups.map(group => [
      group.id,
      defaults.filter(item => item.groupId === group.id).map(item => item.productId)
    ])));
    setConfiguringSet(set);
  };

  const addConfiguredSet = (set: StoreSet) => {
    const selectedSetItems = configuredSetSelections;
    const key = `set:${set.id}:${selectedSetItems.map(item => `${item.groupId}=${item.productId}`).sort().join('|')}`;
    setCart(current => {
      const existing = current.find(line => line.key === key);
      if (existing) return current.map(line => line.key === key ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line);
      return [...current, { key, productId: set.id, setId: set.id, quantity: 1, selectedOptions: [], selectedSetItems }];
    });
    setConfiguringSet(null);
    setConfiguredSetItems({});
    setPlacedOrder(null);
    setPaymentSession(null);
    setCheckoutError('');
    sessionStorage.removeItem(checkoutRecoveryKey);
  };

  const startAddingProduct = (product: StoreProduct) => {
    if (product.optionGroupIds.length === 0) {
      addConfiguredProduct(product, []);
      return;
    }
    const groups = product.optionGroupIds
      .map(groupId => optionGroupsById.get(groupId))
      .filter(group => group?.available);
    if (groups.length !== product.optionGroupIds.length) {
      const missingGroup = product.optionGroupIds.some(groupId => !optionGroupsById.has(groupId));
      if (missingGroup) {
        setCheckoutError(`Options for ${product.name} are currently unavailable.`);
        return;
      }
    }
    setConfiguredOptions(Object.fromEntries(groups.map(group => [
      group!.id,
      group!.selectionType === 'single' && getStoreOptionSelectionLimits(group!).minimum > 0
        ? [group!.options.find(option => option.available)!.id]
        : []
    ])));
    setConfiguringProduct(product);
  };

  const startPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || isPlacingOrder) return;
    setCheckoutError('');
    setIsPlacingOrder(true);
    try {
      if (fulfilmentMethod === 'delivery' && !deliveryQuote) throw new Error('Delivery fee is still being calculated.');
      const session = await storePaymentService.createPayment(slug, {
        fulfilmentMethod,
        paymentMethodId,
        customerName,
        phone,
        ...(currentUser && customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        pickupDate,
        pickupSession,
        pickupLocationId,
        ...(fulfilmentMethod === 'delivery' && deliveryQuote ? { deliveryQuoteId: deliveryQuote.quote.quotationId, fulfilmentMode: deliveryMode, ...(deliveryMode === 'preorder' ? { deliveryDate, deliverySession } : {}), destination: { formattedAddress: deliveryAddressForQuote, latitude: deliveryLatitude, longitude: deliveryLongitude, deliveryInstructions: deliveryRemarks } } : {}),
        notes,
        selections: cart.map(({ productId, setId, quantity, selectedOptions, selectedSetItems }) => ({
          productId,
          ...(setId ? { setId } : {}),
          quantity,
          selectedOptions,
          ...(selectedSetItems ? { selectedSetItems } : {})
        })),
        ...(groupOrder ? { groupShareCode: groupOrder.shareCode } : {})
      }, paymentReturnUrl);
      if (currentUser) {
        await customerContactService.save(currentUser.uid, {
          name: customerName,
          phone,
          email: customerEmail || currentUser.email || ''
        }).catch(() => undefined);
      }
      sessionStorage.setItem(checkoutRecoveryKey, JSON.stringify({
        slug,
        provider: session.provider,
        paymentSessionId: session.paymentSessionId,
        checkoutAccessToken: session.checkoutAccessToken,
        session
      } satisfies CheckoutRecovery));
      if (session.checkout.type === 'manual_payment') {
        try {
          if (session.checkout.methodId === 'cash_on_pickup') {
            await storePaymentService.submitManual(slug, session);
            await verifyPayment(session.provider, session.paymentSessionId, session.checkoutAccessToken);
          } else {
            setPaymentSession(session);
          }
        } catch (manualPaymentError) {
          // Preserve the server-created session so a failed receipt upload or
          // submission can be retried without creating a duplicate order.
          setPaymentSession(session);
          throw manualPaymentError;
        }
      } else if (session.checkout.type === 'provider_redirect') {
        window.location.assign(session.checkout.redirectUrl);
      } else {
        // The online provider's secure element must confirm the payment after the
        // server creates its session. This is the only required continuation step.
        setPaymentSession(session);
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start secure payment. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const requestDeliveryQuote = async () => {
    if (!deliveryAddress || !deliveryLatitude || !deliveryLongitude || (deliveryMode === 'preorder' && (!deliveryDate || !deliverySession))) return;
    const requestId = ++deliveryQuoteRequestRef.current;
    setIsCalculatingDelivery(true);
    setCheckoutError('');
    try {
      const quote = await storeDeliveryService.quote(slug, cart.map(({ productId, setId, quantity, selectedOptions, selectedSetItems }) => ({ productId, ...(setId ? { setId } : {}), quantity, selectedOptions, ...(selectedSetItems ? { selectedSetItems } : {}) })), { formattedAddress: deliveryAddressForQuote, latitude: deliveryLatitude, longitude: deliveryLongitude, deliveryInstructions: deliveryRemarks }, deliveryDate, deliverySession, deliveryMode);
      if (requestId === deliveryQuoteRequestRef.current) setDeliveryQuote(quote);
    } catch (error) { if (requestId === deliveryQuoteRequestRef.current) { setDeliveryQuote(null); setCheckoutError(error instanceof Error ? error.message : 'Unable to calculate delivery.'); } } finally { if (requestId === deliveryQuoteRequestRef.current) setIsCalculatingDelivery(false); }
  };

  useEffect(() => {
    if (fulfilmentMethod !== 'delivery' || !deliveryAddress || !deliveryLatitude || !deliveryLongitude || (deliveryMode === 'preorder' && (!deliveryDate || !deliverySession))) return;
    setDeliveryQuote(null);
    void requestDeliveryQuote();
  // Provider quotations do not include the preorder slot. Unit and instructions are intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfilmentMethod, deliveryMode, deliveryAddress, deliveryLatitude, deliveryLongitude, cart]);

  useEffect(() => {
    const expiresAt = Date.parse(deliveryQuote?.quote.expiresAt || '');
    if (!Number.isFinite(expiresAt)) return;
    const timeout = window.setTimeout(() => setDeliveryQuote(null), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [deliveryQuote?.quote.expiresAt]);

  const selectDeliveryAddress = async (suggestion: PlaceSuggestion) => {
    deliveryQuoteRequestRef.current += 1;
    setIsSelectingDeliveryAddress(true);
    setDeliveryAddressError('');
    try {
      const selected = await getSelectedPlace(suggestion.placeId, deliveryPlacesSessionRef.current);
      setDeliveryAddress(selected.formattedAddress);
      setDeliveryAddressQuery(selected.formattedAddress);
      setDeliveryLatitude(selected.latitude);
      setDeliveryLongitude(selected.longitude);
      setDeliverySuggestions([]);
      setDeliveryQuote(null);
      deliveryPlacesSessionRef.current = crypto.randomUUID();
    } catch (error) {
      setDeliveryAddressError(error instanceof Error ? error.message : 'Unable to select this address.');
    } finally {
      setIsSelectingDeliveryAddress(false);
    }
  };

  const preserveGroupCheckoutDraft = () => {
    if (!groupOrder?.id) return;
    sessionStorage.setItem(`${GROUP_DRAFT_KEY_PREFIX}${groupOrder.id}`, JSON.stringify({
      groupId: groupOrder.id,
      cart,
      customerName,
      phone,
      customerEmail,
      notes,
      paymentMethodId
    }));
  };

  if (isLoading) {
    return <div className="h-[520px] animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading Store" />;
  }

  if (hasError || !data) {
    return (
      <section className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-16 text-center">
        <StoreIcon className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-4 font-display text-3xl font-bold text-primary">Store not available</h1>
        <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">This Store could not be found or is temporarily unavailable.</p>
        <a href="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Explore MiseChef <ArrowRight className="h-4 w-4" /></a>
      </section>
    );
  }

  const { store, products, sets } = data;
  const region = getRegionConfiguration(store.country);
  const storeWhatsApp = store.storeContact.whatsapp;
  const bulkOrderWhatsAppUrl = getBusinessWhatsAppUrl(storeWhatsApp);
  const confirmationCopy = placedOrder
    ? getCustomerOrderConfirmationCopy(placedOrder.paymentStatus, placedOrder.status)
    : null;
  const groupLoginReturnTo = groupOrder
    ? `/login?returnTo=${encodeURIComponent(`/group/${encodeURIComponent(groupOrder.shareCode)}`)}`
    : '/login';
  const canOrderPickup = store.pickupEnabled
    && store.pickupLocations.length > 0
    && store.pickupSessions.length > 0
    && validPickupDates.length > 0
    && (!groupOrder || groupOrder.status === 'open');
  const hostPath = `/host/${encodeURIComponent(store.slug)}`;
  const hostEntryHref = currentUser ? hostPath : `/login?returnTo=${encodeURIComponent(hostPath)}`;
  const paymentReturnUrl = (() => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('payment_return', '1');
    return url.toString();
  })();

  return (
    <div className="space-y-8">
      {groupOrder && (
        <section className="rounded-3xl border border-secondary/30 bg-secondary/10 p-6">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">MiseChef Group Order</p>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-bold text-primary"><CheckCircle2 className="h-7 w-7 text-green-700" /> Joined {groupOrder.name} Group</h1>
          <p className="mt-2 font-sans text-sm font-extrabold text-primary">Hosted by {groupOrder.hostName}</p>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Your order will be included in this Group Order.</p>
          <p className="mt-1 font-sans text-xs font-bold text-outline">Joining the Group does not submit an order. Choose your items and complete checkout below.</p>
          <p className="mt-3 font-sans text-xs font-extrabold text-secondary">Order before {new Date(groupOrder.closesAt).toLocaleString()}</p>
          <div className="mt-4"><GroupPickupContext group={groupOrder} country={store.country} /></div>
          {groupOrder.status !== 'open' && <p className="mt-4 rounded-2xl bg-white/70 p-3 font-sans text-sm font-extrabold text-error">This Group Order is {groupOrder.status}. New orders are no longer accepted.</p>}
        </section>
      )}
      <section className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
        <div className="relative h-52 bg-primary sm:h-72">
          {store.coverImageUrl ? (
            <img src={store.coverImageUrl} alt={`${store.name} cover`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary to-primary-container">
              <StoreIcon className="h-16 w-16 text-on-primary/70" />
            </div>
          )}
        </div>
        <div className="relative px-5 pb-7 pt-16 sm:px-8">
          <div className="absolute -top-12 left-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-surface-container-low shadow-lg sm:left-8">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={`${store.name} logo`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <StoreIcon className="h-9 w-9 text-primary" />
            )}
          </div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">MiseChef Store</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary sm:text-5xl">{store.name}</h1>
          {store.description && <p className="mt-4 max-w-3xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{store.description}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 font-sans text-xs font-extrabold text-primary">
              <MapPin className="h-4 w-4" /> {region.countryName}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 font-sans text-xs font-extrabold text-primary">
              <Clock3 className="h-4 w-4" /> {store.businessHours}
            </span>
            {canOrderPickup && <span className="rounded-full bg-green-100 px-4 py-2 font-sans text-xs font-extrabold text-green-800">Pickup pre-order available</span>}
            {store.deliveryEnabled && <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 font-sans text-xs font-extrabold text-green-800"><Truck className="h-4 w-4" /> Delivery available</span>}
          </div>
        </div>
      </section>

      {!groupOrder && store.hostProgram.enabled && (
        <section aria-labelledby="host-opportunity-title" className="overflow-hidden rounded-3xl border border-surface-container-high bg-surface-container-low shadow-sm">
          <div className="grid gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-7">
            <div>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Host a MiseChef Group Order</p>
              <h2 id="host-opportunity-title" className="mt-2 font-display text-2xl font-bold text-primary sm:text-3xl">Bring your group. Get rewarded.</h2>
              <p className="mt-2 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Invite friends, family or colleagues to order together and earn Host Rewards.</p>
              <p className="mt-4 inline-flex rounded-full border border-secondary/25 bg-secondary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary">
                Earn {store.hostProgram.rewardPercent.toLocaleString(undefined, { maximumFractionDigits: 2 })}% on qualifying group orders
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:min-w-44">
              <a href={hostEntryHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Start a Group Order <ArrowRight className="h-4 w-4" /></a>
              <button type="button" aria-expanded={isHostInfoOpen} aria-controls="host-opportunity-details" onClick={() => setIsHostInfoOpen(current => !current)} className="rounded-full border border-surface-container-high bg-surface px-5 py-3 font-sans text-xs font-extrabold text-primary">
                {isHostInfoOpen ? 'Show less' : 'Learn more'}
              </button>
            </div>
          </div>
          {isHostInfoOpen && (
            <div id="host-opportunity-details" className="border-t border-surface-container-high bg-surface/70 px-6 py-5 sm:px-7">
              <ol className="grid gap-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant sm:grid-cols-2">
                <li><span className="font-extrabold text-primary">1. Create your Group.</span> Choose one coordinated pickup time.</li>
                <li><span className="font-extrabold text-primary">2. Share your Group link.</span> Invite friends, family or colleagues.</li>
                <li><span className="font-extrabold text-primary">3. Guests order and pay individually.</span> Guests do not need a MiseChef account, and the Host does not collect their money.</li>
                <li><span className="font-extrabold text-primary">4. Track qualifying rewards.</span> Estimated Host Reward applies once completed Group Sales reach {formatRegionCurrency(store.hostProgram.minimumQualifyingSales, store.currency)}.</li>
              </ol>
              <p className="mt-4 font-sans text-xs font-bold leading-relaxed text-outline">Phase 1 tracks estimated Host Rewards only. It is not a cash wallet or transferable balance.</p>
            </div>
          )}
        </section>
      )}

      <div>
        <section ref={catalogueTopRef} className="min-w-0">
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Products &amp; Sets</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-primary">Available now</h2>
          {products.length > 0 || sets.length > 0 ? (
            <>
              <nav aria-label="Catalogue sections" className="sticky top-0 z-20 -mx-1 mt-5 overflow-x-auto border-y border-surface-container-high bg-surface/95 px-1 py-2 backdrop-blur lg:top-3">
                <div className="flex min-w-max gap-2">
                  {([
                    ['all', 'All', catalogueTopRef],
                    ['main', 'Main', mainSectionRef],
                    ['sets', 'Sets', setsSectionRef],
                    ['drinks', 'Drinks', drinksSectionRef]
                  ] as const).map(([id, label, ref]) => {
                    const unavailable = (id === 'sets' && sets.length === 0) || (id === 'main' && mainProducts.length === 0) || (id === 'drinks' && drinkProducts.length === 0);
                    return <button key={id} type="button" disabled={unavailable} onClick={() => { setActiveCatalogueSection(id); ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`rounded-full px-4 py-2 font-sans text-xs font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${activeCatalogueSection === id ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary hover:bg-surface-container-high'}`}>{label}</button>;
                  })}
                </div>
              </nav>
              <div className="mt-6 space-y-10">
                {mainProducts.length > 0 && <section ref={mainSectionRef} id="catalogue-main" className="scroll-mt-20">
                  <h3 className="font-display text-2xl font-bold text-primary">Main</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {mainProducts.map(product => (
                      <article key={product.id} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                        {product.photoUrl && <img src={product.photoUrl} alt={product.name} className="h-48 w-full object-cover" referrerPolicy="no-referrer" />}
                        <div className="p-4">
                          <h4 className="font-display text-xl font-bold text-primary">{product.name}</h4>
                          <p className="mt-1 font-sans text-base font-extrabold text-secondary">{formatRegionCurrency(product.price, store.currency)}</p>
                          {product.description && <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
                          {canOrderPickup && <button type="button" disabled={!hasAvailableProductOptions(product)} onClick={() => startAddingProduct(product)} className="mt-4 w-full rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">
                            {!hasAvailableProductOptions(product) ? 'Options unavailable' : product.optionGroupIds.length > 0 ? 'Choose Options' : 'Add to Cart'}
                          </button>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>}
                {sets.length > 0 && <section ref={setsSectionRef} id="catalogue-sets" className="scroll-mt-20">
                  <h3 className="font-display text-2xl font-bold text-primary">Sets</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sets.map(set => {
                const unavailableReason = getStoreSetUnavailableReason(set, products);
                return <article key={`set-${set.id}`} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                  {set.photoUrl && <img src={set.photoUrl} alt={set.name} className="h-48 w-full object-cover" referrerPolicy="no-referrer" />}
                  <div className="p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-secondary">{set.category || 'Set & Combo'}</p>
                    <h4 className="mt-1 font-display text-xl font-bold text-primary">{set.name}</h4>
                    <p className="mt-1 font-sans text-base font-extrabold text-secondary">{formatRegionCurrency(set.price, store.currency)}</p>
                    {set.description && <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{set.description}</p>}
                    {unavailableReason && <p className="mt-2 text-xs font-bold text-error">{unavailableReason}</p>}
                    {canOrderPickup && <button type="button" disabled={Boolean(unavailableReason)} onClick={() => startAddingSet(set)} className="mt-4 w-full rounded-full bg-primary px-5 py-3 text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">{unavailableReason ? 'Currently unavailable' : 'Choose Set'}</button>}
                  </div>
                </article>;
              })}
                  </div>
                </section>}
                {drinkProducts.length > 0 && <section ref={drinksSectionRef} id="catalogue-drinks" className="scroll-mt-20">
                  <h3 className="font-display text-2xl font-bold text-primary">Drinks</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {drinkProducts.map(product => (
                <article key={product.id} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                  {product.photoUrl && <img src={product.photoUrl} alt={product.name} className="h-48 w-full object-cover" referrerPolicy="no-referrer" />}
                  <div className="p-4">
                    <h4 className="font-display text-xl font-bold text-primary">{product.name}</h4>
                    <p className="mt-1 font-sans text-base font-extrabold text-secondary">{formatRegionCurrency(product.price, store.currency)}</p>
                    {product.description && <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
                    {canOrderPickup && (
                      <button type="button" disabled={!hasAvailableProductOptions(product)} onClick={() => startAddingProduct(product)} className="mt-4 w-full rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">
                        {!hasAvailableProductOptions(product)
                          ? 'Options unavailable'
                          : product.optionGroupIds.length > 0 ? 'Choose Options' : 'Add to Cart'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
                  </div>
                </section>}
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
              <PackageOpen className="mx-auto h-8 w-8 text-primary" />
              <h3 className="mt-4 font-display text-2xl font-bold text-primary">No products or sets available</h3>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Please check back soon.</p>
            </div>
          )}
          <div ref={catalogueEndRef} aria-hidden="true" />
        </section>

        <aside ref={checkoutSectionRef} id="customer-order" className={`${isCheckoutOpen ? 'fixed inset-0 z-50 block overflow-y-auto bg-surface p-4 pb-8 lg:mx-auto lg:max-w-[60rem] lg:p-8' : 'hidden'} scroll-mt-24 rounded-3xl border border-surface-container-high bg-white shadow-2xl`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Checkout</p>
            <button type="button" onClick={() => setIsCheckoutOpen(false)} className="rounded-full bg-surface-container p-2 text-primary" aria-label="Close checkout"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-primary"><ShoppingCart className="h-5 w-5" /> Order Summary</h2>
            <span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary">{cartCount}</span>
          </div>

          {groupOrder && !paymentSession && !placedOrder && (
            <div className="mt-5"><GroupPickupContext group={groupOrder} country={store.country} /></div>
          )}

          {!canOrderPickup && (
            <p className="mt-5 rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">
              {store.pickupEnabled && store.pickupLocations.length > 0 && store.pickupSessions.length > 0
                ? 'No pickup dates are currently available.'
                : 'This Store is currently browse-only. Pickup ordering is not available.'}
            </p>
          )}

          {placedOrder && (
            <section ref={confirmationRef} aria-labelledby="order-confirmation-heading" className="mt-5 scroll-mt-24 rounded-2xl bg-green-50 p-4 text-green-800">
              <CheckCircle2 className="h-6 w-6" />
              <h3 id="order-confirmation-heading" className="mt-2 font-display text-xl font-bold">
                {confirmationCopy?.heading}
              </h3>
              <p className="mt-1 font-sans text-sm font-bold">{confirmationCopy?.message}</p>
              {placedOrder.paymentStatus === 'pending_verification' && (
                <p className="mt-3 rounded-xl bg-white px-3 py-2 font-sans text-sm font-extrabold text-green-900">You do not need to pay again.</p>
              )}
              {placedOrder.groupOrder && (
                <div className="mt-4 space-y-3 rounded-2xl border border-green-200 bg-white/70 p-4">
                  <div>
                    <p className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Order Successfully Submitted</p>
                    <p className="mt-1 font-sans text-sm font-extrabold text-green-900">Your order was added to {placedOrder.groupOrder.name} Group.</p>
                  </div>
                  <GroupPickupContext group={placedOrder.groupOrder} country={store.country} />
                </div>
              )}
              <dl className="mt-4 grid gap-3 rounded-2xl bg-white/70 p-4">
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Order Number</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.orderNumber}</dd></div>
                {placedOrder.pickupCode && <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Code</dt><dd className="mt-0.5 font-display text-2xl font-bold tracking-[0.18em]">{placedOrder.pickupCode}</dd></div>}
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Date</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{formatPickupDateLabel(placedOrder.pickupDate, store.country)}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Location</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.pickupLocationName}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Time</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.pickupSession}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Order Status</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{confirmationCopy?.statusLabel}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Payment Method</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.paymentMethodName}</dd></div>
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                {currentUser ? (
                  <>
                    <a href="/orders" className="inline-flex items-center justify-center gap-2 rounded-full bg-green-800 px-4 py-2.5 font-sans text-xs font-extrabold text-white">View My Order <ArrowRight className="h-3.5 w-3.5" /></a>
                    <p className="text-center font-sans text-xs font-bold text-green-800">You can check your order anytime from Account → My Orders.</p>
                  </>
                ) : placedOrder.groupOrder ? (
                  <div className="rounded-2xl bg-white/70 p-4 text-center">
                    <p className="font-sans text-xs font-extrabold text-green-900">Please keep your Order Number for reference.</p>
                    <p className="mt-1 font-sans text-xs font-bold text-green-800">After payment verification, the Store can confirm your order via WhatsApp.</p>
                    <p className="mt-3 font-sans text-xs font-bold text-green-800">Create a free MiseChef account to keep future orders in one place.</p>
                    <a href={groupLoginReturnTo} className="mt-3 inline-flex items-center justify-center rounded-full bg-green-800 px-4 py-2.5 font-sans text-xs font-extrabold text-white">Sign In / Create Account</a>
                  </div>
                ) : null}
                <a href="/" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-green-800">Explore MiseChef <ArrowRight className="h-3.5 w-3.5" /></a>
              </div>
            </section>
          )}

          {paymentSession ? (
            <section ref={paymentStageRef} aria-labelledby="payment-stage-heading" className="mt-5 scroll-mt-24">
              {paymentSession.groupOrder && (
                <div className="mb-4 rounded-2xl border border-secondary/25 bg-secondary/10 p-4">
                  <p className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-secondary">Order Successfully Submitted</p>
                  <p className="mt-1 font-sans text-sm font-extrabold text-primary">Order {paymentSession.orderNumber} was added to {paymentSession.groupOrder.name} Group.</p>
                  <div className="mt-3"><GroupPickupContext group={paymentSession.groupOrder} country={store.country} /></div>
                </div>
              )}
              <h3 id="payment-stage-heading" className="mb-3 font-display text-xl font-bold text-primary">Payment</h3>
              {checkoutError && <p role="alert" className="mb-3 rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{checkoutError}</p>}
              <StorePaymentCheckout
                session={paymentSession}
                customerName={customerName}
                phone={phone}
                customerEmail={customerEmail}
                currency={store.currency}
                total={checkoutTotal}
                storeSlug={store.slug}
                storeName={store.name}
                storeWhatsApp={storeWhatsApp}
                returnUrl={(() => {
                  const url = new URL(paymentReturnUrl);
                  url.searchParams.set('payment_provider', paymentSession.provider);
                  url.searchParams.set('payment_session_id', paymentSession.paymentSessionId);
                  url.searchParams.set('payment_access_token', paymentSession.checkoutAccessToken);
                  return url.toString();
                })()}
                onComplete={paymentSessionId => verifyPayment(
                  paymentSession.provider,
                  paymentSessionId,
                  paymentSession.checkoutAccessToken
                )}
                onBack={async () => {
                  if (paymentSession.provider !== 'curlec') {
                    await storePaymentService.cancel(
                      slug,
                      paymentSession.provider,
                      paymentSession.paymentSessionId,
                      paymentSession.checkoutAccessToken
                    );
                  }
                  sessionStorage.removeItem(checkoutRecoveryKey);
                  setPaymentSession(null);
                  setCheckoutError('');
                }}
              />
            </section>
          ) : cartDetails.length > 0 ? (
            <>
              <div className="mt-5 space-y-4">
                {cartDetails.map(({ line, product, set, options, setItems, lineTotal }) => (product || set) && (
                  <div key={line.key} className="border-b border-surface-container-high pb-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-sans text-sm font-extrabold text-primary">{set?.name || product?.name}</p>
                        {setItems.map(({ group, product: selectedProduct, adjustment }, index) => group && selectedProduct && (
                          <p key={`${group.id}-${selectedProduct.id}-${index}`} className="mt-0.5 font-sans text-[11px] font-bold text-on-surface-variant">
                            {group.name}: {selectedProduct.name}
                            {adjustment > 0 && ` (+${formatRegionCurrency(adjustment, store.currency)})`}
                          </p>
                        ))}
                        {options.map(({ group, option }) => group && option && (
                          <p key={group.id} className="mt-0.5 font-sans text-[11px] font-bold text-on-surface-variant">
                            {group.name}: {option.name}
                            {option.priceAdjustment !== 0 && ` (${option.priceAdjustment > 0 ? '+' : '−'}${formatRegionCurrency(Math.abs(option.priceAdjustment), store.currency)})`}
                          </p>
                        ))}
                      </div>
                      <p className="font-sans text-sm font-extrabold text-secondary">{formatRegionCurrency(lineTotal, store.currency)}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" aria-label={`Remove one ${set?.name || product?.name}`} onClick={() => setCart(current => current.flatMap(item => item.key !== line.key ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))} className="rounded-full bg-surface-container p-2 text-primary"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="min-w-6 text-center font-sans text-xs font-extrabold text-primary">{line.quantity}</span>
                      <button type="button" aria-label={`Add one ${set?.name || product?.name}`} onClick={() => setCart(current => current.map(item => item.key === line.key ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item))} className="rounded-full bg-surface-container p-2 text-primary"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <dl className="mt-4 space-y-2 border-t border-surface-container-high pt-4 font-sans text-sm font-bold text-on-surface-variant">
                <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="text-primary">{formatRegionCurrency(cartTotal, store.currency)}</dd></div>
                {fulfilmentMethod === 'delivery' && deliveryQuote && <div className="flex justify-between gap-3"><dt>Delivery Fee</dt><dd className="text-primary">{formatRegionCurrency(customerDeliveryFee, store.currency)}</dd></div>}
                <div className="flex justify-between gap-3 border-t border-surface-container-high pt-2 text-base font-extrabold text-primary"><dt>Total</dt><dd>{formatRegionCurrency(checkoutTotal, store.currency)}</dd></div>
              </dl>

              <form id="store-checkout-form" onSubmit={startPayment} className="mt-5 flex flex-col gap-5 pb-28">
                {paymentMethods.length === 1 ? (
                  <section aria-label="Payment method" className="order-4 flex items-center justify-between rounded-xl border border-surface-container-high px-3 py-3">
                    <span className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Payment</span>
                    <span className="inline-flex items-center gap-2 font-sans text-sm font-extrabold text-primary">{getStorePaymentMethodLabel(paymentMethods[0].id)} <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /></span>
                  </section>
                ) : <fieldset className="order-4">
                  <legend className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Payment</legend>
                  <div className="mt-2 space-y-2">
                    {paymentMethods.map(method => {
                      const isSelected = paymentMethodId === method.id;
                      return (
                        <label key={method.id} className={`relative flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 transition-colors ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-surface-container-high bg-white hover:border-outline-variant'}`}>
                          <input type="radio" name="paymentMethod" value={method.id} checked={isSelected} onChange={() => setPaymentMethodId(method.id)} className="sr-only" />
                          <span className="flex items-center gap-2 font-sans text-sm font-extrabold text-primary"><PaymentMethodIcon methodId={method.id} /> {getStorePaymentMethodLabel(method.id)}</span>
                          {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>}

                <section aria-labelledby="customer-details-heading" className="order-3">
                  <h3 id="customer-details-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Customer</h3>
                  <div className="mt-2 space-y-2">
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Name</span>
                      <input aria-label="Name" required autoComplete="name" placeholder="Your name" value={customerName} onChange={event => setCustomerName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    </label>
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Phone</span>
                      <input aria-label="Phone" required autoComplete="tel" inputMode="tel" placeholder="Your phone number" value={phone} onChange={event => setPhone(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    </label>
                    {currentUser && (
                      <label className="block">
                        <span className="font-sans text-xs font-extrabold text-primary">Email <span className="text-outline">(optional)</span></span>
                        <input aria-label="Email" type="email" autoComplete="email" placeholder="Your email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                      </label>
                    )}
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Notes <span className="text-outline">(optional)</span></span>
                      <textarea aria-label="Notes" rows={2} placeholder="Anything the Store should know?" value={notes} onChange={event => setNotes(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    </label>
                  </div>
                </section>

                <section aria-labelledby="fulfilment-heading" className="order-1">
                  <h3 id="fulfilment-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Fulfilment</h3>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { setFulfilmentMethod('pickup'); setDeliveryQuote(null); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${fulfilmentMethod === 'pickup' ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary'}`}>Pickup</button>
                    {store.delivery?.enabled && (store.delivery.fulfilment.preOrder.enabled || store.delivery.fulfilment.instant.enabled) && !groupOrder && <button type="button" onClick={() => { setFulfilmentMethod('delivery'); setDeliveryMode(store.delivery?.fulfilment.instant.enabled && !store.delivery?.fulfilment.preOrder.enabled ? 'instant' : 'preorder'); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${fulfilmentMethod === 'delivery' ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary'}`}>Delivery</button>}
                  </div>
                </section>

                {fulfilmentMethod === 'delivery' && <section aria-labelledby="delivery-details-heading" className="order-2">
                  <h3 id="delivery-details-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Delivery Details</h3>
                  <div className="mt-2 space-y-2">
                    {store.delivery.fulfilment.preOrder.enabled && store.delivery.fulfilment.instant.enabled && <div className="flex gap-2"><button type="button" onClick={() => { setDeliveryMode('instant'); setDeliveryQuote(null); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${deliveryMode === 'instant' ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary'}`}>Deliver now</button><button type="button" onClick={() => { setDeliveryMode('preorder'); setDeliveryQuote(null); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${deliveryMode === 'preorder' ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary'}`}>Pre-order</button></div>}
                    {deliveryMode === 'preorder' && <><label className="block"><span className="font-sans text-xs font-extrabold text-primary">Delivery date</span><select aria-label="Delivery date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{getValidPickupDates({ ...store, orderDays: store.delivery.fulfilment.preOrder.orderDays, earliestPickupDays: store.delivery.fulfilment.preOrder.earliestDays, maximumAdvanceDays: store.delivery.fulfilment.preOrder.maximumAdvanceDays, unavailableDates: store.delivery.fulfilment.preOrder.unavailableDates }).map(date => <option key={date} value={date}>{formatPickupDateLabel(date, store.country)}</option>)}</select></label><label className="block"><span className="font-sans text-xs font-extrabold text-primary">Delivery session</span><select aria-label="Delivery session" value={deliverySession} onChange={event => setDeliverySession(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{store.delivery.fulfilment.preOrder.sessions.map(session => <option key={session} value={session}>{session}</option>)}</select></label></>}
                    {store.delivery.subsidy.enabled && <p className="text-xs font-bold text-on-surface-variant">Spend {formatRegionCurrency(store.delivery.subsidy.minimumMerchandiseSpend, store.currency)} to enjoy delivery capped at {formatRegionCurrency(store.delivery.subsidy.maximumCustomerDeliveryCharge, store.currency)}.</p>}
                    <div className="relative">
                      <label className="block">
                        <span className="font-sans text-xs font-extrabold text-primary">Search delivery address</span>
                        <input aria-label="Search delivery address" required autoComplete="off" placeholder="Search Malaysia addresses and places" value={deliveryAddressQuery} onChange={event => { deliveryQuoteRequestRef.current += 1; setDeliveryAddressQuery(event.target.value); setDeliveryAddress(''); setDeliveryLatitude(''); setDeliveryLongitude(''); setDeliveryQuote(null); }} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" />
                      </label>
                      {(isSearchingDeliveryAddress || isSelectingDeliveryAddress) && <p className="mt-2 text-xs font-bold text-on-surface-variant">Searching addresses…</p>}
                      {deliverySuggestions.length > 0 && <div role="listbox" aria-label="Delivery address results" className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-surface-container-high bg-white shadow-lg">
                        {deliverySuggestions.map(suggestion => <button key={suggestion.placeId} type="button" role="option" onClick={() => selectDeliveryAddress(suggestion)} className="block w-full border-b border-surface-container-low px-4 py-3 text-left last:border-0 hover:bg-surface-container-low">
                          <span className="block font-sans text-sm font-extrabold text-primary">{suggestion.primaryText}</span>
                          {suggestion.secondaryText && <span className="mt-0.5 block text-xs font-bold text-on-surface-variant">{suggestion.secondaryText}</span>}
                        </button>)}
                        <p className="px-4 py-2 text-[10px] font-bold text-on-surface-variant">Powered by Google</p>
                      </div>}
                      {deliveryAddress && <p className="mt-2 text-xs font-bold text-emerald-800">Selected: {deliveryAddress}</p>}
                      {deliveryAddressError && <p role="alert" className="mt-2 text-xs font-bold text-error">{deliveryAddressError}</p>}
                    </div>
                    <input aria-label="Unit or floor" placeholder="Unit / Floor (optional)" value={deliveryUnit} onChange={event => setDeliveryUnit(event.target.value)} className="min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" />
                    <textarea aria-label="Delivery instructions" rows={2} placeholder="Delivery instructions (optional)" value={deliveryInstructions} onChange={event => setDeliveryInstructions(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" />
                    {isCalculatingDelivery && <p className="text-sm font-bold text-on-surface-variant">Calculating delivery…</p>}
                    {deliveryQuote && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Delivery {formatRegionCurrency(deliveryQuote.quote.customerDeliveryFee, store.currency)}</p>}
                  </div>
                </section>}

                {fulfilmentMethod === 'pickup' && <section aria-labelledby="pickup-details-heading" className="order-2">
                  <h3 id="pickup-details-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Pickup Details</h3>
                  <div className="mt-2 space-y-2">
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Date</span>
                      <select aria-label="Pickup date" required disabled={Boolean(groupOrder)} value={pickupDate} onChange={event => setPickupDate(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary disabled:opacity-70">
                        {validPickupDates.map(date => <option key={date} value={date}>{formatPickupDateLabel(date, store.country)}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Location</span>
                      <select aria-label="Pickup location" required disabled={Boolean(groupOrder)} value={pickupLocationId} onChange={event => setPickupLocationId(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary disabled:opacity-70">
                        {store.pickupLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </select>
                    </label>
                    {selectedPickupLocation && (
                      <div className="flex gap-2 rounded-2xl bg-surface-container-low p-3 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
                        <div><p>{selectedPickupLocation.address}</p>{selectedPickupLocation.notes && <p className="mt-1">{selectedPickupLocation.notes}</p>}</div>
                      </div>
                    )}
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Session</span>
                      <select aria-label="Pickup session" required disabled={Boolean(groupOrder)} value={pickupSession} onChange={event => setPickupSession(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary disabled:opacity-70">
                        {store.pickupSessions.map(session => <option key={session} value={session}>{session}</option>)}
                      </select>
                    </label>
                  </div>
                </section>}

                <section aria-labelledby="payment-instructions-heading" className="order-5 rounded-xl bg-surface-container-low p-3">
                  <h3 id="payment-instructions-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Payment Instructions</h3>
                  {paymentMethodId === 'stripe' || paymentMethodId === 'curlec' ? (
                    <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Your order details are saved first, then secure payment continues on the next step.</p>
                  ) : (
                    <>
                      <p className="mt-2 whitespace-pre-line font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
                        {paymentMethodId === 'cash_on_pickup'
                          ? selectedPaymentMethod?.instructions || 'Payment will be collected when you pick up your order.'
                          : storePaymentMethodRequiresReceipt(paymentMethodId)
                            ? 'Continue to view the Store payment details and exact server-confirmed amount. Payment proof is required before submission.'
                            : selectedPaymentMethod?.instructions || 'Continue to the payment step.'}
                      </p>
                    </>
                  )}
                </section>

                {groupOrder && !currentUser && !isAccountSuggestionDismissed && (
                  <section aria-labelledby="group-account-suggestion-heading" className="order-6 rounded-2xl border border-secondary/25 bg-secondary/10 p-4">
                    <h3 id="group-account-suggestion-heading" className="font-display text-lg font-bold text-primary">Want to track this order later?</h3>
                    <p className="mt-1 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">Sign in or create a free MiseChef account before checkout to keep this order in My Orders.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={groupLoginReturnTo} onClick={preserveGroupCheckoutDraft} className="rounded-full bg-primary px-4 py-2.5 font-sans text-xs font-extrabold text-on-primary">Sign In / Create Account</a>
                      <button type="button" onClick={() => setIsAccountSuggestionDismissed(true)} className="rounded-full border border-primary px-4 py-2.5 font-sans text-xs font-extrabold text-primary">Continue as Guest</button>
                    </div>
                    <p className="mt-2 font-sans text-[10px] font-bold text-outline">Guest checkout remains available. Creating an account later will not claim this order.</p>
                  </section>
                )}

                {checkoutError && <p role="alert" className="order-7 rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{checkoutError}</p>}
              </form>
              <div className="sticky bottom-3 z-30 -mx-2 rounded-2xl bg-white/95 p-2 shadow-xl shadow-primary/10 backdrop-blur lg:bottom-4 lg:mx-0 lg:shadow-lg">
                <button form="store-checkout-form" type="submit" disabled={isPlacingOrder} className="min-h-12 w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary shadow-lg shadow-primary/20 disabled:opacity-50">
                  {isPlacingOrder ? 'Placing Order…' : `${getPaymentActionLabel(paymentMethodId)} · ${formatRegionCurrency(checkoutTotal, store.currency)}`}
                </button>
              </div>
            </>
          ) : !placedOrder && canOrderPickup ? (
            <p className="mt-5 font-sans text-sm font-bold text-on-surface-variant">Add a product or set to start your pickup pre-order.</p>
          ) : null}
        </aside>
      </div>

      {cartCount > 0 && isCatalogueCartVisible && !isCheckoutOpen && (
        <button type="button" onClick={() => setIsCheckoutOpen(true)} className="fixed bottom-6 right-6 z-40 hidden min-h-12 items-center rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary shadow-xl shadow-primary/25 transition-transform hover:-translate-y-0.5 lg:inline-flex">View Cart · {cartCount} {cartCount === 1 ? 'item' : 'items'} · {formatRegionCurrency(checkoutTotal, store.currency)}</button>
      )}

      <section className="rounded-3xl border border-surface-container-high bg-white px-6 py-8 text-center shadow-sm">
        <MessageCircle className="mx-auto h-7 w-7 text-primary" />
        <h2 className="mt-3 font-display text-3xl font-bold text-primary">Need a Bulk Order?</h2>
        <p className="mx-auto mt-2 max-w-xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Planning breakfast, meetings, catering or events?</p>
        {bulkOrderWhatsAppUrl ? (
          <a href={bulkOrderWhatsAppUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-green-700 px-6 py-3.5 font-sans text-sm font-extrabold text-white"><MessageCircle className="h-4 w-4" /> WhatsApp Us</a>
        ) : (
          <p className="mt-4 font-sans text-xs font-bold text-outline">Bulk order contact is not available yet.</p>
        )}
      </section>

      <section className="rounded-3xl bg-primary px-6 py-8 text-on-primary sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-on-primary/70">Finished here?</p>
          <h2 className="mt-2 font-display text-2xl font-bold">Explore MiseChef</h2>
          <p className="mt-2 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-primary/80">Browse public recipes and discover chef profiles. No account is required.</p>
        </div>
        <a href="/" className="mt-5 inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 font-sans text-xs font-extrabold text-primary sm:mt-0"><Compass className="h-4 w-4" /> Explore MiseChef</a>
      </section>

      {cartCount > 0 && !isCheckoutOpen && (
        <button type="button" onClick={() => setIsCheckoutOpen(true)} className="fixed inset-x-3 bottom-3 z-40 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3.5 text-on-primary shadow-2xl shadow-primary/30 lg:hidden">
          <span className="text-left font-sans text-sm font-extrabold">{cartCount} {cartCount === 1 ? 'item' : 'items'} · {formatRegionCurrency(checkoutTotal, store.currency)}</span>
          <span className="rounded-full bg-white px-5 py-2.5 font-sans text-sm font-extrabold text-primary">Checkout</span>
        </button>
      )}

      {configuringSet && configuredSetAnalysis && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/50 p-0 sm:items-center sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="set-options-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Build your set</p><h2 id="set-options-title" className="mt-1 font-display text-3xl font-bold text-primary">{configuringSet.name}</h2><p className="mt-2 text-sm font-extrabold text-secondary">{formatRegionCurrency(configuredSetAnalysis.sellingPrice, store.currency)}</p></div>
              <button type="button" aria-label="Close set options" onClick={() => setConfiguringSet(null)} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-6 space-y-5">{configuringSet.groups.map(group => {
              const availableOptions = group.options.flatMap(option => {
                const product = products.find(candidate => candidate.id === option.productId && candidate.available);
                return product ? [{ option, product }] : [];
              });
              const selectedIds = configuredSetItems[group.id] || [];
              return <fieldset key={group.id}>
                <legend className="text-sm font-extrabold text-primary">Choose your {group.name}{group.required && <span className="ml-1 text-error">*</span>}</legend>
                <p className="mt-1 text-[11px] font-bold text-on-surface-variant">{group.required ? `Choose ${group.selectionCount}` : `Optional · choose up to ${group.selectionCount}`}</p>
                <div className="mt-2 space-y-2">
                  {!group.required && <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3"><input type={group.selectionCount === 1 ? 'radio' : 'checkbox'} name={`set-${group.id}`} checked={selectedIds.length === 0} onChange={() => setConfiguredSetItems(current => ({ ...current, [group.id]: [] }))} /><span className="text-sm font-extrabold text-primary">No selection</span></label>}
                  {availableOptions.map(({ option, product }) => <label key={product.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3"><span className="flex min-w-0 items-center gap-3"><input type={group.selectionCount === 1 ? 'radio' : 'checkbox'} name={`set-${group.id}`} checked={selectedIds.includes(product.id)} disabled={group.selectionCount > 1 && !selectedIds.includes(product.id) && selectedIds.length >= group.selectionCount} onChange={() => setConfiguredSetItems(current => ({ ...current, [group.id]: group.selectionCount === 1 ? [product.id] : selectedIds.includes(product.id) ? selectedIds.filter(id => id !== product.id) : [...selectedIds, product.id] }))} /><span className="truncate text-sm font-extrabold text-primary">{product.name}</span></span><span className="shrink-0 text-xs font-bold text-on-surface-variant">{option.priceAdjustment > 0 ? `+${formatRegionCurrency(option.priceAdjustment, store.currency)}` : 'Included'}</span></label>)}
                </div>
              </fieldset>;
            })}</div>
            {configuredSetError && <p className="mt-5 rounded-2xl bg-error/10 p-3 text-xs font-bold text-error">{configuredSetError}</p>}
            <dl className="mt-6 rounded-2xl bg-surface-container-low p-4 text-xs"><div className="flex justify-between gap-3 text-on-surface-variant"><dt>Regular Value</dt><dd className="font-bold">{formatRegionCurrency(configuredSetAnalysis.regularValue, store.currency)}</dd></div><div className="mt-2 flex justify-between gap-3 text-primary"><dt className="font-extrabold">Set</dt><dd className="font-extrabold">{formatRegionCurrency(configuredSetAnalysis.sellingPrice, store.currency)}</dd></div><div className="mt-2 flex justify-between gap-3 text-green-700"><dt className="font-extrabold">Save</dt><dd className="font-extrabold">{formatRegionCurrency(configuredSetAnalysis.customerSaving, store.currency)}</dd></div></dl>
            <button type="button" disabled={Boolean(configuredSetError)} onClick={() => addConfiguredSet(configuringSet)} className="mt-4 w-full rounded-full bg-primary px-5 py-3.5 text-sm font-extrabold text-on-primary disabled:opacity-45">Add to Cart · {formatRegionCurrency(configuredSetAnalysis.sellingPrice, store.currency)}</button>
          </section>
        </div>
      )}

      {configuringProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/50 p-0 sm:items-center sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="product-options-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Choose options</p>
                <h2 id="product-options-title" className="mt-1 font-display text-3xl font-bold text-primary">{configuringProduct.name}</h2>
                <p className="mt-2 font-sans text-sm font-extrabold text-secondary">
                  {formatRegionCurrency(configuredProductPrice, store.currency)}
                </p>
              </div>
              <button type="button" aria-label="Close options" onClick={() => setConfiguringProduct(null)} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 space-y-5">
              {configuringProduct.optionGroupIds.map(groupId => {
                const group = optionGroupsById.get(groupId);
                if (!group?.available) return null;
                const availableOptions = group.options.filter(option => option.available);
                const selectedOptionIds = configuredOptions[group.id] || [];
                const { minimum, maximum } = getStoreOptionSelectionLimits(group);
                return (
                  <fieldset key={group.id}>
                    <legend className="font-sans text-sm font-extrabold text-primary">
                      {group.name}
                      {minimum > 0 && <span className="ml-1 text-error">*</span>}
                    </legend>
                    <p className="mt-1 font-sans text-[11px] font-bold text-on-surface-variant">
                      {formatStoreOptionSelectionRequirement(group)}
                    </p>
                    <div className="mt-2 space-y-2">
                      {group.selectionType === 'single' && minimum === 0 && (
                        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3">
                          <span className="flex items-center gap-3">
                            <input type="radio" name={group.id} checked={selectedOptionIds.length === 0} onChange={() => setConfiguredOptions(current => ({ ...current, [group.id]: [] }))} className="h-4 w-4 text-primary" />
                            <span className="font-sans text-sm font-extrabold text-primary">No selection</span>
                          </span>
                        </label>
                      )}
                      {availableOptions.map(option => (
                        <label key={option.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3">
                          <span className="flex items-center gap-3">
                            {group.selectionType === 'single' ? (
                              <input type="radio" name={group.id} checked={selectedOptionIds.includes(option.id)} onChange={() => setConfiguredOptions(current => ({ ...current, [group.id]: [option.id] }))} className="h-4 w-4 text-primary" />
                            ) : (
                              <input
                                type="checkbox"
                                name={group.id}
                                checked={selectedOptionIds.includes(option.id)}
                                disabled={!selectedOptionIds.includes(option.id) && selectedOptionIds.length >= maximum}
                                onChange={() => setConfiguredOptions(current => {
                                  const selected = current[group.id] || [];
                                  return {
                                    ...current,
                                    [group.id]: selected.includes(option.id)
                                      ? selected.filter(id => id !== option.id)
                                      : [...selected, option.id]
                                  };
                                })}
                                className="h-4 w-4 text-primary disabled:opacity-40"
                              />
                            )}
                            <span className="font-sans text-sm font-extrabold text-primary">{option.name}</span>
                          </span>
                          {option.priceAdjustment !== 0 && <span className="font-sans text-xs font-bold text-on-surface-variant">{option.priceAdjustment > 0 ? '+' : '−'}{formatRegionCurrency(Math.abs(option.priceAdjustment), store.currency)}</span>}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>

            {configuredSelectionError && (
              <p className="mt-5 rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">
                {configuredSelectionError}
              </p>
            )}

            <div className="mt-6 rounded-2xl bg-surface-container-low p-4">
              <div className="flex justify-between gap-3 font-sans text-xs font-bold text-on-surface-variant">
                <span>Base price</span>
                <span>{formatRegionCurrency(configuringProduct.price, store.currency)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3 font-sans text-sm font-extrabold text-primary">
                <span>Final price</span>
                <span>{formatRegionCurrency(configuredProductPrice, store.currency)}</span>
              </div>
            </div>

            <button type="button" disabled={Boolean(configuredSelectionError)} onClick={() => addConfiguredProduct(configuringProduct, configuredSelections)} className="mt-4 w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">
              Add to Cart · {formatRegionCurrency(configuredProductPrice, store.currency)}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
