export type PublicRoute =
  | { page: 'home' }
  | { page: 'recipes' }
  | { page: 'recipe'; slug: string }
  | { page: 'store'; slug: string }
  | { page: 'host'; slug: string }
  | { page: 'group'; shareCode: string }
  | { page: 'orders' }
  | { page: 'chefs' }
  | { page: 'chef'; username: string };

const readSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

export const resolvePublicRoute = (pathname: string): PublicRoute | null => {
  if (pathname === '/') return { page: 'home' };
  if (pathname === '/recipes' || pathname === '/recipes/') return { page: 'recipes' };
  if (pathname === '/chefs' || pathname === '/chefs/') return { page: 'chefs' };
  if (pathname === '/orders' || pathname === '/orders/') return { page: 'orders' };

  const recipeMatch = pathname.match(/^\/recipes\/([^/]+)\/?$/);
  if (recipeMatch?.[1]) return { page: 'recipe', slug: readSegment(recipeMatch[1]) };

  const storeMatch = pathname.match(/^\/store\/([^/]+)\/?$/);
  if (storeMatch?.[1]) return { page: 'store', slug: readSegment(storeMatch[1]) };

  const hostMatch = pathname.match(/^\/host\/([^/]+)\/?$/);
  if (hostMatch?.[1]) return { page: 'host', slug: readSegment(hostMatch[1]) };

  const groupMatch = pathname.match(/^\/group\/([^/]+)\/?$/);
  if (groupMatch?.[1]) return { page: 'group', shareCode: readSegment(groupMatch[1]) };

  const chefMatch = pathname.match(/^\/chef\/([^/]+)\/?$/);
  if (chefMatch?.[1]) return { page: 'chef', username: readSegment(chefMatch[1]) };

  const usernameMatch = pathname.match(/^\/@([^/]+)\/?$/);
  if (usernameMatch?.[1]) return { page: 'chef', username: readSegment(usernameMatch[1]) };

  return null;
};

export const isPublicExperiencePath = (pathname: string) => resolvePublicRoute(pathname) !== null;

export const toPublicSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
