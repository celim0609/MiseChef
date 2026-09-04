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
            {stores.map(store => (
              <a key={store.slug} href={`/store/${encodeURIComponent(store.slug)}`} className="group overflow-hidden rounded-[1.75rem] border border-surface-container-high bg-background shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
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

                <div className="p-5 sm:p-6">
                  <h3 className="font-display text-2xl font-semibold text-primary">{store.name}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 font-sans text-sm font-semibold leading-relaxed text-on-surface-variant">
                    {store.description || 'Explore the menu and order directly from this store.'}
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-surface-container-high pt-4">
                    <span className="font-sans text-sm font-extrabold text-primary">View Store</span>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary transition group-hover:translate-x-0.5">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </PublicSectionState>
      </section>
    </div>
  );
}
