export type ProductSaveStage = 'validation' | 'authorization' | 'option-groups' | 'photo-upload' | 'product-write' | 'cleanup';

const readErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code : 'unknown';
};

export const getProductSaveErrorMessage = (error: unknown, stage: ProductSaveStage) => {
  const code = readErrorCode(error);
  if (code.startsWith('store/') && error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const reason = error && typeof error === 'object' && 'details' in error
    ? (error as { details?: { reason?: unknown } }).details?.reason
    : undefined;
  if (reason === 'subscription-feature-unavailable') {
    return 'Your Workspace plan does not include Store product management.';
  }
  if (reason === 'subscription-inactive') {
    return 'Your Workspace subscription is not active. Review Subscription before saving products.';
  }
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return stage === 'option-groups'
      ? 'An option group was rejected by the Store security checks. Review its selections and try again.'
      : 'This product was rejected by the Store security checks. Refresh the page and confirm your Workspace access.';
  }
  if (code === 'storage/unauthorized') {
    return 'Product photo upload was blocked. Confirm you are the Store Owner, Manager, or Head Chef, then try again.';
  }
  if (code === 'unavailable' || code === 'firestore/unavailable' || code === 'storage/retry-limit-exceeded') {
    return 'The Store service is temporarily unavailable. Check your connection and try again.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return stage === 'photo-upload'
    ? 'Unable to upload the product photo. Please try again.'
    : 'Unable to save this product. Please try again.';
};

export const getProductSaveDiagnostic = ({
  error,
  stage,
  workspaceId,
  storeId,
  operation
}: {
  error: unknown;
  stage: ProductSaveStage;
  workspaceId: string;
  storeId: string;
  operation: 'create' | 'update';
}) => ({
  operation,
  stage,
  code: readErrorCode(error),
  message: error instanceof Error ? error.message : 'Unknown product save failure',
  workspaceId,
  storeId,
  identifiersMatch: workspaceId === storeId
});
