import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { BillingCycle, Company, PlanLimits, SubscriptionPlan, SubscriptionStatus } from '../types';
import {
  canPlanUseFeature,
  getAllPlanDefinitions,
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

export interface CompanySubscription {
  companyId: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: BillingCycle;
  subscriptionStartedAt: string;
  subscriptionRenewalAt: string;
  subscriptionCancelledAt: string | null;
  limits: PlanLimits;
}

const SAMPLE_WORKSPACE_IDS = new Set(['demo_bella_bistro']);

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const normalizeSubscriptionStatus = (status: unknown): SubscriptionStatus => {
  const normalized = readString(status).toLowerCase();
  if (normalized === 'trialing') return 'trialing';
  if (normalized === 'past_due') return 'past_due';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'suspended') return 'suspended';
  return 'active';
};

const normalizeBillingCycle = (cycle: unknown): BillingCycle => readString(cycle).toLowerCase() === 'yearly' ? 'yearly' : 'monthly';

const normalizeCompanySubscription = (companyId: string, data: Partial<Company> | Record<string, unknown>): CompanySubscription => {
  const subscriptionPlan = normalizeSubscriptionPlan(data.subscriptionPlan);

  return {
    companyId,
    subscriptionPlan,
    subscriptionStatus: normalizeSubscriptionStatus(data.subscriptionStatus),
    billingCycle: normalizeBillingCycle(data.billingCycle),
    subscriptionStartedAt: readString(data.subscriptionStartedAt),
    subscriptionRenewalAt: readString(data.subscriptionRenewalAt),
    subscriptionCancelledAt: data.subscriptionCancelledAt === null ? null : readString(data.subscriptionCancelledAt) || null,
    limits: getPlanLimits(subscriptionPlan)
  };
};

const normalizeSubscriptionFeature = (feature: SubscriptionFeature): PlanFeature => {
  if (feature === 'advancedReports') return 'reports';
  if (feature === 'teamManagement') return 'team';
  return feature;
};

export const subscriptionService = {
  getPlanDefinition,
  getAllPlanDefinitions,
  getPlanLimits,
  canPlanUseFeature,
  getLimitValue,
  getRequiredPlanForFeature,
  getRequiredPlanForLimit,

  async getCompanySubscription(companyId: string): Promise<CompanySubscription> {
    if (SAMPLE_WORKSPACE_IDS.has(companyId)) {
      return normalizeCompanySubscription(companyId, {
        subscriptionPlan: 'professional',
        subscriptionStatus: 'active',
        billingCycle: 'monthly'
      });
    }

    if (!db || !companyId) {
      return normalizeCompanySubscription(companyId, {});
    }

    const companySnapshot = await getDoc(doc(db, 'companies', companyId));
    return normalizeCompanySubscription(companyId, companySnapshot.exists() ? companySnapshot.data() : {});
  },

  async canUseFeature(companyId: string, feature: SubscriptionFeature): Promise<boolean> {
    const subscription = await this.getCompanySubscription(companyId);
    return ['active', 'trialing'].includes(subscription.subscriptionStatus) && canPlanUseFeature(subscription.subscriptionPlan, normalizeSubscriptionFeature(feature));
  },

  async isWithinLimit(companyId: string, limitType: SubscriptionLimitType, currentUsage = 0): Promise<boolean> {
    const subscription = await this.getCompanySubscription(companyId);
    const limit = subscription.limits[limitType];
    return limit === UNLIMITED_PLAN_LIMIT || currentUsage < limit;
  }
};

export { getAllPlanDefinitions, getLimitValue, getPlanDefinition, getPlanLimits, getRequiredPlanForFeature, getRequiredPlanForLimit, normalizeSubscriptionPlan };
export type { PlanFeature, PlanLimit };
