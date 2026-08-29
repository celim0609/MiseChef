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
