import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import { storePaymentService, storeService } from './services';
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
import type {
  CartSelection,
  PublicStoreData,
  PublicStoreOrderResult,
  PublicGroupOrder,
  StorePaymentProviderId,
  StorePaymentMethodId,
  StorePaymentSession,
  StoreProduct,
  StoreSet
} from './types';

interface CartLine extends CartSelection {
  key: string;
}

const selectionKey = (productId: string, selectedOptions: CartSelection['selectedOptions']) => (
  `${productId}:${selectedOptions.map(option => `${option.groupId}=${option.optionId}`).sort().join('|')}`
);

const getPaymentMethodDescription = (methodId: StorePaymentMethodId) => {
  switch (methodId) {
    case 'touch_n_go_qr': return 'Scan the QR code to pay.';
    case 'duitnow_qr': return 'Pay using your banking app.';
    case 'bank_transfer': return 'Transfer directly to the Store.';
    case 'cash_on_pickup': return 'Pay when collecting your order.';
    case 'stripe': return 'Secure online payment. Instant confirmation.';
  }
};

const getPaymentActionLabel = (methodId: StorePaymentMethodId) => {
  if (methodId === 'stripe') return 'Continue to Secure Payment';
  if (methodId === 'cash_on_pickup') return 'Place Order';
  return 'Continue to Payment';
};

function PaymentMethodIcon({ methodId }: { methodId: StorePaymentMethodId }) {
  const iconClassName = 'h-5 w-5';
  if (methodId === 'cash_on_pickup') return <Banknote className={iconClassName} aria-hidden="true" />;
  if (methodId === 'stripe') return <CreditCard className={iconClassName} aria-hidden="true" />;
  if (methodId === 'bank_transfer') return <Landmark className={iconClassName} aria-hidden="true" />;
  return <QrCode className={iconClassName} aria-hidden="true" />;
}

export default function PublicStorePage({ slug, groupOrder }: { slug: string; groupOrder?: PublicGroupOrder }) {
  const checkoutSectionRef = useRef<HTMLElement | null>(null);
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
  const [pickupDate, setPickupDate] = useState('');
  const [pickupSession, setPickupSession] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<StorePaymentMethodId>('stripe');
  const [checkoutError, setCheckoutError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentSession, setPaymentSession] = useState<StorePaymentSession | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PublicStoreOrderResult | null>(null);
  const [isCheckoutVisible, setIsCheckoutVisible] = useState(false);
  const [isHostInfoOpen, setIsHostInfoOpen] = useState(false);

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
        setPaymentMethodId(storeData?.store.paymentMethods.find(method => method.enabled)?.id || 'stripe');
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
    const checkoutSection = checkoutSectionRef.current;
    if (!checkoutSection || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsCheckoutVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(checkoutSection);
    return () => observer.disconnect();
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
    const returnedProvider = query.get('payment_provider')
      || (query.has('payment_intent') ? 'stripe' : '');
    const returnedPaymentSessionId = query.get('payment_session_id')
      || query.get('payment_intent');
    const returnedCheckoutAccessToken = query.get('payment_access_token');
    if (!returnedProvider || !returnedPaymentSessionId || !returnedCheckoutAccessToken) return;
    const wasCancelled = query.get('payment_cancelled') === '1';
    setIsPlacingOrder(true);
    const returnAction = wasCancelled
      ? storePaymentService.cancel(
        slug,
        returnedProvider,
        returnedPaymentSessionId,
        returnedCheckoutAccessToken
      ).then(() => {
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
  }, [slug]);

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
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const validPickupDates = useMemo(
    () => data ? getValidPickupDates(data.store) : [],
    [data]
  );
  const selectedPickupLocation = data?.store.pickupLocations.find(
    location => location.id === pickupLocationId
  );
  const selectedPaymentMethod = data?.store.paymentMethods.find(
    method => method.id === paymentMethodId && method.enabled
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
      const session = await storePaymentService.createPayment(slug, {
        paymentMethodId,
        customerName,
        phone,
        pickupDate,
        pickupSession,
        pickupLocationId,
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
  const canOrderPickup = store.pickupEnabled
    && store.pickupLocations.length > 0
    && store.pickupSessions.length > 0
    && validPickupDates.length > 0
    && (!groupOrder || groupOrder.status === 'open');
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
          <h1 className="mt-2 font-display text-3xl font-bold text-primary">You’re joining {groupOrder.hostName}’s Group Order</h1>
          <p className="mt-2 font-display text-xl font-bold text-primary">{groupOrder.name}</p>
          <dl className="mt-4 grid gap-3 font-sans text-sm font-bold text-on-surface-variant sm:grid-cols-3">
            <div><dt className="text-[10px] font-extrabold uppercase text-outline">Store</dt><dd>{groupOrder.storeName}</dd></div>
            <div><dt className="text-[10px] font-extrabold uppercase text-outline">Pickup</dt><dd>{formatPickupDateLabel(groupOrder.pickupDate, store.country)} · {groupOrder.pickupSession}</dd></div>
            <div><dt className="text-[10px] font-extrabold uppercase text-outline">Orders close</dt><dd>{new Date(groupOrder.closesAt).toLocaleString()}</dd></div>
          </dl>
          {groupOrder.status !== 'open' && <p className="mt-4 rounded-2xl bg-white/70 p-3 font-sans text-sm font-extrabold text-error">This Group Order is closed. New orders are no longer accepted.</p>}
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
              <a href={`/host/${encodeURIComponent(store.slug)}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Become a Host <ArrowRight className="h-4 w-4" /></a>
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

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Products &amp; Sets</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-primary">Available now</h2>
          {products.length > 0 || sets.length > 0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {sets.map(set => {
                const unavailableReason = getStoreSetUnavailableReason(set, products);
                return <article key={`set-${set.id}`} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                  {set.photoUrl && <img src={set.photoUrl} alt={set.name} className="h-52 w-full object-cover" referrerPolicy="no-referrer" />}
                  <div className="p-5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-secondary">{set.category || 'Set & Combo'}</p>
                    <h3 className="mt-1 font-display text-2xl font-bold text-primary">{set.name}</h3>
                    <p className="mt-2 font-sans text-lg font-extrabold text-secondary">{formatRegionCurrency(set.price, store.currency)}</p>
                    {set.description && <p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{set.description}</p>}
                    {unavailableReason && <p className="mt-3 text-xs font-bold text-error">{unavailableReason}</p>}
                    {canOrderPickup && <button type="button" disabled={Boolean(unavailableReason)} onClick={() => startAddingSet(set)} className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">{unavailableReason ? 'Currently unavailable' : 'Choose Set'}</button>}
                  </div>
                </article>;
              })}
              {products.map(product => (
                <article key={product.id} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                  {product.photoUrl && <img src={product.photoUrl} alt={product.name} className="h-52 w-full object-cover" referrerPolicy="no-referrer" />}
                  <div className="p-5">
                    <h3 className="font-display text-2xl font-bold text-primary">{product.name}</h3>
                    <p className="mt-2 font-sans text-lg font-extrabold text-secondary">{formatRegionCurrency(product.price, store.currency)}</p>
                    {product.description && <p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
                    {canOrderPickup && (
                      <button type="button" disabled={!hasAvailableProductOptions(product)} onClick={() => startAddingProduct(product)} className="mt-5 w-full rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">
                        {!hasAvailableProductOptions(product)
                          ? 'Options unavailable'
                          : product.optionGroupIds.length > 0 ? 'Choose Options' : 'Add to Cart'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
              <PackageOpen className="mx-auto h-8 w-8 text-primary" />
              <h3 className="mt-4 font-display text-2xl font-bold text-primary">No products or sets available</h3>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Please check back soon.</p>
            </div>
          )}
        </section>

        <aside ref={checkoutSectionRef} id="customer-order" className="scroll-mt-24 rounded-3xl border border-surface-container-high bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-primary"><ShoppingCart className="h-5 w-5" /> Order Summary</h2>
            <span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary">{cartCount}</span>
          </div>

          {!canOrderPickup && (
            <p className="mt-5 rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">
              {store.pickupEnabled && store.pickupLocations.length > 0 && store.pickupSessions.length > 0
                ? 'No pickup dates are currently available.'
                : 'This Store is currently browse-only. Pickup ordering is not available.'}
            </p>
          )}

          {placedOrder && (
            <div className="mt-5 rounded-2xl bg-green-50 p-4 text-green-800">
              <CheckCircle2 className="h-6 w-6" />
              <p className="mt-2 font-display text-xl font-bold">Thank you</p>
              <p className="mt-1 font-sans text-sm font-bold">
                {placedOrder.paymentStatus === 'paid'
                  ? 'Your payment was received and your order is confirmed.'
                  : placedOrder.paymentStatus === 'pending_verification'
                    ? 'Your order was received. The Store will verify your payment.'
                    : 'Your order is confirmed. Please pay when you collect it.'}
              </p>
              <dl className="mt-4 grid gap-3 rounded-2xl bg-white/70 p-4">
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Order Number</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.orderNumber}</dd></div>
                {placedOrder.pickupCode && <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Code</dt><dd className="mt-0.5 font-display text-2xl font-bold tracking-[0.18em]">{placedOrder.pickupCode}</dd></div>}
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Date</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{formatPickupDateLabel(placedOrder.pickupDate, store.country)}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Location</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.pickupLocationName}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Time</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.pickupSession}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Payment Status</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.paymentStatus === 'paid' ? 'Paid' : placedOrder.paymentStatus === 'pending_verification' ? 'Pending Verification' : 'Cash on Pickup'}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Payment Method</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.paymentMethodName}</dd></div>
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                <a href="/" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-green-800">Explore MiseChef <ArrowRight className="h-3.5 w-3.5" /></a>
              </div>
            </div>
          )}

          {paymentSession ? (
            <div className="mt-5">
              {checkoutError && <p role="alert" className="mb-3 rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{checkoutError}</p>}
              <StorePaymentCheckout
                session={paymentSession}
                customerName={customerName}
                phone={phone}
                currency={store.currency}
                total={cartTotal}
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
                  await storePaymentService.cancel(
                    slug,
                    paymentSession.provider,
                    paymentSession.paymentSessionId,
                    paymentSession.checkoutAccessToken
                  );
                  setPaymentSession(null);
                  setCheckoutError('');
                }}
              />
            </div>
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
              <div className="mt-4 flex justify-between gap-3 font-sans text-base font-extrabold text-primary">
                <span>Total</span>
                <span>{formatRegionCurrency(cartTotal, store.currency)}</span>
              </div>

              <form onSubmit={startPayment} className="mt-6 space-y-6">
                <fieldset>
                  <legend className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Payment Method</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {store.paymentMethods.filter(method => method.enabled).map(method => {
                      const isSelected = paymentMethodId === method.id;
                      return (
                        <label key={method.id} className={`relative flex min-h-28 cursor-pointer flex-col rounded-2xl border p-3.5 transition-colors ${isSelected ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20' : 'border-surface-container-high bg-white hover:border-outline-variant'}`}>
                          <input type="radio" name="paymentMethod" value={method.id} checked={isSelected} onChange={() => setPaymentMethodId(method.id)} className="sr-only" />
                          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary'}`}>
                            <PaymentMethodIcon methodId={method.id} />
                          </span>
                          {isSelected && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-primary" aria-hidden="true" />}
                          <span className="mt-3 font-sans text-sm font-extrabold leading-tight text-primary">{getStorePaymentMethodLabel(method.id)}</span>
                          <span className="mt-1 font-sans text-[11px] font-bold leading-snug text-on-surface-variant">{getPaymentMethodDescription(method.id)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <section aria-labelledby="customer-details-heading">
                  <h3 id="customer-details-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Customer Details</h3>
                  <div className="mt-3 space-y-3">
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Name</span>
                      <input aria-label="Name" required autoComplete="name" placeholder="Your name" value={customerName} onChange={event => setCustomerName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    </label>
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Phone</span>
                      <input aria-label="Phone" required autoComplete="tel" inputMode="tel" placeholder="Your phone number" value={phone} onChange={event => setPhone(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    </label>
                    <label className="block">
                      <span className="font-sans text-xs font-extrabold text-primary">Notes <span className="text-outline">(optional)</span></span>
                      <textarea aria-label="Notes" rows={2} placeholder="Anything the Store should know?" value={notes} onChange={event => setNotes(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                    </label>
                  </div>
                </section>

                <section aria-labelledby="pickup-details-heading">
                  <h3 id="pickup-details-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Pickup Details</h3>
                  <div className="mt-3 space-y-3">
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
                </section>

                <section aria-labelledby="payment-instructions-heading" className="rounded-2xl bg-surface-container-low p-4">
                  <h3 id="payment-instructions-heading" className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Payment Instructions</h3>
                  {paymentMethodId === 'stripe' ? (
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

                {checkoutError && <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{checkoutError}</p>}
                <div className="sticky bottom-3 z-30 -mx-2 rounded-2xl bg-white/95 p-2 shadow-xl shadow-primary/10 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                  <button type="submit" disabled={isPlacingOrder} className="min-h-12 w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary shadow-lg shadow-primary/20 disabled:opacity-50">
                    {isPlacingOrder ? 'Placing Order…' : getPaymentActionLabel(paymentMethodId)}
                  </button>
                  <p className="mt-2 text-center font-sans text-[10px] font-bold text-outline">No login, email, or account required.</p>
                </div>
              </form>
            </>
          ) : !placedOrder && canOrderPickup ? (
            <p className="mt-5 font-sans text-sm font-bold text-on-surface-variant">Add a product or set to start your pickup pre-order.</p>
          ) : null}
        </aside>
      </div>

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

      {cartCount > 0 && !isCheckoutVisible && (
        <a href="#customer-order" className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-full bg-primary px-5 py-3.5 text-on-primary shadow-2xl shadow-primary/30 lg:hidden">
          <span className="font-sans text-sm font-extrabold">View order · {cartCount}</span>
          <span className="font-sans text-sm font-extrabold">{formatRegionCurrency(cartTotal, store.currency)}</span>
        </a>
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
