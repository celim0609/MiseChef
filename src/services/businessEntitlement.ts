import type { SubscriptionPlan, SubscriptionStatus } from '../types';

export interface BusinessEntitlementState {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
}

const BUSINESS_PLANS = new Set<SubscriptionPlan>(['starter', 'professional', 'business', 'internal_unlimited']);

export const hasActiveBusinessEntitlement = (
  subscription: BusinessEntitlementState | null | undefined,
  now = new Date()
) => {
  if (!subscription || !BUSINESS_PLANS.has(subscription.subscriptionPlan)) return false;
  if (subscription.subscriptionStatus === 'active') return true;
  if (subscription.subscriptionStatus !== 'trialing' || !subscription.trialEndsAt) return false;
  const trialEndsAt = new Date(subscription.trialEndsAt);
  return !Number.isNaN(trialEndsAt.getTime()) && now < trialEndsAt;
};
