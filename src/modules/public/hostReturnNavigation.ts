const HOST_RETURN_TO_PATTERN = /^\/host\/[a-z0-9-]+\/?$/i;
const CUSTOMER_ORDERS_RETURN_TO_PATTERN = /^\/orders\/?$/;
const GROUP_ORDER_RETURN_TO_PATTERN = /^\/group\/[a-z0-9_-]+\/?$/i;

export const getValidatedHostReturnTo = (search: string) => {
  const returnTo = new URLSearchParams(search).get('returnTo');
  return returnTo && HOST_RETURN_TO_PATTERN.test(returnTo) ? returnTo : '';
};

export const replaceWithValidatedHostReturnTo = (
  search: string,
  replace: (hostReturnTo: string) => void
) => {
  const hostReturnTo = getValidatedHostReturnTo(search);
  if (!hostReturnTo) return false;

  replace(hostReturnTo);
  return true;
};

export const getValidatedPublicAccountReturnTo = (search: string) => {
  const returnTo = new URLSearchParams(search).get('returnTo');
  return returnTo && (HOST_RETURN_TO_PATTERN.test(returnTo)
    || CUSTOMER_ORDERS_RETURN_TO_PATTERN.test(returnTo)
    || GROUP_ORDER_RETURN_TO_PATTERN.test(returnTo))
    ? returnTo
    : '';
};

export const replaceWithValidatedPublicAccountReturnTo = (
  search: string,
  replace: (returnTo: string) => void
) => {
  const returnTo = getValidatedPublicAccountReturnTo(search);
  if (!returnTo) return false;
  replace(returnTo);
  return true;
};

export const resolvePublicHostStoreCandidate = (
  routeStoreSlug: string,
  groupStoreSlug: string,
  discoveredStoreSlugs: string[]
) => {
  if (routeStoreSlug) return routeStoreSlug;
  if (groupStoreSlug) return groupStoreSlug;

  const uniqueDiscoveredSlugs = [...new Set(discoveredStoreSlugs.filter(Boolean))];
  return uniqueDiscoveredSlugs.length === 1 ? uniqueDiscoveredSlugs[0] : '';
};

export type PublicHostLookup = {
  status: 'unavailable' | 'loading' | 'host' | 'non-host' | 'unknown';
  storeSlug: string;
  userId: string;
};

export type PublicHostMenuAction = {
  label: 'Host Center' | 'Become a Host';
  href: string;
  description: 'Groups & rewards' | 'Start group orders';
};

export const resolvePublicHostMenuAction = (
  lookup: PublicHostLookup,
  currentStoreCandidate: string,
  currentUserId: string
): PublicHostMenuAction | null => {
  if (!currentUserId || lookup.userId !== currentUserId) return null;
  if (!currentStoreCandidate || lookup.storeSlug !== currentStoreCandidate) return null;
  const href = `/host/${encodeURIComponent(currentStoreCandidate)}`;
  if (lookup.status === 'host') return { label: 'Host Center', href, description: 'Groups & rewards' };
  if (lookup.status === 'non-host') return { label: 'Become a Host', href, description: 'Start group orders' };
  return null;
};

export const resolveLoggedOutPublicAccountLink = (currentHostRouteSlug = '') => {
  const hostHref = currentHostRouteSlug ? `/host/${encodeURIComponent(currentHostRouteSlug)}` : '';
  return { label: 'Login', href: hostHref ? `/login?returnTo=${encodeURIComponent(hostHref)}` : '/login' };
};
