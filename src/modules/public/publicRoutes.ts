export type PublicRoute =
  | { page: 'home' }
  | { page: 'recipes' }
  | { page: 'recipe'; slug: string }
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

  const recipeMatch = pathname.match(/^\/recipes\/([^/]+)\/?$/);
  if (recipeMatch?.[1]) return { page: 'recipe', slug: readSegment(recipeMatch[1]) };

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
