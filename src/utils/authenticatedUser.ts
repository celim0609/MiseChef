const CHEF_PROFILE_STORAGE_KEY = 'ce_lims_kitchen_chef_profile_v1';

export interface AuthenticatedUserIdentity {
  uid: string;
  displayName?: string | null;
}

export const getAuthenticatedDisplayName = (
  user?: Pick<AuthenticatedUserIdentity, 'displayName'> | null
) => user?.displayName?.trim() || '';

export const getAuthenticatedGreeting = (
  baseGreeting: string,
  user?: Pick<AuthenticatedUserIdentity, 'displayName'> | null
) => {
  const greeting = baseGreeting.trim();
  const displayName = getAuthenticatedDisplayName(user);
  return displayName ? `${greeting}, ${displayName}` : greeting;
};

export const getChefProfileStorageKey = (userId?: string | null) => (
  userId ? `${CHEF_PROFILE_STORAGE_KEY}_${userId}` : CHEF_PROFILE_STORAGE_KEY
);
