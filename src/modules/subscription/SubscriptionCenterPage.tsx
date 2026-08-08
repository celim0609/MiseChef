import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, BookOpen, CreditCard, HardDrive, ScanLine, Sparkles, Timer, UsersRound } from 'lucide-react';
import type { Workspace } from '../../types';
import { aiUsageService } from '../../services/aiUsageService';
import { subscriptionService, type CompanySubscription } from '../../services/subscriptionService';
import { UNLIMITED_PLAN_LIMIT } from '../../services/subscriptionPlans';
import PricingExperience from './PricingExperience';

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

export default function SubscriptionCenterPage({ workspaceId, currentWorkspace, recipeCount }: SubscriptionCenterPageProps) {
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [aiUsage, setAiUsage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    setSubscription(null);
    setAiUsage(0);
    setIsLoading(true);
    setLoadError(false);

    const loadSubscriptionCenter = async () => {
      const [nextSubscription, usageRecords] = await Promise.all([
        subscriptionService.getWorkspaceSubscription(workspaceId),
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
      if (!isCancelled) setLoadError(true);
    }).finally(() => {
      if (!isCancelled) setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [workspaceId]);

  const pageHeader = (
    <header>
      <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Workspace subscription</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-primary sm:text-4xl">Subscription Center</h1>
      <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Plan and usage information for the active workspace.</p>
    </header>
  );

  if (!subscription) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 py-4 sm:py-6" aria-busy={isLoading}>
        {pageHeader}
        <section
          role={loadError ? 'alert' : 'status'}
          aria-live="polite"
          className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className={`rounded-2xl bg-primary/10 p-3 text-primary ${isLoading ? 'animate-pulse' : ''}`}>
              <CreditCard className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold text-primary">
                {loadError ? 'Subscription information is unavailable' : 'Loading subscription information'}
              </h2>
              <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">
                {loadError ? 'Refresh the page to try again.' : 'Checking the active workspace plan and usage.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const activeSubscription = subscription;
  const currentPlan = subscriptionService.getPlanDefinition(activeSubscription.subscriptionPlan);
  const teamMembers = currentWorkspace?.members.filter(member => member.status === 'Active').length || 0;
  const reachedLimits = [
    { label: 'recipe', usage: recipeCount, limit: activeSubscription.limits.recipeLimit },
    { label: 'team member', usage: teamMembers, limit: activeSubscription.limits.teamMemberLimit },
    { label: 'monthly AI request', usage: aiUsage, limit: activeSubscription.limits.monthlyAiRequests }
  ].filter(item => item.limit !== UNLIMITED_PLAN_LIMIT && item.usage >= item.limit);
  const nextPlanName = activeSubscription.subscriptionPlan === 'free'
    ? 'Starter'
    : activeSubscription.subscriptionPlan === 'starter'
      ? 'Professional'
      : activeSubscription.subscriptionPlan === 'professional'
        ? 'Business'
        : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 py-4 sm:py-6">
      {pageHeader}

      {activeSubscription.subscriptionStatus === 'trialing' && (
        <section className="relative overflow-hidden rounded-3xl bg-primary p-5 text-on-primary shadow-lg sm:p-6">
          <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-secondary/20" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-2xl bg-white/10 p-3 text-secondary"><Timer className="h-6 w-6" /></span>
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-on-primary/60">Your free trial</p>
                <h2 className="mt-1 font-display text-2xl font-bold">You're on a Professional Trial</h2>
                <p className="mt-1 font-sans text-sm font-bold text-on-primary/75">Upgrade anytime.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center">
              <p className="font-display text-3xl font-bold text-secondary">{activeSubscription.trialDaysRemaining}</p>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-on-primary/70">days remaining</p>
            </div>
          </div>
        </section>
      )}

      {reachedLimits.length > 0 && (
        <section role="alert" className="flex gap-3 rounded-2xl border border-secondary/40 bg-secondary/10 p-5 text-primary">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
          <div>
            <h2 className="font-sans text-base font-extrabold">You've reached the {currentPlan.name} plan limit.</h2>
            <p className="mt-1 font-sans text-sm font-extrabold text-primary">{nextPlanName ? `Upgrade to ${nextPlanName} to continue.` : 'Contact Sales to discuss more capacity.'}</p>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Limit reached: {reachedLimits.map(item => item.label).join(', ')}. Your existing data remains safe and available.</p>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-secondary" />
            <h2 className="font-display text-xl font-semibold text-primary">Current Plan</h2>
          </div>
          <dl className="mt-5 space-y-3">
            {[
              ['Current Plan', currentPlan.name || 'Not available'],
              ['Subscription Status', formatLabel(activeSubscription.subscriptionStatus)]
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

      <section>
        <div className="mb-5">
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Choose what fits</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-primary">Grow without outgrowing your tools</h2>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">See exactly what each upgrade adds to your workspace.</p>
        </div>
        <PricingExperience currentPlan={activeSubscription.subscriptionPlan} inApp />
      </section>
    </div>
  );
}
