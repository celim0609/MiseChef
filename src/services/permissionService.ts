import { subscriptionService, type CompanySubscription, type PlanFeature } from './subscriptionService';
import { usageLimitService, type UsageLimitedResource } from './usageLimitService';

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  requiredPlan: string | null;
}

type FeatureCheck = {
  feature: PlanFeature;
  label: string;
};

const allowed = (): PermissionResult => ({
  allowed: true,
  reason: '',
  requiredPlan: null
});

const formatPlanName = (plan: string) => plan
  .split(/[_-]/g)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const subscriptionInactive = (subscription: CompanySubscription): PermissionResult | null => {
  if (subscription.subscriptionStatus === 'active' || subscription.subscriptionStatus === 'trialing') return null;

  return {
    allowed: false,
    reason: `Your company subscription is ${subscription.subscriptionStatus}.`,
    requiredPlan: subscription.subscriptionPlan
  };
};

const checkActiveSubscription = async (companyId: string): Promise<PermissionResult> => {
  const subscription = await subscriptionService.getCompanySubscription(companyId);
  const inactiveResult = subscriptionInactive(subscription);
  return inactiveResult || allowed();
};

const checkFeature = async (companyId: string, { feature, label }: FeatureCheck): Promise<PermissionResult> => {
  const subscription = await subscriptionService.getCompanySubscription(companyId);
  const inactiveResult = subscriptionInactive(subscription);
  if (inactiveResult) return inactiveResult;

  if (subscriptionService.canPlanUseFeature(subscription.subscriptionPlan, feature)) return allowed();

  const requiredPlan = subscriptionService.getRequiredPlanForFeature(feature);
  return {
    allowed: false,
    reason: `${label} is not available on the ${formatPlanName(subscription.subscriptionPlan)} plan.`,
    requiredPlan
  };
};

const checkUsageLimit = async (companyId: string, resource: UsageLimitedResource, currentUsage = 0): Promise<PermissionResult> => {
  const result = await usageLimitService.canCreateResource(companyId, resource, currentUsage);
  return {
    allowed: result.allowed,
    reason: result.message,
    requiredPlan: result.requiredPlan
  };
};

export const permissionService = {
  canUseDashboard: (companyId: string) => checkActiveSubscription(companyId),
  canUseBusiness: (companyId: string) => checkActiveSubscription(companyId),
  canUseAI: (companyId: string) => checkFeature(companyId, { feature: 'ai', label: 'AI' }),
  canUseInventory: (companyId: string) => checkFeature(companyId, { feature: 'inventory', label: 'Inventory' }),
  canUseInvoice: (companyId: string) => checkFeature(companyId, { feature: 'invoice', label: 'Invoice Import' }),
  canUseSupplier: (companyId: string) => checkFeature(companyId, { feature: 'supplier', label: 'Supplier Management' }),
  canUseReports: (companyId: string) => checkFeature(companyId, { feature: 'reports', label: 'Advanced Reports' }),
  canUseTeam: (companyId: string) => checkFeature(companyId, { feature: 'team', label: 'Team Management' }),
  canExportPDF: (companyId: string) => checkFeature(companyId, { feature: 'exportPDF', label: 'PDF Export' }),

  async canInviteMembers(companyId: string, currentMemberCount = 0) {
    const featureResult = await checkFeature(companyId, { feature: 'team', label: 'Team Management' });
    if (!featureResult.allowed) return featureResult;
    return checkUsageLimit(companyId, 'teamMember', currentMemberCount);
  },

  canCreateRecipe: (companyId: string, currentRecipeCount = 0) => checkUsageLimit(companyId, 'recipe', currentRecipeCount),
  canCreateIngredient: (companyId: string, currentIngredientCount = 0) => checkUsageLimit(companyId, 'ingredient', currentIngredientCount),
  canCreateSupplier: (companyId: string, currentSupplierCount = 0) => checkUsageLimit(companyId, 'supplier', currentSupplierCount),
  canUploadInvoice: (companyId: string, currentInvoiceCount = 0) => checkUsageLimit(companyId, 'invoice', currentInvoiceCount),
  canCreateWorkspace: (companyId: string, currentWorkspaceCount = 0) => checkUsageLimit(companyId, 'workspace', currentWorkspaceCount),
  canCreateTeamMember: (companyId: string, currentMemberCount = 0) => checkUsageLimit(companyId, 'teamMember', currentMemberCount)
};
