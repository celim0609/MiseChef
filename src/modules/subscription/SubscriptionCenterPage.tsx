import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, CreditCard, HardDrive, ScanLine, Sparkles, UsersRound } from 'lucide-react';
import type { Workspace } from '../../types';
import { aiUsageService } from '../../services/aiUsageService';
import { subscriptionService, type CompanySubscription } from '../../services/subscriptionService';
import { UNLIMITED_PLAN_LIMIT, type SubscriptionPlanDefinition } from '../../services/subscriptionPlans';

interface SubscriptionCenterPageProps {
  workspaceId: string;
  currentWorkspace: Workspace | null;
  recipeCount: number;
}

interface UsageItemProps {
  label: string;
  value?: number;
  limit?: number;
  icon: ReactNode;
  comingSoon?: boolean;
}

const formatLabel = (value?: string) => {
  if (!value) return 'Not available';
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatDate = (value?: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatLimit = (limit: number) => limit === UNLIMITED_PLAN_LIMIT ? 'Unlimited' : new Intl.NumberFormat().format(limit);

const UsageItem = ({ label, value = 0, limit = 0, icon, comingSoon = false }: UsageItemProps) => {
  const isUnlimited = limit === UNLIMITED_PLAN_LIMIT;
  const percentage = isUnlimited || limit <= 0 ? 0 : Math.min((value / limit) * 100, 100);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-sans text-sm font-extrabold text-primary">
          <span className="text-secondary">{icon}</span>
          <span>{label}</span>
        </div>
        <span className="font-sans text-xs font-bold text-on-surface-variant">
          {comingSoon ? 'Coming Soon' : isUnlimited ? `${value} used` : `${value} / ${limit}`}
        </span>
      </div>
      {!comingSoon && (
        <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${percentage}%` }} />
        </div>
      )}
    </div>
  );
};

const PlanCard = ({ plan, isCurrent }: { plan: SubscriptionPlanDefinition; isCurrent: boolean; key?: string }) => (
  <article className={`rounded-2xl border p-4 shadow-sm ${isCurrent ? 'border-secondary bg-secondary/5' : 'border-surface-container-high bg-background'}`}>
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-display text-lg font-semibold text-primary">{plan.name}</h3>
      {isCurrent && <span className="rounded-full bg-secondary px-2.5 py-1 font-sans text-[10px] font-extrabold text-on-secondary">Current</span>}
    </div>
    <p className="mt-2 min-h-10 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">{plan.description}</p>
    <dl className="mt-4 space-y-2 border-t border-surface-container-high pt-3">
      {[
        ['Recipes', plan.limits.recipes],
        ['AI requests', plan.limits.aiRequests],
        ['Invoice OCR', plan.limits.invoiceOcr],
        ['Team members', plan.limits.teamMembers]
      ].map(([label, limit]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <dt className="font-sans text-[11px] font-bold text-on-surface-variant">{label}</dt>
          <dd className="font-sans text-xs font-extrabold text-primary">{formatLimit(limit as number)}</dd>
        </div>
      ))}
    </dl>
  </article>
);

export default function SubscriptionCenterPage({ workspaceId, currentWorkspace, recipeCount }: SubscriptionCenterPageProps) {
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [aiUsage, setAiUsage] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    const loadSubscriptionCenter = async () => {
      const [nextSubscription, usageRecords] = await Promise.all([
        subscriptionService.getCompanySubscription(workspaceId),
        aiUsageService.listWorkspaceUsage(workspaceId).catch(() => [])
      ]);

      if (isCancelled) return;
      const now = new Date();
      setSubscription(nextSubscription);
      setAiUsage(usageRecords.filter(record => {
        const createdAt = new Date(record.createdAt);
        return !Number.isNaN(createdAt.getTime())
          && createdAt.getFullYear() === now.getFullYear()
          && createdAt.getMonth() === now.getMonth();
      }).length);
    };

    loadSubscriptionCenter().catch(() => {
      if (!isCancelled) setSubscription(null);
    });

    return () => {
      isCancelled = true;
    };
  }, [workspaceId]);

  const activeSubscription = subscription || {
    companyId: workspaceId,
    subscriptionPlan: 'free' as const,
    subscriptionStatus: 'active' as const,
    billingCycle: 'monthly' as const,
    subscriptionStartedAt: '',
    subscriptionRenewalAt: '',
    subscriptionCancelledAt: null,
    limits: subscriptionService.getPlanLimits('free')
  };
  const currentPlan = subscriptionService.getPlanDefinition(activeSubscription.subscriptionPlan);
  const plans = subscriptionService.getAllPlanDefinitions();
  const teamMembers = currentWorkspace?.members.filter(member => member.status === 'Active').length || 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 py-4 sm:py-6">
      <header>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Workspace subscription</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary sm:text-4xl">Subscription Center</h1>
        <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Plan and usage information for the active workspace.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-secondary" />
            <h2 className="font-display text-xl font-semibold text-primary">Current Plan</h2>
          </div>
          <dl className="mt-5 space-y-3">
            {[
              ['Current Plan', currentPlan.name || 'Not available'],
              ['Subscription Status', formatLabel(activeSubscription.subscriptionStatus)],
              ['Billing Cycle', formatLabel(activeSubscription.billingCycle)],
              ['Renewal Date', formatDate(activeSubscription.subscriptionRenewalAt)]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-surface-container-high pb-2.5 last:border-0">
                <dt className="font-sans text-xs font-bold text-on-surface-variant">{label}</dt>
                <dd className="text-right font-sans text-sm font-extrabold text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-primary">Usage</h2>
          <div className="mt-5 space-y-5">
            <UsageItem label="Recipes" value={recipeCount} limit={activeSubscription.limits.recipeLimit} icon={<BookOpen className="h-4 w-4" />} />
            <UsageItem label="Team Members" value={teamMembers} limit={activeSubscription.limits.teamMemberLimit} icon={<UsersRound className="h-4 w-4" />} />
            <UsageItem label="AI Requests" value={aiUsage} limit={activeSubscription.limits.monthlyAiRequests} icon={<Sparkles className="h-4 w-4" />} />
            <UsageItem label="Invoice OCR" icon={<ScanLine className="h-4 w-4" />} comingSoon />
            <UsageItem label="Storage" icon={<HardDrive className="h-4 w-4" />} comingSoon />
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-primary">Compare Plans</h2>
        <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Existing MiseChef plans and included limits.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {plans.map(plan => <PlanCard key={plan.id} plan={plan} isCurrent={plan.id === activeSubscription.subscriptionPlan} />)}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-surface-container-high bg-primary p-5 text-on-primary shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-on-primary/70">Upgrade</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Need more capacity?</h2>
          <p className="mt-1 font-sans text-sm font-bold text-on-primary/80">Plan upgrades are not available yet.</p>
        </div>
        <button type="button" disabled className="inline-flex w-fit items-center justify-center rounded-full bg-background px-5 py-2.5 font-sans text-xs font-extrabold text-primary opacity-90">
          Upgrade Coming Soon
        </button>
      </section>
    </div>
  );
}
