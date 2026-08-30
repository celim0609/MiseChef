export const ONBOARDING_GOALS = ['chef_profile', 'recipes', 'sell_food'] as const;

export type OnboardingGoal = typeof ONBOARDING_GOALS[number];
export type OnboardingStatus = 'pending' | 'completed' | 'skipped' | 'legacy';

export interface UserOnboarding {
  version: 1;
  status: OnboardingStatus;
  goals: OnboardingGoal[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

const isGoal = (value: unknown): value is OnboardingGoal => (
  typeof value === 'string' && ONBOARDING_GOALS.includes(value as OnboardingGoal)
);

export const normalizeOnboarding = (value: unknown): UserOnboarding => {
  if (!value || typeof value !== 'object') {
    return {
      version: 1,
      status: 'legacy',
      goals: [],
      createdAt: '',
      updatedAt: '',
      completedAt: null
    };
  }

  const data = value as Record<string, unknown>;
  const status: OnboardingStatus = data.status === 'pending'
    || data.status === 'completed'
    || data.status === 'skipped'
    ? data.status
    : 'legacy';

  return {
    version: 1,
    status,
    goals: Array.isArray(data.goals) ? [...new Set(data.goals.filter(isGoal))] : [],
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    completedAt: typeof data.completedAt === 'string' ? data.completedAt : null
  };
};

export const getOnboardingDestination = (goals: OnboardingGoal[]) => {
  if (goals.includes('sell_food')) return 'store' as const;
  if (goals.includes('chef_profile')) return 'portfolio' as const;
  if (goals.includes('recipes')) return 'home' as const;
  return 'home' as const;
};
