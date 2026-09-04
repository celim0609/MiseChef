import { ArrowRight, Search, Store } from 'lucide-react';
import { PublicSectionState, type PublicSectionStatus } from './PublicContent';
import type { PublicDiscoverStoreSummary } from './publicDiscoverModel';

export default function PublicStoreHomePage({ stores, status }: { stores: PublicDiscoverStoreSummary[]; status: PublicSectionStatus }) {
  return (
    <div>
      <section className="overflow-hidden rounded-[2rem] border border-surface-container-high bg-surface-container-low px-6 py-10 sm:px-10 sm:py-14">
        <div className="max-w-3xl">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">MiseChef Stores</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-primary sm:text-5xl">Good food, from kitchens worth discovering.</h1>
          <p className="mt-4 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant sm:text-base">Browse independent stores on MiseChef, discover what they are serving, and order directly from the kitchen.</p>
          <div className="mt-7 flex max-w-xl items-center gap-3 rounded-2xl border border-surface-container-high bg-background px-4 py-3 text-on-surface-variant shadow-sm">
            <Search className="h-5 w-5 shrink-0" />
            <span className="font-sans text-sm font-semibold">Explore stores on MiseChef</span>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">Stores</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-primary">Order from a Store</h2>
          </div>
          {stores.length > 0 && <p className="hidden font-sans text-xs font-bold text-on-surface-variant sm:block">{stores.length} {stores.length === 1 ? 'store' : 'stores'} available</p>}
        </div>

        <div className="mt-6">
          <PublicSectionState status={status} isEmpty={stores.length === 0} emptyTitle="No stores available yet" emptyMessage="Public stores will appear here when they are available.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map(store => (
                <a key={store.slug} href={`/store/${encodeURIComponent(store.slug)}`} className="group overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  <div className="relative aspect-[16/9] overflow-hidden bg-surface-container-low">
                    {store.imageUrl ? (
                      <img src={store.imageUrl} alt={store.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="inline-flex rounded-2xl bg-primary/10 p-5 text-primary"><Store className="h-8 w-8" /></span>
                      </div>
                    )}
                    <span className="absolute left-4 top-4 rounded-full bg-background/95 px-3 py-1.5 font-sans text-[11px] font-extrabold uppercase tracking-wide text-primary shadow-sm">MiseChef Store</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-display text-xl font-semibold text-primary">{store.name}</h3>
                        <p className="mt-2 line-clamp-2 font-sans text-sm font-semibold leading-relaxed text-on-surface-variant">{store.description || 'Explore the menu and order directly from this store.'}</p>
                      </div>
                      <span className="mt-1 inline-flex shrink-0 rounded-full bg-primary/10 p-2 text-primary transition group-hover:translate-x-0.5"><ArrowRight className="h-4 w-4" /></span>
                    </div>
                    <div className="mt-5 border-t border-surface-container-high pt-4">
                      <span className="font-sans text-xs font-extrabold text-primary">View Store &amp; Order</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </PublicSectionState>
        </div>
      </section>
    </div>
  );
}
