export type ProductSaveStage = 'validation' | 'option-groups' | 'photo-upload' | 'product-write' | 'cleanup';

const readErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code : 'unknown';
};

export const getProductSaveErrorMessage = (error: unknown, stage: ProductSaveStage) => {
  const code = readErrorCode(error);
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'This product could not be saved because you do not have permission for this Store.';
  }
  if (code === 'storage/unauthorized') {
    return 'Product photo upload was blocked. Confirm you are the Store Owner or Manager, then try again.';
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
