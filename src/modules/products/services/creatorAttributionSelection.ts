export const resolveNextAffiliateCreatorCode = ({
  currentCode,
  availableCode,
  currentProductIds,
  nextProductIds
}: {
  currentCode: string;
  availableCode: string;
  currentProductIds: string[];
  nextProductIds: string[];
}) => {
  if (currentCode) return currentCode;
  const addedProduct = nextProductIds.some(productId => !currentProductIds.includes(productId));
  return addedProduct ? availableCode : '';
};
