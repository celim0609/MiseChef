import { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { UserRole } from '../../types';
import { adminPageDefinitions } from './pages';
import { AdminAIUsagePage } from './pages/AIUsagePage';
import { AdminApprovedProductsPage } from './pages/ApprovedProductsPage';
import { AdminCompaniesPage } from './pages/CompaniesPage';
import { AdminOverviewPage } from './pages/OverviewPage';
import { AdminSubscriptionsPage } from './pages/SubscriptionsPage';
import { AdminUsersPage } from './pages/UsersPage';
import { AdminWorkspaceQaPage } from './pages/WorkspaceQaPage';

const liveSectionDetails: Record<string, { status: string; subtitle: string }> = {
  Overview: { status: 'Status: LIVE', subtitle: 'Platform Dashboard' },
  Users: { status: 'Status: LIVE', subtitle: 'Manage Platform Users' },
  Companies: { status: 'Status: LIVE', subtitle: 'Manage Companies' },
  'AI Usage': { status: 'Status: LIVE', subtitle: 'AI Usage Dashboard' },
  Subscriptions: { status: 'Status: LIVE', subtitle: 'Subscription Management' },
  'Approved Products': { status: 'Status: LIVE', subtitle: 'Manage Chef Recommendations' },
  'Workspace QA': { status: 'Founder Tool', subtitle: 'Test Multi-Workspace Behaviour' }
};

const getSectionDetails = (title: string) => liveSectionDetails[title] || { status: 'Coming Soon', subtitle: 'Coming Soon' };

interface AdminPageProps {
  currentUser: User;
  currentUserRole: UserRole;
  onWorkspaceCreated: (workspaceId: string) => Promise<void>;
}

export function AdminPage({ currentUser, currentUserRole, onWorkspaceCreated }: AdminPageProps) {
  const [activeSection, setActiveSection] = useState('Overview');
  const activeSectionRef = useRef<HTMLDivElement>(null);

  const handleSectionClick = (sectionTitle: string) => {
    setActiveSection(sectionTitle);
    requestAnimationFrame(() => {
      activeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 sm:p-8 shadow-sm">
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">MiseChef Admin</p>
        <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight">Admin Platform</h2>
        <p className="mt-3 max-w-3xl font-sans text-sm font-bold text-on-surface-variant">
          Super Admin foundation for future platform analytics, SaaS operations, billing, infrastructure, and system health.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminPageDefinitions.map(section => {
          const sectionDetails = getSectionDetails(section.title);

          return (
          <button
            key={section.title}
            type="button"
            onClick={() => handleSectionClick(section.title)}
            className={`rounded-2xl border p-5 text-left shadow-sm transition-all active:scale-[0.99] ${
              activeSection === section.title
                ? 'border-primary bg-primary/5'
                : 'border-surface-container-high bg-white hover:border-primary/30 hover:bg-surface-container-low'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-primary/10 p-2 text-primary">{section.icon}</span>
              <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] ${sectionDetails.status === 'Status: LIVE' ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-outline'}`}>
                {sectionDetails.status}
              </span>
            </div>
            <h3 className="mt-5 font-display text-xl font-bold text-primary">{section.title}</h3>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">{sectionDetails.subtitle}</p>
          </button>
          );
        })}
      </section>

      <div ref={activeSectionRef}>
        {activeSection === 'Overview' ? (
        <AdminOverviewPage />
      ) : activeSection === 'Users' ? (
        <AdminUsersPage />
      ) : activeSection === 'Companies' ? (
        <AdminCompaniesPage />
      ) : activeSection === 'AI Usage' ? (
        <AdminAIUsagePage />
      ) : activeSection === 'Subscriptions' ? (
        <AdminSubscriptionsPage />
      ) : activeSection === 'Approved Products' ? (
        <AdminApprovedProductsPage currentUser={currentUser} />
      ) : activeSection === 'Workspace QA' ? (
        <AdminWorkspaceQaPage
          currentUser={currentUser}
          currentUserRole={currentUserRole}
          onWorkspaceCreated={onWorkspaceCreated}
        />
      ) : (
        <section className="rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm">
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">{activeSection}</p>
          <h3 className="mt-1 font-display text-2xl font-bold text-primary">Coming Soon</h3>
        </section>
        )}
      </div>
    </div>
  );
}
