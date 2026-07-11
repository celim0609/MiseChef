import type { PlanLimits, SubscriptionPlan } from '../types';

export const UNLIMITED_PLAN_LIMIT = -1;

export type PlanFeature =
  | 'recipes'
  | 'ingredients'
  | 'suppliers'
  | 'invoiceOcr'
  | 'aiRequests'
  | 'teamMembers'
  | 'reports'
  | 'export'
  | 'multipleWorkspaces'
  | 'inventory'
  | 'ai'
  | 'invoice'
  | 'supplier'
  | 'team'
  | 'exportPDF';

export type PlanLimit =
  | 'recipes'
  | 'ingredients'
  | 'suppliers'
  | 'invoices'
  | 'invoiceOcr'
  | 'aiRequests'
  | 'aiTokens'
  | 'aiCostBudgetUSD'
  | 'teamMembers'
  | 'storageMB'
  | 'workspaces'
  | 'recipe'
  | 'supplier'
  | 'invoice'
  | 'teamMember';

export interface SubscriptionPlanDefinition {
  id: SubscriptionPlan;
  name: string;
  description: string;
  features: Record<Exclude<PlanFeature, 'ai' | 'invoice' | 'supplier' | 'team' | 'exportPDF'>, boolean>;
  limits: Record<Exclude<PlanLimit, 'recipe' | 'supplier' | 'invoice' | 'teamMember'>, number>;
}

export const SUBSCRIPTION_PLAN_ORDER: SubscriptionPlan[] = ['free', 'starter', 'professional', 'business', 'enterprise'];

const enabledCoreFeatures = {
  recipes: true,
  ingredients: true,
  suppliers: true,
  invoiceOcr: true,
  aiRequests: true,
  teamMembers: false,
  reports: false,
  export: false,
  multipleWorkspaces: true,
  inventory: false
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, SubscriptionPlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Starter workspace for trying MiseChef.',
    features: {
      ...enabledCoreFeatures
    },
    limits: {
      recipes: 25,
      ingredients: UNLIMITED_PLAN_LIMIT,
      suppliers: 5,
      invoices: 10,
      invoiceOcr: 10,
      aiRequests: 25,
      aiTokens: 250_000,
      aiCostBudgetUSD: 2,
      teamMembers: 1,
      storageMB: 250,
      workspaces: UNLIMITED_PLAN_LIMIT
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Small kitchen workspace with expanded capacity.',
    features: {
      ...enabledCoreFeatures,
      export: true
    },
    limits: {
      recipes: 150,
      ingredients: UNLIMITED_PLAN_LIMIT,
      suppliers: 25,
      invoices: 75,
      invoiceOcr: 75,
      aiRequests: 250,
      aiTokens: 2_500_000,
      aiCostBudgetUSD: 20,
      teamMembers: 3,
      storageMB: 1_000,
      workspaces: UNLIMITED_PLAN_LIMIT
    }
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Professional restaurant workspace for demos and active operations.',
    features: {
      ...enabledCoreFeatures,
      teamMembers: true,
      reports: true,
      export: true
    },
    limits: {
      recipes: 1_000,
      ingredients: UNLIMITED_PLAN_LIMIT,
      suppliers: 100,
      invoices: 500,
      invoiceOcr: 500,
      aiRequests: 1_000,
      aiTokens: 10_000_000,
      aiCostBudgetUSD: 75,
      teamMembers: 10,
      storageMB: 5_000,
      workspaces: UNLIMITED_PLAN_LIMIT
    }
  },
  business: {
    id: 'business',
    name: 'Business',
    description: 'Multi-role restaurant operations workspace.',
    features: {
      ...enabledCoreFeatures,
      teamMembers: true,
      reports: true,
      export: true,
      inventory: true
    },
    limits: {
      recipes: 5_000,
      ingredients: UNLIMITED_PLAN_LIMIT,
      suppliers: 500,
      invoices: 2_500,
      invoiceOcr: 2_500,
      aiRequests: 5_000,
      aiTokens: 50_000_000,
      aiCostBudgetUSD: 250,
      teamMembers: 50,
      storageMB: 25_000,
      workspaces: UNLIMITED_PLAN_LIMIT
    }
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Enterprise-scale platform access.',
    features: {
      recipes: true,
      ingredients: true,
      suppliers: true,
      invoiceOcr: true,
      aiRequests: true,
      teamMembers: true,
      reports: true,
      export: true,
      multipleWorkspaces: true,
      inventory: true
    },
    limits: {
      recipes: UNLIMITED_PLAN_LIMIT,
      ingredients: UNLIMITED_PLAN_LIMIT,
      suppliers: UNLIMITED_PLAN_LIMIT,
      invoices: UNLIMITED_PLAN_LIMIT,
      invoiceOcr: UNLIMITED_PLAN_LIMIT,
      aiRequests: UNLIMITED_PLAN_LIMIT,
      aiTokens: UNLIMITED_PLAN_LIMIT,
      aiCostBudgetUSD: UNLIMITED_PLAN_LIMIT,
      teamMembers: UNLIMITED_PLAN_LIMIT,
      storageMB: UNLIMITED_PLAN_LIMIT,
      workspaces: UNLIMITED_PLAN_LIMIT
    }
  }
};

const featureAliases: Record<PlanFeature, keyof SubscriptionPlanDefinition['features']> = {
  recipes: 'recipes',
  ingredients: 'ingredients',
  suppliers: 'suppliers',
  invoiceOcr: 'invoiceOcr',
  aiRequests: 'aiRequests',
  teamMembers: 'teamMembers',
  reports: 'reports',
  export: 'export',
  multipleWorkspaces: 'multipleWorkspaces',
  inventory: 'inventory',
  ai: 'aiRequests',
  invoice: 'invoiceOcr',
  supplier: 'suppliers',
  team: 'teamMembers',
  exportPDF: 'export'
};

const limitAliases: Record<PlanLimit, keyof SubscriptionPlanDefinition['limits']> = {
  recipes: 'recipes',
  ingredients: 'ingredients',
  suppliers: 'suppliers',
  invoices: 'invoices',
  invoiceOcr: 'invoiceOcr',
  aiRequests: 'aiRequests',
  aiTokens: 'aiTokens',
  aiCostBudgetUSD: 'aiCostBudgetUSD',
  teamMembers: 'teamMembers',
  storageMB: 'storageMB',
  workspaces: 'workspaces',
  recipe: 'recipes',
  supplier: 'suppliers',
  invoice: 'invoices',
  teamMember: 'teamMembers'
};

export const normalizeSubscriptionPlan = (plan: unknown): SubscriptionPlan => {
  const normalized = typeof plan === 'string' ? plan.trim().toLowerCase() : '';
  if (normalized === 'starter') return 'starter';
  if (normalized === 'professional') return 'professional';
  if (normalized === 'business') return 'business';
  if (normalized === 'enterprise') return 'enterprise';
  return 'free';
};

export const getPlanDefinition = (plan: unknown): SubscriptionPlanDefinition => SUBSCRIPTION_PLANS[normalizeSubscriptionPlan(plan)];

export const getAllPlanDefinitions = (): SubscriptionPlanDefinition[] => SUBSCRIPTION_PLAN_ORDER.map(plan => SUBSCRIPTION_PLANS[plan]);

export const getPlanLimits = (plan: unknown): PlanLimits => {
  const definition = getPlanDefinition(plan);

  return {
    aiCreditsMonthly: definition.limits.aiRequests,
    monthlyAiRequests: definition.limits.aiRequests,
    monthlyAiTokens: definition.limits.aiTokens,
    monthlyAiCostBudgetUSD: definition.limits.aiCostBudgetUSD,
    teamMemberLimit: definition.limits.teamMembers,
    storageLimitMB: definition.limits.storageMB,
    recipeLimit: definition.limits.recipes,
    ingredientLimit: definition.limits.ingredients,
    invoiceLimit: definition.limits.invoices,
    supplierLimit: definition.limits.suppliers,
    workspaceLimit: definition.limits.workspaces,
    canExportPDF: definition.features.export,
    canUseAdvancedReports: definition.features.reports,
    canUseTeamManagement: definition.features.teamMembers,
    canUseInventory: definition.features.inventory,
    canUseMultipleWorkspaces: definition.features.multipleWorkspaces
  };
};

const hasPositiveLimit = (limit: number) => limit === UNLIMITED_PLAN_LIMIT || limit > 0;

export const canPlanUseFeature = (plan: unknown, feature: PlanFeature) => {
  const definition = getPlanDefinition(plan);
  const canonicalFeature = featureAliases[feature];
  const relatedLimit = canonicalFeature === 'aiRequests'
    ? definition.limits.aiRequests
    : canonicalFeature === 'invoiceOcr'
      ? definition.limits.invoiceOcr
      : canonicalFeature === 'suppliers'
        ? definition.limits.suppliers
        : canonicalFeature === 'recipes'
          ? definition.limits.recipes
          : canonicalFeature === 'ingredients'
            ? definition.limits.ingredients
            : canonicalFeature === 'teamMembers'
              ? definition.limits.teamMembers
              : null;

  return definition.features[canonicalFeature] && (relatedLimit === null || hasPositiveLimit(relatedLimit));
};

export const getLimitValue = (plan: unknown, limit: PlanLimit) => {
  const definition = getPlanDefinition(plan);
  return definition.limits[limitAliases[limit]];
};

export const getRequiredPlanForFeature = (feature: PlanFeature) => {
  return SUBSCRIPTION_PLAN_ORDER.find(plan => canPlanUseFeature(plan, feature)) || 'enterprise';
};

export const getRequiredPlanForLimit = (limit: PlanLimit, requestedUsage = 1) => {
  return SUBSCRIPTION_PLAN_ORDER.find(plan => {
    const planLimit = getLimitValue(plan, limit);
    return planLimit === UNLIMITED_PLAN_LIMIT || requestedUsage <= planLimit;
  }) || 'enterprise';
};

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = SUBSCRIPTION_PLAN_ORDER.reduce((acc, plan) => {
  acc[plan] = getPlanLimits(plan);
  return acc;
}, {} as Record<SubscriptionPlan, PlanLimits>);
