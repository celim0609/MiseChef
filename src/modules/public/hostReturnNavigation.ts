const HOST_RETURN_TO_PATTERN = /^\/host\/[a-z0-9-]+\/?$/i;

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

export const resolvePublicAccountLink = ({
  authenticated,
  currentHostRouteSlug = '',
  validatedHostStoreSlug = ''
}: {
  authenticated: boolean;
  currentHostRouteSlug?: string;
  validatedHostStoreSlug?: string;
}) => {
  const hostStoreSlug = currentHostRouteSlug || validatedHostStoreSlug;
  const hostHref = hostStoreSlug ? `/host/${encodeURIComponent(hostStoreSlug)}` : '';

  if (!authenticated) {
    return { label: 'Login', href: hostHref ? `/login?returnTo=${encodeURIComponent(hostHref)}` : '/login' };
  }

  return hostHref
    ? { label: 'Host Center', href: hostHref }
    : { label: 'Workspace', href: '/app' };
};
