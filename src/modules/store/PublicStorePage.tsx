import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Clock3,
  MapPin,
  Minus,
  PackageOpen,
  Plus,
  ShoppingCart,
  Store as StoreIcon,
  Truck,
  X
} from 'lucide-react';
import { formatRegionCurrency, getRegionConfiguration } from '../../regions';
import { storeService } from './services';
import type { CartSelection, PublicStoreData, StoreOrder, StoreProduct } from './types';

interface CartLine extends CartSelection {
  key: string;
}

const today = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

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
  const [pickupDate, setPickupDate] = useState(today);
  const [pickupSession, setPickupSession] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<StoreOrder | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setHasError(false);

    storeService.getPublicStore(slug)
      .then(storeData => {
        if (isCancelled) return;
        setData(storeData);
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

  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || isPlacingOrder) return;
    setCheckoutError('');
    setIsPlacingOrder(true);
    try {
      const order = await storeService.placeOrder(slug, {
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
      setPlacedOrder(order);
      setCart([]);
      setNotes('');
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to place this order. Please try again.');
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
      </section>
    );
  }

  const { store, products } = data;
  const region = getRegionConfiguration(store.country);
  const canOrderPickup = store.pickupEnabled
    && store.pickupLocations.length > 0
    && store.pickupSessions.length > 0;

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
          {store.contactInformation && <p className="mt-3 max-w-3xl whitespace-pre-line font-sans text-xs font-bold leading-relaxed text-on-surface-variant">{store.contactInformation}</p>}
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

        <aside className="rounded-3xl border border-surface-container-high bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-primary"><ShoppingCart className="h-5 w-5" /> Your Order</h2>
            <span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary">{cartCount}</span>
          </div>

          {!canOrderPickup && (
            <p className="mt-5 rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">This Store is currently browse-only. Pickup ordering is not available.</p>
          )}

          {placedOrder && (
            <div className="mt-5 rounded-2xl bg-green-50 p-4 text-green-800">
              <CheckCircle2 className="h-6 w-6" />
              <p className="mt-2 font-display text-xl font-bold">Order placed</p>
              <p className="mt-1 font-sans text-xs font-bold">Reference: {placedOrder.id}</p>
              <p className="mt-1 font-sans text-xs font-bold">{placedOrder.pickupDate} · {placedOrder.pickupSession}</p>
              <p className="mt-1 font-sans text-xs font-bold">{placedOrder.pickupLocationName}</p>
            </div>
          )}

          {cartDetails.length > 0 ? (
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

              <form onSubmit={placeOrder} className="mt-5 space-y-3">
                <input aria-label="Name" required autoComplete="name" placeholder="Name" value={customerName} onChange={event => setCustomerName(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                <input aria-label="Phone" required autoComplete="tel" inputMode="tel" placeholder="Phone" value={phone} onChange={event => setPhone(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                <input aria-label="Pickup date" required type="date" min={today()} value={pickupDate} onChange={event => setPickupDate(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                <select aria-label="Pickup location" required value={pickupLocationId} onChange={event => setPickupLocationId(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                  {store.pickupLocations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.address}</option>)}
                </select>
                <select aria-label="Pickup session" required value={pickupSession} onChange={event => setPickupSession(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary">
                  {store.pickupSessions.map(session => <option key={session} value={session}>{session}</option>)}
                </select>
                <textarea aria-label="Notes" rows={3} placeholder="Notes (optional)" value={notes} onChange={event => setNotes(event.target.value)} className="w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
                {checkoutError && <p className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{checkoutError}</p>}
                <button type="submit" disabled={isPlacingOrder} className="w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">{isPlacingOrder ? 'Placing Order…' : 'Place Order'}</button>
                <p className="text-center font-sans text-[10px] font-bold text-outline">No account or payment required.</p>
              </form>
            </>
          ) : !placedOrder && canOrderPickup ? (
            <p className="mt-5 font-sans text-sm font-bold text-on-surface-variant">Add a product to start your pickup pre-order.</p>
          ) : null}
        </aside>
      </div>

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
