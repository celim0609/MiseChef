import type { User } from 'firebase/auth';
import BrandLogo from '../../components/BrandLogo';
import OriginalPublicLayout from './PublicLayout';
import PublicComplianceFooter from './PublicComplianceFooter';
import PublicPolicyPage from './PublicPolicyPage';
import { resolvePublicRoute } from './publicRoutes';

export default function PublicComplianceLayout({ pathname, currentUser, onSignOut }: { pathname: string; currentUser: User | null; onSignOut: () => Promise<void> }) {
  const route = resolvePublicRoute(pathname);

  if (route?.page === 'policy') {
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
          <PublicPolicyPage policy={route.policy} />
        </main>
        <PublicComplianceFooter />
      </div>
    );
  }

  return (
    <>
      <OriginalPublicLayout pathname={pathname} currentUser={currentUser} onSignOut={onSignOut} />
      <PublicComplianceFooter />
    </>
  );
}
