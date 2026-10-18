// A successful document delete is final even when legacy asset cleanup fails.
export const deleteProductWithCleanup = async (
  deleteDocument: () => Promise<void>,
  cleanup: Array<() => Promise<void>>
): Promise<boolean> => {
  await deleteDocument();
  const results = await Promise.allSettled(cleanup.map(async action => action()));
  return results.some(result => result.status === 'rejected');
};
