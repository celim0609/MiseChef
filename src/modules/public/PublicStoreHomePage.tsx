import { Store } from 'lucide-react';
import { PublicSectionState, type PublicSectionStatus } from './PublicContent';
import type { PublicDiscoverStoreSummary } from './publicDiscoverModel';

export default function PublicStoreHomePage({ stores, status }: { stores: PublicDiscoverStoreSummary[]; status: PublicSectionStatus }) {
  return (
    <div>
      <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">MiseChef Stores</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-primary">Find a Store</h1>
      <p className="mt-2 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">Browse stores on MiseChef and choose where you would like to order.</p>
      <div className="mt-8">
        <PublicSectionState status={status} isEmpty={stores.length === 0} emptyTitle="No stores available yet" emptyMessage="Public stores will appear here when they are available.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map(store => (
              <a key={store.slug} href={`/store/${encodeURIComponent(store.slug)}`} className="group overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex min-h-36 items-center justify-center bg-surface-container-low p-6">
                  <span className="inline-flex rounded-2xl bg-primary/10 p-5 text-primary"><Store className="h-8 w-8" /></span>
                </div>
                <div className="p-5">
                  <h2 className="font-display text-xl font-semibold text-primary">{store.name}</h2>
                  <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">View store and order</p>
                </div>
              </a>
            ))}
          </div>
        </PublicSectionState>
      </div>
    </div>
  );
}
