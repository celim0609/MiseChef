import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { BillingCycle, PlanLimits, SubscriptionPlan, SubscriptionStatus, Workspace } from '../types';
import { hasActiveBusinessEntitlement } from './businessEntitlement';
export { hasActiveBusinessEntitlement } from './businessEntitlement';
import {
  canPlanUseFeature,
  formatSubscriptionPlanName,
  getAllPlanDefinitions,
  getPublicPlanDefinitions,
  getLimitValue,
  getPlanDefinition,
  getPlanLimits,
  getRequiredPlanForFeature,
  getRequiredPlanForLimit,
  normalizeSubscriptionPlan,
  UNLIMITED_PLAN_LIMIT,
  type PlanFeature,
  type PlanLimit
} from './subscriptionPlans';

export type SubscriptionFeature = PlanFeature | 'advancedReports' | 'teamManagement';

export type SubscriptionLimitType = keyof PlanLimits;

export interface WorkspaceSubscription {
  workspaceId: string;
  /** @deprecated Alias used by the legacy admin dashboard. */
  companyId: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: BillingCycle;
  subscriptionStartedAt: string;
  subscriptionRenewalAt: string;
  subscriptionCancelledAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  limits: PlanLimits;
}

/** @deprecated Use WorkspaceSubscription. Kept as an alias for existing callers. */
export type CompanySubscription = WorkspaceSubscription;

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const normalizeSubscriptionStatus = (status: unknown): SubscriptionStatus => {
  const normalized = readString(status).toLowerCase();
  if (normalized === 'trialing') return 'trialing';
  if (normalized === 'past_due') return 'past_due';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'suspended') return 'suspended';
  if (normalized === 'active') return 'active';
  return 'suspended';
};

const normalizeBillingCycle = (cycle: unknown): BillingCycle => readString(cycle).toLowerCase() === 'yearly' ? 'yearly' : 'monthly';

const readDate = (value: unknown) => {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate();
  return null;
};

const normalizeWorkspaceSubscription = (workspaceId: string, data: Partial<Workspace> | Record<string, unknown>): WorkspaceSubscription => {
  const raw = data as Record<string, unknown>;
  const now = new Date();
  const subscriptionPlan = normalizeSubscriptionPlan(data.subscriptionPlan);
  const subscriptionStatus = normalizeSubscriptionStatus(data.subscriptionStatus);
  const trialStartedAt = readDate(data.trialStartedAt);
  const trialEndsAt = readDate(data.trialEndsAt);
  const trialDaysRemaining = subscriptionStatus === 'trialing' && trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    workspaceId,
    companyId: workspaceId,
    subscriptionPlan,
    subscriptionStatus,
    billingCycle: normalizeBillingCycle(raw.billingCycle),
    subscriptionStartedAt: readString(raw.subscriptionStartedAt),
    subscriptionRenewalAt: readString(raw.subscriptionRenewalAt),
    subscriptionCancelledAt: raw.subscriptionCancelledAt === null ? null : readString(raw.subscriptionCancelledAt) || null,
    trialStartedAt: trialStartedAt?.toISOString() || null,
    trialEndsAt: trialEndsAt?.toISOString() || null,
    trialDaysRemaining,
    limits: getPlanLimits(subscriptionPlan)
  };
};

const normalizeSubscriptionFeature = (feature: SubscriptionFeature): PlanFeature => {
  if (feature === 'advancedReports') return 'reports';
  if (feature === 'teamManagement') return 'team';
  return feature;
};

export const isSubscriptionStatusActive = (status: SubscriptionStatus) => status === 'active' || status === 'trialing';

export const subscriptionService = {
  getPlanDefinition,
  getAllPlanDefinitions,
  getPublicPlanDefinitions,
  getPlanLimits,
  canPlanUseFeature,
  getLimitValue,
  getRequiredPlanForFeature,
  getRequiredPlanForLimit,
  formatSubscriptionPlanName,
  isSubscriptionStatusActive,
  hasActiveBusinessEntitlement,

  async getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription> {
    if (!db || !workspaceId) {
      return normalizeWorkspaceSubscription(workspaceId, { createdAt: new Date(0).toISOString(), subscriptionPlan: 'free' });
    }

    if (functions) {
      try {
        const getSubscription = httpsCallable<{ workspaceId: string }, Record<string, unknown>>(functions, 'getWorkspaceSubscription');
        const result = await getSubscription({ workspaceId });
        return normalizeWorkspaceSubscription(workspaceId, result.data);
      } catch {
        // Read-only fallback keeps the UI useful while Functions is temporarily unavailable.
      }
    }

    const workspaceSnapshot = await getDoc(doc(db, 'workspaces', workspaceId));
    return normalizeWorkspaceSubscription(workspaceId, workspaceSnapshot.exists() ? workspaceSnapshot.data() : { createdAt: new Date(0).toISOString(), subscriptionPlan: 'free' });
  },

  async getCompanySubscription(workspaceId: string): Promise<WorkspaceSubscription> {
    return this.getWorkspaceSubscription(workspaceId);
  },

  async canUseFeature(companyId: string, feature: SubscriptionFeature): Promise<boolean> {
    const subscription = await this.getCompanySubscription(companyId);
    const normalizedFeature = normalizeSubscriptionFeature(feature);
    if (normalizedFeature === 'recipes') return canPlanUseFeature(subscription.subscriptionPlan, normalizedFeature);
    return hasActiveBusinessEntitlement(subscription) && canPlanUseFeature(subscription.subscriptionPlan, normalizedFeature);
  },

  async isWithinLimit(companyId: string, limitType: SubscriptionLimitType, currentUsage = 0): Promise<boolean> {
    const subscription = await this.getCompanySubscription(companyId);
    const limit = subscription.limits[limitType];
    return limit === UNLIMITED_PLAN_LIMIT || currentUsage < limit;
  }
};

export { formatSubscriptionPlanName, getAllPlanDefinitions, getPublicPlanDefinitions, getLimitValue, getPlanDefinition, getPlanLimits, getRequiredPlanForFeature, getRequiredPlanForLimit, normalizeSubscriptionPlan };
export type { PlanFeature, PlanLimit };
