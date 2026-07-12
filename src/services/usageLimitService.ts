import { formatSubscriptionPlanName, subscriptionService, type PlanLimit } from './subscriptionService';
import { UNLIMITED_PLAN_LIMIT } from './subscriptionPlans';

export type UsageLimitedResource = 'recipe' | 'ingredient' | 'supplier' | 'invoice' | 'teamMember' | 'workspace';

export interface UsageLimitResult {
  allowed: boolean;
  message: string;
  currentUsage: number;
  limit: number;
  requiredPlan: string | null;
}

const RESOURCE_LIMITS: Record<UsageLimitedResource, { limit: PlanLimit; label: string }> = {
  recipe: { limit: 'recipe', label: 'recipe' },
  ingredient: { limit: 'ingredients', label: 'ingredient' },
  supplier: { limit: 'supplier', label: 'supplier' },
  invoice: { limit: 'invoice', label: 'invoice upload' },
  teamMember: { limit: 'teamMember', label: 'team member' },
  workspace: { limit: 'workspaces', label: 'workspace' }
};

const allowed = (currentUsage: number, limit = UNLIMITED_PLAN_LIMIT): UsageLimitResult => ({
  allowed: true,
  message: '',
  currentUsage,
  limit,
  requiredPlan: null
});

export const usageLimitService = {
  async canCreateResource(companyId: string, resource: UsageLimitedResource, currentUsage = 0): Promise<UsageLimitResult> {
    if (!companyId) return allowed(currentUsage);

    const config = RESOURCE_LIMITS[resource];

    try {
      const subscription = await subscriptionService.getCompanySubscription(companyId);
      const limit = subscriptionService.getLimitValue(subscription.subscriptionPlan, config.limit);

      if (limit === UNLIMITED_PLAN_LIMIT || currentUsage < limit) {
        return allowed(currentUsage, limit);
      }

      const requiredPlan = subscriptionService.getRequiredPlanForLimit(config.limit, currentUsage + 1);
      const currentPlanName = formatSubscriptionPlanName(subscription.subscriptionPlan);
      const requiredPlanName = formatSubscriptionPlanName(requiredPlan);

      return {
        allowed: false,
        message: `You've reached your ${currentPlanName} Plan ${config.label} limit (${limit}). Upgrade to ${requiredPlanName} to continue.`,
        currentUsage,
        limit,
        requiredPlan
      };
    } catch (err) {
      return allowed(currentUsage);
    }
  }
};
