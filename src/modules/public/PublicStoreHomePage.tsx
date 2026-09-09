import { ArrowRight, ShoppingBag, Store } from 'lucide-react';
import { PublicSectionState, type PublicSectionStatus } from './PublicContent';
import type { PublicDiscoverStoreSummary } from './publicDiscoverModel';

export default function PublicStoreHomePage({ stores, status }: { stores: PublicDiscoverStoreSummary[]; status: PublicSectionStatus }) {
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-[2rem] border border-surface-container-high bg-surface-container-low px-6 py-10 sm:px-10 sm:py-14">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-secondary shadow-sm">
            <ShoppingBag className="h-4 w-4" />
            MiseChef Stores
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight text-primary sm:text-5xl">Good food, ready when you are.</h1>
          <p className="mt-4 max-w-2xl font-sans text-base font-semibold leading-relaxed text-on-surface-variant">
            Discover stores on MiseChef, explore what they are serving, and order directly from the store you choose.
          </p>
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">Explore</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-primary">Stores on MiseChef</h2>
          </div>
          {stores.length > 0 && (
            <p className="hidden font-sans text-sm font-bold text-on-surface-variant sm:block">{stores.length} {stores.length === 1 ? 'store' : 'stores'}</p>
          )}
        </div>

        <PublicSectionState status={status} isEmpty={stores.length === 0} emptyTitle="No stores available yet" emptyMessage="Public stores will appear here when they are available.">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map(store => {
              const productImages = store.products.filter(product => Boolean(product.imageUrl));

              return (
                <article key={store.slug} className="group overflow-hidden rounded-[1.75rem] border border-surface-container-high bg-background shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
                  <a href={`/store/${encodeURIComponent(store.slug)}`} className="block">
                    <div className="relative aspect-[16/9] overflow-hidden bg-surface-container-low">
                      {store.imageUrl ? (
                        <img src={store.imageUrl} alt={store.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="inline-flex rounded-2xl bg-primary/10 p-5 text-primary"><Store className="h-9 w-9" /></span>
                        </div>
                      )}
                      <span className="absolute left-4 top-4 rounded-full bg-background/95 px-3 py-1.5 font-sans text-[11px] font-extrabold uppercase tracking-[0.12em] text-primary shadow-sm">MiseChef Store</span>
                    </div>

                    <div className="p-5 pb-4 sm:p-6 sm:pb-4">
                      <h3 className="font-display text-2xl font-semibold text-primary">{store.name}</h3>
                      <p className="mt-2 line-clamp-2 min-h-10 font-sans text-sm font-semibold leading-relaxed text-on-surface-variant">
                        {store.description || 'Explore the menu and order directly from this store.'}
                      </p>
                    </div>
                  </a>

                  {productImages.length > 0 && (
                    <div className="pb-4">
                      <div className="mb-2 flex items-center justify-between px-5 sm:px-6">
                        <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-on-surface-variant">From the menu</span>
                        <span className="font-sans text-xs font-bold text-on-surface-variant">{productImages.length} {productImages.length === 1 ? 'item' : 'items'}</span>
                      </div>
                      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {productImages.map(product => (
                          <a key={product.id} href={`/store/${encodeURIComponent(store.slug)}`} aria-label={`${product.name} at ${store.name}`} className="relative aspect-square w-[30%] min-w-[30%] snap-start overflow-hidden rounded-2xl bg-surface-container-low sm:w-[31%] sm:min-w-[31%]">
                            <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                            <span className="absolute inset-x-0 bottom-0 bg-primary/75 px-2 py-1.5 font-sans text-[10px] font-bold leading-tight text-on-primary backdrop-blur-sm">
                              {product.name}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <a href={`/store/${encodeURIComponent(store.slug)}`} className="mx-5 mb-5 flex items-center justify-between border-t border-surface-container-high pt-4 sm:mx-6 sm:mb-6">
                    <span className="font-sans text-sm font-extrabold text-primary">View Store</span>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary transition group-hover:translate-x-0.5">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </a>
                </article>
              );
            })}
          </div>
        </PublicSectionState>
      </section>
    </div>
  );
}
