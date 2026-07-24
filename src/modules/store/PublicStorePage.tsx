import { useEffect, useState } from 'react';
import { Clock3, MapPin, PackageOpen, Store as StoreIcon, Truck } from 'lucide-react';
import { formatRegionCurrency, getRegionConfiguration } from '../../regions';
import { storeService } from './services';
import type { PublicStoreData } from './types';

export default function PublicStorePage({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicStoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setHasError(false);

    storeService.getPublicStore(slug)
      .then(storeData => {
        if (!isCancelled) setData(storeData);
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
            {store.pickupEnabled && <span className="rounded-full bg-green-100 px-4 py-2 font-sans text-xs font-extrabold text-green-800">Pickup available</span>}
            {store.deliveryEnabled && <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 font-sans text-xs font-extrabold text-green-800"><Truck className="h-4 w-4" /> Delivery available</span>}
          </div>
        </div>
      </section>

      <section>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Products</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-primary">Available now</h2>
        {products.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(product => (
              <article key={product.id} className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
                <img src={product.photoUrl} alt={product.name} className="h-52 w-full object-cover" referrerPolicy="no-referrer" />
                <div className="p-5">
                  <h3 className="font-display text-2xl font-bold text-primary">{product.name}</h3>
                  <p className="mt-2 font-sans text-lg font-extrabold text-secondary">{formatRegionCurrency(product.price, store.currency)}</p>
                  {product.description && <p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{product.description}</p>}
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
    </div>
  );
}
