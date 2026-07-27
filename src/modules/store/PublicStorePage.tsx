import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  MapPin,
  MessageCircle,
  Minus,
  PackageOpen,
  Plus,
  ShoppingCart,
  Store as StoreIcon,
  Truck,
  X
} from 'lucide-react';
import { formatRegionCurrency, getRegionConfiguration } from '../../regions';
import StorePaymentCheckout from './StorePaymentCheckout';
import { storePaymentService, storeService } from './services';
import { formatPickupDateLabel, getValidPickupDates } from './storeModel';
import { getBusinessWhatsAppUrl } from './selling';
import type {
  CartSelection,
  PublicStoreData,
  PublicStoreOrderResult,
  StorePaymentProviderId,
  StorePaymentSession,
  StoreProduct
} from './types';

interface CartLine extends CartSelection {
  key: string;
}

const selectionKey = (productId: string, selectedOptions: CartSelection['selectedOptions']) => (
  `${productId}:${selectedOptions.map(option => `${option.groupId}=${option.optionId}`).sort().join('|')}`
);

export default function PublicStorePage({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicStoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [configuringProduct, setConfiguringProduct] = useState<StoreProduct | null>(null);
  const [configuredOptions, setConfiguredOptions] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupSession, setPickupSession] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [paymentSession, setPaymentSession] = useState<StorePaymentSession | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PublicStoreOrderResult | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setHasError(false);

    storeService.getPublicStore(slug)
      .then(storeData => {
        if (isCancelled) return;
        setData(storeData);
        setPickupDate(storeData ? getValidPickupDates(storeData.store)[0] || '' : '');
        setPickupSession(storeData?.store.pickupSessions[0] || '');
        setPickupLocationId(storeData?.store.pickupLocations[0]?.id || '');
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
  }, [slug]);

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
    if (result.paymentStatus === 'paid') {
      setPlacedOrder(result);
      setPaymentSession(null);
      setCart([]);
      setNotes('');
      setCheckoutError('');
      return;
    }
    if (result.paymentStatus === 'processing') {
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
    setIsPlacingOrder(true);
    verifyPayment(returnedProvider, returnedPaymentSessionId, returnedCheckoutAccessToken)
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
    const product = data?.products.find(candidate => candidate.id === line.productId);
    const options = line.selectedOptions.map(selection => {
      const group = optionGroupsById.get(selection.groupId);
      const option = group?.options.find(candidate => candidate.id === selection.optionId);
      return { group, option };
    });
    const unitPrice = Math.max(0, (product?.price || 0) + options.reduce((sum, item) => sum + (item.option?.priceAdjustment || 0), 0));
    return { line, product, options, unitPrice, lineTotal: unitPrice * line.quantity };
  }), [cart, data, optionGroupsById]);

  const cartTotal = cartDetails.reduce((sum, item) => sum + item.lineTotal, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const validPickupDates = useMemo(
    () => data ? getValidPickupDates(data.store) : [],
    [data]
  );
  const selectedPickupLocation = data?.store.pickupLocations.find(
    location => location.id === pickupLocationId
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

  const startAddingProduct = (product: StoreProduct) => {
    const groups = product.optionGroupIds
      .map(groupId => optionGroupsById.get(groupId))
      .filter(group => group && group.options.length > 0);
    if (groups.length === 0) {
      addConfiguredProduct(product, []);
      return;
    }
    setConfiguredOptions(Object.fromEntries(groups.map(group => [group!.id, group!.options[0].id])));
    setConfiguringProduct(product);
  };

  const startPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || isPlacingOrder) return;
    setCheckoutError('');
    setIsPlacingOrder(true);
    try {
      const session = await storePaymentService.createPayment(slug, {
        customerName,
        phone,
        pickupDate,
        pickupSession,
        pickupLocationId,
        notes,
        selections: cart.map(({ productId, quantity, selectedOptions }) => ({
          productId,
          quantity,
          selectedOptions
        }))
      });
      setPaymentSession(session);
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

  const { store, products } = data;
  const region = getRegionConfiguration(store.country);
  const bulkOrderWhatsAppUrl = getBusinessWhatsAppUrl(store.businessWhatsApp);
  const canOrderPickup = store.pickupEnabled
    && store.pickupLocations.length > 0
    && store.pickupSessions.length > 0
    && validPickupDates.length > 0;
  const paymentReturnUrl = (() => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('payment_return', '1');
    return url.toString();
  })();

  return (
    <div className="space-y-8">
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

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Products</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-primary">Available now</h2>
          {products.length > 0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {products.map(product => (
                <article key={product.id} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                  <img src={product.photoUrl} alt={product.name} className="h-52 w-full object-cover" referrerPolicy="no-referrer" />
                  <div className="p-5">
                    <h3 className="font-display text-2xl font-bold text-primary">{product.name}</h3>
                    <p className="mt-2 font-sans text-lg font-extrabold text-secondary">{formatRegionCurrency(product.price, store.currency)}</p>
                    {product.description && <p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
                    {canOrderPickup && (
                      <button type="button" onClick={() => startAddingProduct(product)} className="mt-5 w-full rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
                        {product.optionGroupIds.length > 0 ? 'Choose Options' : 'Add to Cart'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
              <PackageOpen className="mx-auto h-8 w-8 text-primary" />
              <h3 className="mt-4 font-display text-2xl font-bold text-primary">No products available</h3>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Please check back soon.</p>
            </div>
          )}
        </section>

        <aside id="customer-order" className="scroll-mt-24 rounded-3xl border border-surface-container-high bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-primary"><ShoppingCart className="h-5 w-5" /> Your Order</h2>
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
              <p className="mt-2 font-display text-xl font-bold">Payment received</p>
              <dl className="mt-4 grid gap-3 rounded-2xl bg-white/70 p-4">
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Order Number</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.orderNumber}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Date</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{formatPickupDateLabel(placedOrder.pickupDate, store.country)}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Location</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.pickupLocationName}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Pickup Session</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.pickupSession}</dd></div>
                <div><dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-green-700">Payment Method</dt><dd className="mt-0.5 font-sans text-sm font-extrabold">{placedOrder.paymentMethodName}</dd></div>
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                {bulkOrderWhatsAppUrl && <a href={bulkOrderWhatsAppUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-green-800 px-4 py-2.5 font-sans text-xs font-extrabold text-white"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp Us</a>}
                <a href="/" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 font-sans text-xs font-extrabold text-green-800">Explore MiseChef <ArrowRight className="h-3.5 w-3.5" /></a>
              </div>
            </div>
          )}

          {paymentSession ? (
            <div className="mt-5">
              <StorePaymentCheckout
                session={paymentSession}
                customerName={customerName}
                phone={phone}
                currency={store.currency}
                total={cartTotal}
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
                }}
              />
            </div>
          ) : cartDetails.length > 0 ? (
            <>
              <div className="mt-5 space-y-4">
                {cartDetails.map(({ line, product, options, lineTotal }) => product && (
                  <div key={line.key} className="border-b border-surface-container-high pb-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-sans text-sm font-extrabold text-primary">{product.name}</p>
                        {options.map(({ group, option }) => group && option && (
                          <p key={group.id} className="mt-0.5 font-sans text-[11px] font-bold text-on-surface-variant">{group.name}: {option.name}</p>
                        ))}
                      </div>
                      <p className="font-sans text-sm font-extrabold text-secondary">{formatRegionCurrency(lineTotal, store.currency)}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => setCart(current => current.flatMap(item => item.key !== line.key ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))} className="rounded-full bg-surface-container p-2 text-primary"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="min-w-6 text-center font-sans text-xs font-extrabold text-primary">{line.quantity}</span>
                      <button type="button" aria-label={`Add one ${product.name}`} onClick={() => setCart(current => current.map(item => item.key === line.key ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item))} className="rounded-full bg-surface-container p-2 text-primary"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between gap-3 font-sans text-base font-extrabold text-primary">
                <span>Total</span>
                <span>{formatRegionCurrency(cartTotal, store.currency)}</span>
              </div>

              <form onSubmit={startPayment} className="mt-5 space-y-4">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Pickup</p>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Date</span>
                  <select aria-label="Pickup date" required value={pickupDate} onChange={event => setPickupDate(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                    {validPickupDates.map(date => <option key={date} value={date}>{formatPickupDateLabel(date, store.country)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Location</span>
                  <select aria-label="Pickup location" required value={pickupLocationId} onChange={event => setPickupLocationId(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                    {store.pickupLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
                {selectedPickupLocation && (
                  <div className="rounded-2xl bg-surface-container-low p-3 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">
                    <p>{selectedPickupLocation.address}</p>
                    {selectedPickupLocation.notes && <p className="mt-1">{selectedPickupLocation.notes}</p>}
                  </div>
                )}
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Session</span>
                  <select aria-label="Pickup session" required value={pickupSession} onChange={event => setPickupSession(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                    {store.pickupSessions.map(session => <option key={session} value={session}>{session}</option>)}
                  </select>
                </label>
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <p className="font-sans text-xs font-extrabold text-primary">Secure online payment</p>
                  <p className="mt-1 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">
                    Available methods are shown automatically for {region.countryName}.
                  </p>
                </div>
                <p className="pt-1 font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Your details</p>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Name</span>
                  <input aria-label="Name" required autoComplete="name" placeholder="Your name" value={customerName} onChange={event => setCustomerName(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Phone</span>
                  <input aria-label="Phone" required autoComplete="tel" inputMode="tel" placeholder="Your phone number" value={phone} onChange={event => setPhone(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="font-sans text-xs font-extrabold text-primary">Notes <span className="text-outline">(optional)</span></span>
                  <textarea aria-label="Notes" rows={2} placeholder="Anything the Store should know?" value={notes} onChange={event => setNotes(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                </label>
                {checkoutError && <p className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{checkoutError}</p>}
                <button type="submit" disabled={isPlacingOrder} className="w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">{isPlacingOrder ? 'Preparing Payment…' : 'Continue to Payment'}</button>
                <p className="text-center font-sans text-[10px] font-bold text-outline">No login, email, or account required.</p>
              </form>
            </>
          ) : !placedOrder && canOrderPickup ? (
            <p className="mt-5 font-sans text-sm font-bold text-on-surface-variant">Add a product to start your pickup pre-order.</p>
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

      {cartCount > 0 && (
        <a href="#customer-order" className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-full bg-primary px-5 py-3.5 text-on-primary shadow-2xl shadow-primary/30 lg:hidden">
          <span className="font-sans text-sm font-extrabold">View order · {cartCount}</span>
          <span className="font-sans text-sm font-extrabold">{formatRegionCurrency(cartTotal, store.currency)}</span>
        </a>
      )}

      {configuringProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/50 p-0 sm:items-center sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="product-options-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Choose options</p>
                <h2 id="product-options-title" className="mt-1 font-display text-3xl font-bold text-primary">{configuringProduct.name}</h2>
              </div>
              <button type="button" aria-label="Close options" onClick={() => setConfiguringProduct(null)} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 space-y-5">
              {configuringProduct.optionGroupIds.map(groupId => {
                const group = optionGroupsById.get(groupId);
                if (!group) return null;
                return (
                  <fieldset key={group.id}>
                    <legend className="font-sans text-sm font-extrabold text-primary">{group.name}</legend>
                    <div className="mt-2 space-y-2">
                      {group.options.map(option => (
                        <label key={option.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3">
                          <span className="flex items-center gap-3">
                            <input type="radio" name={group.id} checked={configuredOptions[group.id] === option.id} onChange={() => setConfiguredOptions(current => ({ ...current, [group.id]: option.id }))} className="h-4 w-4 text-primary" />
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

            <button type="button" onClick={() => addConfiguredProduct(configuringProduct, configuringProduct.optionGroupIds.map(groupId => ({ groupId, optionId: configuredOptions[groupId] })).filter(selection => selection.optionId))} className="mt-6 w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary">
              Add to Cart
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
