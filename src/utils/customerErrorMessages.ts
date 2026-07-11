const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || '');

export const isPermissionError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('permission-denied') || message.includes('missing or insufficient permissions');
};

export const getCustomerFriendlyErrorMessage = (error: unknown, fallback: string) => {
  if (isPermissionError(error)) {
    return 'This feature is not included with your current access. Ask the workspace owner for access or upgrade your plan.';
  }

  const message = getErrorMessage(error).trim();
  return message || fallback;
};
