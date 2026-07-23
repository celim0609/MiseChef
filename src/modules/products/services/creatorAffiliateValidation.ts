export const normalizeCreatorCode = (value: string) => {
  const code = value.trim().toUpperCase();
  return /^MC[0-9]{3,6}$/.test(code) ? code : '';
};

export const requireCreatorLinkVerification = (
  subIdConfirmed: boolean,
  clickReportConfirmed: boolean
) => {
  if (!subIdConfirmed || !clickReportConfirmed) {
    throw new Error('Confirm both the Shopee Sub_id and Click Report before activation.');
  }
};
