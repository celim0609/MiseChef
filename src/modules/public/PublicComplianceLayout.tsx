import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import BrandLogo from '../../components/BrandLogo';
import OriginalPublicLayout from './PublicLayout';
import PublicComplianceFooter from './PublicComplianceFooter';
import PublicPolicyPage from './PublicPolicyPage';
import PublicStoreHomePage from './PublicStoreHomePage';
import { resolvePublicPolicyRoute, resolvePublicRoute } from './publicRoutes';
import { publicDiscoverService } from './services';
import type { PublicDiscoverStoreSummary } from './publicDiscoverModel';
import type { PublicSectionStatus } from './PublicContent';

const PublicStoreHomeExperience = () => {
  const [stores, setStores] = useState<PublicDiscoverStoreSummary[]>([]);
  const [status, setStatus] = useState<PublicSectionStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    publicDiscoverService.getHomepageContent()
      .then(content => {
        if (cancelled) return;
        setStores(content.stores);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStores([]);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-50 border-b border-surface-container-high bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="MiseChef public home">
            <BrandLogo className="h-8 w-auto" />
            <div>
              <p className="font-display text-2xl font-bold italic text-primary">MiseChef</p>
              <p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.18em] text-outline">Stores</p>
            </div>
          </a>
          <nav className="flex items-center gap-2" aria-label="Store navigation">
            <a href="/" className="rounded-full px-4 py-2 font-sans text-xs font-extrabold text-primary hover:bg-surface-container">Home</a>
            <a href="/orders" className="rounded-full border border-primary px-4 py-2 font-sans text-xs font-extrabold text-primary">My Orders</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PublicStoreHomePage stores={stores} status={status} />
      </main>
      <PublicComplianceFooter />
    </div>
  );
};

export default function PublicComplianceLayout({ pathname, currentUser, onSignOut }: { pathname: string; currentUser: User | null; onSignOut: () => Promise<void> }) {
  const policyRoute = resolvePublicPolicyRoute(pathname);
  const publicRoute = resolvePublicRoute(pathname);

  if (policyRoute) {
    return (
      <div className="min-h-screen bg-background text-on-surface">
        <header className="border-b border-surface-container-high bg-background/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <a href="/" className="flex items-center gap-3" aria-label="MiseChef public home">
              <BrandLogo className="h-8 w-auto" />
              <div>
                <p className="font-display text-2xl font-bold italic text-primary">MiseChef</p>
                <p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.18em] text-outline">Legal & Compliance</p>
              </div>
            </a>
            <a href="/" className="rounded-full border border-primary px-4 py-2 font-sans text-xs font-extrabold text-primary">Back to MiseChef</a>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <PublicPolicyPage policy={policyRoute.policy} />
        </main>
        <PublicComplianceFooter />
      </div>
    );
  }

  if (publicRoute?.page === 'stores') {
    return <PublicStoreHomeExperience />;
  }

  return (
    <>
      <OriginalPublicLayout pathname={pathname} currentUser={currentUser} onSignOut={onSignOut} />
      <PublicComplianceFooter />
    </>
  );
}
